"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import {
  AdminAuthorizationError,
  assertAdminMutationOrigin,
  getAdminAuthClient,
  requireRecentAal2,
  requireAdminRole,
  safeAdminReturnPath,
} from "./auth";
import { AdminRepositoryError, getAdminRepository } from "./repository";
import {
  approveAdminOwnerRecovery,
  changeAdminStaffState,
  getAdminOwnerRecoveryContext,
  isProductionStaffInviteEnvironment,
  requestAdminOwnerRecovery,
} from "./staff";
import {
  archiveAdminTaxonomy,
  upsertAdminTaxonomy,
} from "./taxonomy";
import {
  createAdminReleaseBatch,
  publishAdminReleaseBatch,
  setAdminReleaseBatchReadiness,
} from "./release-batches";
import {
  adminMediaStatusLabel,
  getAdminMediaTransitionSpec,
} from "./media-review";
import type { AdminActionState } from "./types";
import {
  inventoryMovementFromFormData,
  mediaLinkInputFromFormData,
  priceInputFromFormData,
  productInputFromFormData,
  readinessInputFromFormData,
  variantInputFromFormData,
} from "./validation";
import { getPrivilegedSupabaseClient } from "@/lib/supabase/request-clients";

const emailSchema = z.string().trim().email("請輸入有效的 Email。");
const passwordSchema = z.string().min(12, "密碼至少需要 12 個字元。").max(128);
const totpSchema = z.string().trim().regex(/^\d{6}$/, "請輸入 6 位數驗證碼。");
const staffInviteSchema = z.strictObject({
  email: emailSchema,
  displayName: z.string().trim().min(2, "請輸入顯示名稱。").max(100),
  role: z.enum(["owner", "merchandiser", "fulfillment", "support"]),
});
const staffStateSchema = z.strictObject({
  userId: z.string().uuid("請提供有效的管理員 user ID。"),
  expectedVersion: z.coerce.number().int().positive(),
  state: z.enum(["active", "suspended", "revoked"]),
  role: z.enum(["owner", "merchandiser", "fulfillment", "support"]),
});
const recoveryRequestSchema = z.strictObject({
  reason: z.string().trim().min(10, "復原原因至少需要 10 個字元。").max(500),
});
const recoveryApprovalSchema = z.strictObject({
  requestId: z.string().uuid("請提供有效的復原申請 ID。"),
  expectedVersion: z.coerce.number().int().positive(),
});
const taxonomySchema = z.strictObject({
  kind: z.enum(["category", "chapter"]),
  id: z.preprocess(
    (value) => value === "" || value === null ? null : value,
    z.string().trim().min(1).max(120).nullable(),
  ),
  expectedVersion: z.preprocess(
    (value) => value === "" || value === null ? null : value,
    z.coerce.number().int().positive().nullable(),
  ),
  code: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  nameEn: z.string().trim().min(1).max(120),
  nameZh: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  routeSegment: z.string().trim().min(2).max(120).regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "網址路徑只能使用小寫英數字與連字號。",
  ),
  sortOrder: z.coerce.number().int().positive().max(10_000),
});
const taxonomyArchiveSchema = z.strictObject({
  kind: z.enum(["category", "chapter"]),
  id: z.string().trim().min(1).max(120),
  expectedVersion: z.coerce.number().int().positive(),
});
const safeAggregateId = z.string().trim().min(1).max(128).regex(
  /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
  "ID 只能使用英數字、底線與連字號。",
);
const releaseBatchCreateSchema = z.strictObject({
  chapterId: safeAggregateId,
  name: z.string().trim().min(3).max(160),
  productIds: z.array(safeAggregateId).min(1).max(100),
});
const releaseBatchReadinessSchema = z.strictObject({
  batchId: safeAggregateId,
  expectedVersion: z.coerce.number().int().positive(),
  state: z.enum(["draft", "review", "ready", "blocked"]),
});
const releaseBatchPublishSchema = z.strictObject({
  batchId: safeAggregateId,
  expectedVersion: z.coerce.number().int().positive(),
});
const mediaTransitionSchema = z.strictObject({
  productId: safeAggregateId,
  assetId: safeAggregateId,
  expectedAssetVersion: z.coerce.number().int().positive(),
  toStatus: z.enum([
    "draft",
    "review",
    "live-approved",
    "revocation-pending",
    "revoked",
  ]),
  backupAcknowledged: z.boolean(),
  reason: z.preprocess(
    (value) => value === "" || value === null ? null : value,
    z.string().trim().max(500, "原因不可超過 500 個字元。").nullable(),
  ),
});

