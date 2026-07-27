"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import {
  AdminAuthorizationError,
  assertAdminMutationOrigin,
  requireAdminRole,
  requireRecentAal2,
} from "./auth";
import { AdminRepositoryError } from "./errors";
import {
  getAdminGovernanceAdapter,
  launchAttestationCommandSchema,
  runtimeControlsPayloadFromFormData,
  type AdminLaunchAttestation,
  type AdminRuntimeControls,
} from "./governance";
import type { AdminActionState } from "./types";

const commandSchema = z.object({
  expectedVersion: z.coerce.number().int().nonnegative(),
  idempotencyKey: z.string().trim().min(16).max(200),
});

function actionError(error: unknown): AdminActionState<never> {
  unstable_rethrow(error);
  if (error instanceof z.ZodError) {
    return {
      status: "error",
      code: "VALIDATION_ERROR",
      message: error.issues[0]?.message ?? "請檢查治理設定內容。",
      fieldErrors: Object.fromEntries(
        error.issues.map((issue) => [String(issue.path[0] ?? "form"), issue.message]),
      ),
    };
  }
  if (error instanceof AdminAuthorizationError || error instanceof AdminRepositoryError) {
    return { status: "error", code: error.code, message: error.message };
  }
  return {
    status: "error",
    code: "ADMIN_GOVERNANCE_ACTION_FAILED",
    message: "治理操作失敗；原設定與證據保持不變。",
  };
}

export async function updateRuntimeControlsAction(
  _previous: AdminActionState<AdminRuntimeControls>,
  formData: FormData,
): Promise<AdminActionState<AdminRuntimeControls>> {
  try {
    await assertAdminMutationOrigin();
    await requireAdminRole(["owner"]);
    await requireRecentAal2();
    const command = commandSchema.parse({
      expectedVersion: formData.get("expectedVersion"),
      idempotencyKey: formData.get("idempotencyKey"),
    });
    const controls = await getAdminGovernanceAdapter().updateRuntimeControls({
      ...command,
      payload: runtimeControlsPayloadFromFormData(formData),
    });
    revalidatePath("/admin/settings");
    revalidatePath("/admin/audit");
    return {
      status: "success",
      message: controls.replayed
        ? "相同操作已完成；已安全回傳原結果。"
        : "Runtime Controls 已更新並寫入 append-only Audit Log。",
      data: controls,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function recordLaunchAttestationAction(
  _previous: AdminActionState<AdminLaunchAttestation>,
  formData: FormData,
): Promise<AdminActionState<AdminLaunchAttestation>> {
  try {
    await assertAdminMutationOrigin();
    await requireAdminRole(["owner"]);
    await requireRecentAal2();
    const command = launchAttestationCommandSchema.parse({
      expectedControlsVersion: formData.get("expectedControlsVersion"),
      kind: formData.get("kind"),
      value: formData.get("value"),
      evidenceSha256: formData.get("evidenceSha256"),
      idempotencyKey: formData.get("idempotencyKey"),
    });
    const attestation = await getAdminGovernanceAdapter()
      .recordLaunchAttestation(command);
    revalidatePath("/admin/settings");
    revalidatePath("/admin/audit");
    return {
      status: "success",
      message: attestation.replayed
        ? "相同上線證據已完成記錄；已安全回傳原結果。"
        : "上線證據已寫入 append-only ledger，並更新 Runtime Controls 版本。",
      data: attestation,
    };
  } catch (error) {
    return actionError(error);
  }
}