function idempotencyKey(formData: FormData): string {
  const supplied = formData.get("idempotencyKey");
  return typeof supplied === "string" && supplied.length >= 16 ? supplied : randomUUID();
}

function requestDigest(operation: string, payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify({ operation, payload }))
    .digest("hex");
}

function errorState(error: unknown): AdminActionState<never> {
  unstable_rethrow(error);
  if (error instanceof z.ZodError) {
    const fieldErrors = Object.fromEntries(
      error.issues.map((issue) => [String(issue.path[0] ?? "form"), issue.message]),
    );
    return { status: "error", code: "VALIDATION_ERROR", message: "請檢查標示的欄位。", fieldErrors };
  }
  if (error instanceof AdminRepositoryError) {
    return { status: "error", code: error.code, message: error.message };
  }
  if (error instanceof AdminAuthorizationError) {
    return { status: "error", code: error.code, message: error.message };
  }
  return { status: "error", code: "ADMIN_ACTION_FAILED", message: "操作失敗，請稍後再試。" };
}

export async function signInAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await assertAdminMutationOrigin();
    const email = emailSchema.parse(formData.get("email"));
    const password = passwordSchema.parse(formData.get("password"));
    const returnPath = safeAdminReturnPath(formData.get("returnPath"));
    const client = await getAdminAuthClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { status: "error", code: "SIGN_IN_FAILED", message: "Email 或密碼不正確。" };
    const { data: factors } = await client.auth.mfa.listFactors();
    const verifiedTotp = factors?.totp.filter((factor) => factor.status === "verified") ?? [];
    if (verifiedTotp.length < 2) redirect(`/admin/mfa/setup?returnPath=${encodeURIComponent(returnPath)}`);
    redirect(`/admin/mfa/challenge?returnPath=${encodeURIComponent(returnPath)}`);
  } catch (error) {
    return errorState(error);
  }
}

export async function confirmInviteAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await assertAdminMutationOrigin();
    const rawTokenHash = formData.get("tokenHash");
    const tokenHash =
      typeof rawTokenHash === "string" && rawTokenHash.length > 0
        ? z.string().min(20).parse(rawTokenHash)
        : null;
    const password = passwordSchema.parse(formData.get("password"));
    const confirmation = z.string().parse(formData.get("passwordConfirmation"));
    if (password !== confirmation) {
      return { status: "error", code: "PASSWORD_MISMATCH", message: "兩次輸入的密碼不一致。" };
    }
    const client = await getAdminAuthClient();
    if (tokenHash) {
      const { error: verifyError } = await client.auth.verifyOtp({
        token_hash: tokenHash,
        type: "invite",
      });
      if (verifyError) {
        return {
          status: "error",
          code: "INVITE_INVALID",
          message: "邀請連結已失效，請聯絡 Owner 重新邀請。",
        };
      }
    } else {
      // Supabase's hosted default invitation template verifies first and
      // redirects with an authenticated session in the URL fragment. The
      // client bridge persists that session into SSR cookies before this
      // action runs, so both the default and TokenHash templates are safe.
      const {
        data: { user },
        error: userError,
      } = await client.auth.getUser();
      if (userError || !user) {
        return {
          status: "error",
          code: "INVITE_SESSION_REQUIRED",
          message: "邀請驗證尚未完成，請重新開啟 Email 中的完整連結。",
        };
      }
    }
    const { error: updateError } = await client.auth.updateUser({ password });
    if (updateError) return { status: "error", code: "PASSWORD_UPDATE_FAILED", message: "無法設定密碼，請稍後再試。" };
    redirect("/admin/mfa/setup");
  } catch (error) {
    return errorState(error);
  }
}

export interface MfaEnrollmentData {
  readonly factorId: string;
  readonly qrCode: string;
  readonly secret: string;
}

export async function beginMfaEnrollmentAction(
  _previous: AdminActionState<MfaEnrollmentData>,
  formData: FormData,
): Promise<AdminActionState<MfaEnrollmentData>> {
  try {
    await assertAdminMutationOrigin();
    const label = formData.get("label") === "backup" ? "LIGNÉE 備用驗證器" : "LIGNÉE 主要驗證器";
    const client = await getAdminAuthClient();
    const { data, error } = await client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: label,
      issuer: "LIGNÉE Estate",
    });
    if (error) return { status: "error", code: "MFA_ENROLL_FAILED", message: "無法建立驗證器，請重新登入後再試。" };
    return {
      status: "success",
      message: "請掃描 QR Code，並輸入驗證器顯示的 6 位數代碼。",
      data: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret },
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function verifyMfaEnrollmentAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await assertAdminMutationOrigin();
    const factorId = z.string().uuid().parse(formData.get("factorId"));
    const code = totpSchema.parse(formData.get("code"));
    const client = await getAdminAuthClient();
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) return { status: "error", code: "MFA_VERIFY_FAILED", message: "驗證碼不正確或已過期。" };
    revalidatePath("/admin", "layout");
    redirect("/admin/mfa/setup");
  } catch (error) {
    return errorState(error);
  }
}

export async function verifyMfaChallengeAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await assertAdminMutationOrigin();
    const factorId = z.string().uuid().parse(formData.get("factorId"));
    const code = totpSchema.parse(formData.get("code"));
    const returnPath = safeAdminReturnPath(formData.get("returnPath"));
    const client = await getAdminAuthClient();
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) return { status: "error", code: "MFA_CHALLENGE_FAILED", message: "驗證碼不正確或已過期。" };
    revalidatePath("/admin", "layout");
    redirect(returnPath);
  } catch (error) {
    return errorState(error);
  }
}

export async function logoutAction(): Promise<void> {
  await assertAdminMutationOrigin();
  try {
    const client = await getAdminAuthClient();
    await client.auth.signOut({ scope: "local" });
  } finally {
    redirect("/admin/sign-in");
  }
}

export async function createProductAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await assertAdminMutationOrigin();
    const actor = await requireAdminRole(["owner", "merchandiser"]);
    const product = await getAdminRepository().createProduct(productInputFromFormData(formData), {
      actor,
      idempotencyKey: idempotencyKey(formData),
    });
    revalidatePath("/admin/products");
    redirect(`/admin/products/${product.id}?created=1`);
  } catch (error) {
    return errorState(error);
  }
}

export async function updateProductAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await assertAdminMutationOrigin();
    const actor = await requireAdminRole(["owner", "merchandiser"]);
    const id = z.string().min(1).parse(formData.get("id"));
    const expectedVersion = z.coerce.number().int().positive().parse(formData.get("expectedVersion"));
    await getAdminRepository().updateProduct(id, productInputFromFormData(formData), {
      actor,
      expectedVersion,
      idempotencyKey: idempotencyKey(formData),
    });
    revalidatePath(`/admin/products/${id}`);
    revalidatePath("/admin/products");
    return { status: "success", message: "草稿已儲存。" };
  } catch (error) {
    return errorState(error);
  }
}

export async function publishProductAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await assertAdminMutationOrigin();
    const actor = await requireAdminRole(["owner"]);
    await requireRecentAal2();
    const id = z.string().min(1).parse(formData.get("id"));
    const expectedVersion = z.coerce.number().int().positive().parse(formData.get("expectedVersion"));
    await getAdminRepository().publishProduct(id, {
      actor,
      expectedVersion,
      idempotencyKey: idempotencyKey(formData),
    });
    revalidatePath(`/admin/products/${id}`);
    revalidatePath("/admin/products");
    return { status: "success", message: "已建立新的發布版本。" };
  } catch (error) {
    return errorState(error);
  }
}

export async function archiveProductAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await assertAdminMutationOrigin();
    const actor = await requireAdminRole(["owner"]);
    await requireRecentAal2();
    const id = z.string().min(1).parse(formData.get("id"));
    const expectedVersion = z.coerce.number().int().positive().parse(formData.get("expectedVersion"));
    await getAdminRepository().archiveProduct(id, {
      actor,
      expectedVersion,
      idempotencyKey: idempotencyKey(formData),
    });
    revalidatePath(`/admin/products/${id}`);
    revalidatePath("/admin/products");
    return { status: "success", message: "商品已封存，保留所有歷史版本。" };
  } catch (error) {
    return errorState(error);
  }
}

export async function upsertVariantAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await assertAdminMutationOrigin();
    let actor = await requireAdminRole(["owner", "merchandiser"]);
    const productId = z.string().min(1).parse(formData.get("productId"));
    const expectedVersion = z.coerce.number().int().positive().parse(formData.get("expectedVersion"));
    const input = variantInputFromFormData(formData);
    if (input.factsStatus === "approved" || input.enabled) {
      actor = await requireAdminRole(["owner"]);
      await requireRecentAal2();
    }
    await getAdminRepository().upsertVariant(productId, input, {
      actor,
      expectedVersion,
      idempotencyKey: idempotencyKey(formData),
    });
    revalidatePath(`/admin/products/${productId}`);
    revalidatePath("/admin/products");
    revalidatePath("/admin/inventory");
    return { status: "success", message: input.variantId ? "SKU 已更新。" : "SKU 已建立。" };
  } catch (error) {
    return errorState(error);
  }
}

export async function addPriceAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await assertAdminMutationOrigin();
    const actor = await requireAdminRole(["owner"]);
    await requireRecentAal2();
    const productId = z.string().min(1).parse(formData.get("productId"));
    const expectedVersion = z.coerce.number().int().positive().parse(formData.get("expectedVersion"));
    const input = priceInputFromFormData(formData);
    await getAdminRepository().addPrice(input, {
      actor,
      expectedVersion,
      idempotencyKey: idempotencyKey(formData),
    });
    revalidatePath(`/admin/products/${productId}`);
    revalidatePath("/admin/products");
    return { status: "success", message: "新的價格版本已加入；既有價格未被覆寫。" };
  } catch (error) {
    return errorState(error);
  }
}

export async function setReadinessAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await assertAdminMutationOrigin();
    const actor = await requireAdminRole(["owner"]);
    await requireRecentAal2();
    const productId = z.string().min(1).parse(formData.get("productId"));
    const expectedVersion = z.coerce.number().int().positive().parse(formData.get("expectedVersion"));
    const input = readinessInputFromFormData(formData);
    await getAdminRepository().setReadiness(
      productId,
      input.code,
      input.state,
      input.evidenceReference,
      {
        actor,
        expectedVersion,
        idempotencyKey: idempotencyKey(formData),
      },
    );
    revalidatePath(`/admin/products/${productId}`);
    revalidatePath("/admin/products");
    return { status: "success", message: "發布檢查已更新。" };
  } catch (error) {
    return errorState(error);
  }
}

export async function linkMediaAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await assertAdminMutationOrigin();
    const actor = await requireAdminRole(["owner", "merchandiser"]);
    const productId = z.string().min(1).parse(formData.get("productId"));
    const expectedVersion = z.coerce.number().int().positive().parse(formData.get("expectedVersion"));
    const input = mediaLinkInputFromFormData(formData);
    await getAdminRepository().linkMedia(productId, input, {
      actor,
      expectedVersion,
      idempotencyKey: idempotencyKey(formData),
    });
    revalidatePath(`/admin/products/${productId}`);
    revalidatePath("/admin/products");
    return { status: "success", message: input.linkId ? "圖片連結已更新。" : "圖片已加入商品。" };
  } catch (error) {
    return errorState(error);
  }
}

export async function transitionMediaAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await assertAdminMutationOrigin();
    const input = mediaTransitionSchema.parse({
      productId: formData.get("productId"),
      assetId: formData.get("assetId"),
      expectedAssetVersion: formData.get("expectedAssetVersion"),
      toStatus: formData.get("toStatus"),
      backupAcknowledged: formData.get("backupAcknowledged") === "on",
      reason: formData.get("reason"),
    });
    const highRiskTarget = [
      "live-approved",
      "revocation-pending",
      "revoked",
    ].includes(input.toStatus);
    const actor = await requireAdminRole(
      highRiskTarget ? ["owner"] : ["owner", "merchandiser"],
    );
    if (highRiskTarget) await requireRecentAal2();
    const repository = getAdminRepository();
    const product = await repository.getProduct(input.productId);
    if (!product) {
      throw new AdminRepositoryError("PRODUCT_NOT_FOUND", "找不到商品。", 404);
    }
    const link = product.media.find((item) => item.assetId === input.assetId);
    if (!link) {
      throw new AdminRepositoryError("MEDIA_ASSET_NOT_FOUND", "找不到媒體資產。", 404);
    }
    // When versions differ, still call the durable RPC: its command ledger must
    // be able to replay a completed request before optimistic-lock validation.
    const transition = link.assetRowVersion === input.expectedAssetVersion
      ? getAdminMediaTransitionSpec(link.assetStatus, input.toStatus)
      : null;
    if (
      link.assetRowVersion === input.expectedAssetVersion &&
      !transition
    ) {
      throw new AdminRepositoryError(
        "INVALID_MEDIA_STATE_TRANSITION",
        "圖片狀態已改變，請重新載入最新狀態。",
        409,
      );
    }
    if (transition && !transition.allowedRoles.includes(actor.role)) {
      throw new AdminAuthorizationError(
        "ADMIN_ROLE_DENIED",
        "此圖片狀態變更僅允許 Owner 執行。",
        403,
      );
    }
    if (
      transition?.requiresBackupAcknowledgement &&
      !input.backupAcknowledged
    ) {
      throw new AdminRepositoryError(
        "MEDIA_BACKUP_ACK_REQUIRED",
        "核准圖片前必須確認私有原圖與衍生圖已完成備份。",
        422,
      );
    }
    const replayPayloadRequiresReason =
      input.toStatus === "draft" ||
      input.toStatus === "revocation-pending" ||
      input.toStatus === "revoked" ||
      (input.toStatus === "live-approved" && !input.backupAcknowledged);
    if (
      (transition?.requiresReason ?? replayPayloadRequiresReason) &&
      (!input.reason || input.reason.length < 8)
    ) {
      throw new AdminRepositoryError(
        "MEDIA_REASON_REQUIRED",
        "請填寫至少 8 個字元的狀態變更原因。",
        422,
      );
    }

    await repository.transitionMedia({
      assetId: input.assetId,
      expectedAssetVersion: input.expectedAssetVersion,
      toStatus: input.toStatus,
      backupAcknowledged: input.backupAcknowledged,
      reason: input.reason,
    }, {
      actor,
      idempotencyKey: idempotencyKey(formData),
      expectedVersion: input.expectedAssetVersion,
    });
    revalidatePath(`/admin/products/${input.productId}`);
    revalidatePath("/admin/products");
    return {
      status: "success",
      message: `圖片狀態已更新為「${adminMediaStatusLabel(input.toStatus)}」。`,
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function inviteStaffAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await assertAdminMutationOrigin();
    const actor = await requireAdminRole(["owner"]);
    await requireRecentAal2();
    if (!isProductionStaffInviteEnvironment()) {
      throw new AdminAuthorizationError(
        "STAFF_INVITE_PRODUCTION_ONLY",
        "人員邀請只允許在 Production deployment 執行；Preview 與 Demo 已安全關閉。",
        403,
      );
    }
    const input = staffInviteSchema.parse({
      email: formData.get("email"),
      displayName: formData.get("displayName"),
      role: formData.get("role"),
    });
    const operationKey = idempotencyKey(formData);
    const preparePayload = {
      email: input.email,
      displayName: input.displayName,
      role: input.role,
      invitedBy: actor.userId,
    };
    const prepareHash = createHash("sha256")
      .update(JSON.stringify(preparePayload))
      .digest("hex");
    const client = await getAdminAuthClient();
    const { data: prepared, error: prepareError } = await client
      .schema("api")
      .rpc("admin_member_invite_prepare", {
        p_email: input.email,
        p_display_name: input.displayName,
        p_role: input.role,
        p_idempotency_key: operationKey,
        p_request_hash: prepareHash,
      });
    const preparedRecord = (
      Array.isArray(prepared) ? prepared[0] : prepared
    ) as Record<string, unknown> | null;
    const operationId = preparedRecord?.operationId ?? preparedRecord?.id;
    const operationVersion = preparedRecord?.operationVersion ?? preparedRecord?.version;
    if (
      prepareError
      || typeof operationId !== "string"
      || typeof operationVersion !== "number"
      || !Number.isInteger(operationVersion)
    ) {
      throw new AdminRepositoryError(
        "STAFF_INVITE_PREPARE_FAILED",
        "Durable 邀請預備 RPC 尚未就緒；未呼叫 Auth Admin，也未寄出 Email。",
        503,
      );
    }

    const privileged = getPrivilegedSupabaseClient();
    const { data: invitation, error: inviteError } =
      await privileged.auth.admin.inviteUserByEmail(input.email, {
        redirectTo: "https://estatelignee.com/admin/invite/confirm",
        data: {
          display_name: input.displayName,
          invited_role: input.role,
          invitation_operation_id: operationId,
        },
      });
    if (inviteError || !invitation.user) {
      throw new AdminRepositoryError(
        "STAFF_AUTH_INVITE_FAILED",
        "Auth 邀請結果未確認；durable operation 已保留供人工判讀，不會自動重送。",
        502,
      );
    }

    const completePayload = {
      operationId,
      userId: invitation.user.id,
      ...preparePayload,
    };
    const completeHash = createHash("sha256")
      .update(JSON.stringify(completePayload))
      .digest("hex");
    const { error: membershipError } = await client
      .schema("api")
      .rpc("admin_member_invite_complete", {
        p_operation_id: operationId,
        p_user_id: invitation.user.id,
        p_expected_version: operationVersion,
        p_idempotency_key: operationKey,
        p_request_hash: completeHash,
      });
    if (membershipError) {
      // The invitation email may already be in flight. Deleting the user
      // invalidates its link and prevents an Auth-only account from existing.
      await privileged.auth.admin.deleteUser(invitation.user.id);
      throw new AdminRepositoryError(
        "STAFF_MEMBERSHIP_REGISTRATION_FAILED",
        "Membership 未能原子登記，Auth 邀請已撤銷；請確認正式 RPC 後重試。",
        503,
      );
    }
    revalidatePath("/admin/staff");
    return { status: "success", message: `邀請已寄至 ${input.email}。` };
  } catch (error) {
    return errorState(error);
  }
}

export async function changeStaffStateAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await assertAdminMutationOrigin();
    await requireAdminRole(["owner"]);
    await requireRecentAal2();
    const input = staffStateSchema.parse({
      userId: formData.get("userId"),
      expectedVersion: formData.get("expectedVersion"),
      state: formData.get("state"),
      role: formData.get("role"),
    });
    const operationKey = idempotencyKey(formData);
    await changeAdminStaffState(input, {
      idempotencyKey: operationKey,
      requestHash: requestDigest("staff.state.command", input),
    });
    revalidatePath("/admin/staff");
    return {
      status: "success",
      message: "Membership 已更新；停權或撤銷時原有 sessions 會由資料庫契約失效。",
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function requestOwnerRecoveryAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await assertAdminMutationOrigin();
    const request = recoveryRequestSchema.parse({
      reason: formData.get("reason"),
    });
    const client = await getAdminAuthClient();
    const {
      data: { user },
      error: userError,
    } = await client.auth.getUser();
    if (userError || !user) {
      throw new AdminAuthorizationError(
        "OWNER_RECOVERY_SIGN_IN_REQUIRED",
        "請先以 Owner 的 Email 與密碼登入，再提出復原申請。",
        401,
      );
    }
    const context = await getAdminOwnerRecoveryContext();
    if (context.demo) {
      throw new AdminRepositoryError(
        "OWNER_RECOVERY_DEMO_DISABLED",
        "Demo 不會變更 Auth 或 MFA；正式 Production 帳號才可提出復原申請。",
        503,
      );
    }
    if (context.userId !== user.id) {
      throw new AdminAuthorizationError(
        "OWNER_RECOVERY_IDENTITY_MISMATCH",
        "復原申請只能由目前 session 的 Owner 替自己提出。",
        403,
      );
    }
    if (context.pendingRequest) {
      return {
        status: "success",
        code: "OWNER_RECOVERY_ALREADY_PENDING",
        message: `復原申請 ${context.pendingRequest.requestId} 正等待另一位 Owner 核准。`,
      };
    }
    const input = {
      targetUserId: user.id,
      reason: request.reason,
    };
    const operationKey = idempotencyKey(formData);
    const result = await requestAdminOwnerRecovery(input, {
      idempotencyKey: operationKey,
      requestHash: requestDigest("owner.recovery.request", input),
    });
    const requestId = result.requestId ?? result.id;
    revalidatePath("/admin/recovery");
    revalidatePath("/admin/staff");
    return {
      status: "success",
      message: typeof requestId === "string"
        ? `復原申請已建立：${requestId}。請交由另一位 Owner 核准。`
        : "復原申請已建立，請交由另一位 Owner 核准。",
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function approveOwnerRecoveryAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await assertAdminMutationOrigin();
    await requireAdminRole(["owner"]);
    await requireRecentAal2();
    const input = recoveryApprovalSchema.parse({
      requestId: formData.get("requestId"),
      expectedVersion: formData.get("expectedVersion"),
    });
    const operationKey = idempotencyKey(formData);
    await approveAdminOwnerRecovery(input, {
      idempotencyKey: operationKey,
      requestHash: requestDigest("owner.recovery.approve", input),
    });
    revalidatePath("/admin/staff");
    return {
      status: "success",
      message: "復原已由第二位 Owner 核准；目標帳號原有 sessions 已撤銷。",
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function upsertTaxonomyAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await assertAdminMutationOrigin();
    await requireAdminRole(["owner", "merchandiser"]);
    const parsed = taxonomySchema.parse({
      kind: formData.get("kind"),
      id: formData.get("id"),
      expectedVersion: formData.get("expectedVersion"),
      code: formData.get("code"),
      nameEn: formData.get("nameEn"),
      nameZh: formData.get("nameZh"),
      description: formData.get("description"),
      routeSegment: formData.get("routeSegment"),
      sortOrder: formData.get("sortOrder"),
    });
    const operationKey = idempotencyKey(formData);
    const { kind, id, expectedVersion, ...input } = parsed;
    await upsertAdminTaxonomy(kind, id, expectedVersion, input, {
      idempotencyKey: operationKey,
      requestHash: requestDigest("taxonomy.upsert", parsed),
    });
    revalidatePath("/admin/categories");
    return { status: "success", message: id ? "分類／篇章已更新。" : "分類／篇章已建立。" };
  } catch (error) {
    return errorState(error);
  }
}

export async function archiveTaxonomyAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await assertAdminMutationOrigin();
    await requireAdminRole(["owner"]);
    await requireRecentAal2();
    const input = taxonomyArchiveSchema.parse({
      kind: formData.get("kind"),
      id: formData.get("id"),
      expectedVersion: formData.get("expectedVersion"),
    });
    const operationKey = idempotencyKey(formData);
    await archiveAdminTaxonomy({
      id: input.id,
      kind: input.kind,
      version: input.expectedVersion,
    }, {
      idempotencyKey: operationKey,
      requestHash: requestDigest("taxonomy.archive", input),
    });
    revalidatePath("/admin/categories");
    return { status: "success", message: "已封存；既有商品與歷史發布仍保留。" };
  } catch (error) {
    return errorState(error);
  }
}

function formAggregateIds(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return [];
  return [...new Set(
    value.split(/[\s,，]+/).map((item) => item.trim()).filter(Boolean),
  )];
}

export async function createReleaseBatchAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await assertAdminMutationOrigin();
    await requireAdminRole(["owner", "merchandiser"]);
    const input = releaseBatchCreateSchema.parse({
      chapterId: formData.get("chapterId"),
      name: formData.get("name"),
      productIds: formAggregateIds(formData.get("productIds")),
    });
    const operationKey = idempotencyKey(formData);
    await createAdminReleaseBatch(input, {
      idempotencyKey: operationKey,
      requestHash: requestDigest("release-batch.create", input),
    });
    revalidatePath("/admin/categories");
    return { status: "success", message: "系列發布批次已建立為草稿。" };
  } catch (error) {
    return errorState(error);
  }
}

export async function setReleaseBatchReadinessAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await assertAdminMutationOrigin();
    await requireAdminRole(["owner"]);
    await requireRecentAal2();
    const input = releaseBatchReadinessSchema.parse({
      batchId: formData.get("batchId"),
      expectedVersion: formData.get("expectedVersion"),
      state: formData.get("state"),
    });
    const operationKey = idempotencyKey(formData);
    await setAdminReleaseBatchReadiness(input, {
      idempotencyKey: operationKey,
      requestHash: requestDigest("release-batch.readiness", input),
    });
    revalidatePath("/admin/categories");
    return { status: "success", message: "系列批次狀態已更新。" };
  } catch (error) {
    return errorState(error);
  }
}

export async function publishReleaseBatchAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await assertAdminMutationOrigin();
    await requireAdminRole(["owner"]);
    await requireRecentAal2();
    const input = releaseBatchPublishSchema.parse({
      batchId: formData.get("batchId"),
      expectedVersion: formData.get("expectedVersion"),
    });
    const operationKey = idempotencyKey(formData);
    await publishAdminReleaseBatch(input, {
      idempotencyKey: operationKey,
      requestHash: requestDigest("release-batch.publish", input),
    });
    revalidatePath("/admin/categories");
    revalidatePath("/admin/products");
    return {
      status: "success",
      message: "系列已在單一 transaction 建立 publication snapshots 與 catalog revision。",
    };
  } catch (error) {
    return errorState(error);
  }
}

export async function adjustInventoryAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await assertAdminMutationOrigin();
    const actor = await requireAdminRole(["owner", "fulfillment"]);
    const input = inventoryMovementFromFormData(formData);
    await getAdminRepository().adjustInventory(input.skuId, input.delta, input.reason, {
      actor,
      expectedVersion: input.expectedVersion,
      idempotencyKey: idempotencyKey(formData),
    });
    revalidatePath("/admin/inventory");
    return { status: "success", message: "庫存 movement 已記錄。" };
  } catch (error) {
    return errorState(error);
  }
}
