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
import {
  getAdminEngagementAdapter,
  newsletterCampaignInputSchema,
  type AdminAppointmentProjection,
  type AdminNewsletterCampaignDraft,
  type AdminNewsletterConsentProjection,
} from "./engagement";
import { AdminRepositoryError } from "./errors";
import type { AdminActionState } from "./types";

const commandSchema = z.strictObject({
  idempotencyKey: z.string().trim().min(16).max(200),
  expectedVersion: z.coerce.number().int().nonnegative(),
});

const persistedCommandSchema = commandSchema.extend({
  expectedVersion: z.coerce.number().int().positive(),
});

const appointmentSchema = persistedCommandSchema.extend({
  appointmentId: z.string().uuid(),
  targetState: z.enum(["confirmed", "completed", "cancelled"]),
  scheduledFor: z.preprocess(
    (value) => value === "" || value === null ? null : value,
    z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).nullable(),
  ),
}).superRefine((value, context) => {
  if (value.targetState === "confirmed" && !value.scheduledFor) {
    context.addIssue({
      code: "custom",
      message: "確認預約時必須選擇時段。",
      path: ["scheduledFor"],
    });
  }
  if (value.targetState !== "confirmed" && value.scheduledFor) {
    context.addIssue({
      code: "custom",
      message: "只有確認或改期時可以提供時段。",
      path: ["scheduledFor"],
    });
  }
});

const consentSchema = persistedCommandSchema.extend({
  consentId: z.string().uuid(),
});

const campaignMutationSchema = commandSchema.extend({
  campaignId: z.string().uuid().optional(),
  title: newsletterCampaignInputSchema.shape.title,
  subject: newsletterCampaignInputSchema.shape.subject,
  previewText: newsletterCampaignInputSchema.shape.previewText,
  contentMarkdown: newsletterCampaignInputSchema.shape.contentMarkdown,
});

const campaignStateSchema = commandSchema.extend({
  campaignId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
  targetState: z.enum(["draft", "review", "archived"]),
});

function actionError(error: unknown): AdminActionState<never> {
  unstable_rethrow(error);
  if (error instanceof z.ZodError) {
    return {
      status: "error",
      code: "VALIDATION_ERROR",
      message: error.issues[0]?.message ?? "請檢查表單欄位。",
      fieldErrors: Object.fromEntries(
        error.issues.map((issue) => [
          String(issue.path[0] ?? "form"),
          issue.message,
        ]),
      ),
    };
  }
  if (
    error instanceof AdminAuthorizationError
    || error instanceof AdminRepositoryError
  ) {
    return {
      status: "error",
      code: error.code,
      message: error.message,
    };
  }
  return {
    status: "error",
    code: "ADMIN_ENGAGEMENT_ACTION_FAILED",
    message: "操作失敗；資料與寄送狀態保持不變。",
  };
}

function taipeiLocalToIso(value: string | null): string | null {
  if (!value) return null;
  const timestamp = new Date(`${value}:00+08:00`);
  if (Number.isNaN(timestamp.valueOf())) {
    throw new AdminRepositoryError(
      "INVALID_APPOINTMENT_SCHEDULE",
      "預約時段格式無效。",
      422,
    );
  }
  return timestamp.toISOString();
}

export async function transitionAppointmentAction(
  _previous: AdminActionState<AdminAppointmentProjection>,
  formData: FormData,
): Promise<AdminActionState<AdminAppointmentProjection>> {
  try {
    await assertAdminMutationOrigin();
    await requireAdminRole(["owner", "support"]);
    const command = appointmentSchema.parse({
      appointmentId: formData.get("appointmentId"),
      expectedVersion: formData.get("expectedVersion"),
      idempotencyKey: formData.get("idempotencyKey"),
      targetState: formData.get("targetState"),
      scheduledFor: formData.get("scheduledFor"),
    });
    const result = await getAdminEngagementAdapter()
      .transitionAppointment({
        appointmentId: command.appointmentId,
        targetState: command.targetState,
        scheduledFor: taipeiLocalToIso(command.scheduledFor),
      }, {
        expectedVersion: command.expectedVersion,
        idempotencyKey: command.idempotencyKey,
      });
    revalidatePath("/admin/appointments");
    revalidatePath("/admin/audit");
    return {
      status: "success",
      message: result.replayed
        ? "相同預約操作已完成；已安全回傳原結果。"
        : "預約狀態已更新並寫入 Audit Log。",
      data: result,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function unsubscribeNewsletterConsentAction(
  _previous: AdminActionState<AdminNewsletterConsentProjection>,
  formData: FormData,
): Promise<AdminActionState<AdminNewsletterConsentProjection>> {
  try {
    await assertAdminMutationOrigin();
    await requireAdminRole(["owner", "support"]);
    const command = consentSchema.parse({
      consentId: formData.get("consentId"),
      expectedVersion: formData.get("expectedVersion"),
      idempotencyKey: formData.get("idempotencyKey"),
    });
    const result = await getAdminEngagementAdapter()
      .unsubscribeNewsletterConsent(command.consentId, {
        expectedVersion: command.expectedVersion,
        idempotencyKey: command.idempotencyKey,
      });
    revalidatePath("/admin/newsletter");
    revalidatePath("/admin/audit");
    return {
      status: "success",
      message: result.replayed
        ? "停止寄送操作已完成；已安全回傳原結果。"
        : "此 consent 已標記停止寄送。",
      data: result,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function createNewsletterCampaignAction(
  _previous: AdminActionState<AdminNewsletterCampaignDraft>,
  formData: FormData,
): Promise<AdminActionState<AdminNewsletterCampaignDraft>> {
  try {
    await assertAdminMutationOrigin();
    await requireAdminRole(["owner", "merchandiser"]);
    const command = campaignMutationSchema.parse({
      expectedVersion: formData.get("expectedVersion"),
      idempotencyKey: formData.get("idempotencyKey"),
      title: formData.get("title"),
      subject: formData.get("subject"),
      previewText: formData.get("previewText"),
      contentMarkdown: formData.get("contentMarkdown"),
    });
    if (command.expectedVersion !== 0) {
      throw new AdminRepositoryError(
        "ROW_VERSION_CONFLICT",
        "新草稿的預期版本必須為 0。",
        409,
      );
    }
    const result = await getAdminEngagementAdapter()
      .createNewsletterCampaign({
        title: command.title,
        subject: command.subject,
        previewText: command.previewText,
        contentMarkdown: command.contentMarkdown,
      }, {
        expectedVersion: command.expectedVersion,
        idempotencyKey: command.idempotencyKey,
      });
    revalidatePath("/admin/newsletter");
    revalidatePath("/admin/audit");
    return {
      status: "success",
      message: result.replayed
        ? "相同草稿已建立；已安全回傳原結果。"
        : "電子報草稿已建立；尚未核准或排程寄送。",
      data: result,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateNewsletterCampaignAction(
  _previous: AdminActionState<AdminNewsletterCampaignDraft>,
  formData: FormData,
): Promise<AdminActionState<AdminNewsletterCampaignDraft>> {
  try {
    await assertAdminMutationOrigin();
    await requireAdminRole(["owner", "merchandiser"]);
    const command = campaignMutationSchema.parse({
      campaignId: formData.get("campaignId"),
      expectedVersion: formData.get("expectedVersion"),
      idempotencyKey: formData.get("idempotencyKey"),
      title: formData.get("title"),
      subject: formData.get("subject"),
      previewText: formData.get("previewText"),
      contentMarkdown: formData.get("contentMarkdown"),
    });
    if (!command.campaignId) {
      throw new AdminRepositoryError(
        "NEWSLETTER_CAMPAIGN_NOT_FOUND",
        "缺少電子報草稿 ID。",
        404,
      );
    }
    if (command.expectedVersion < 1) {
      throw new AdminRepositoryError(
        "ROW_VERSION_CONFLICT",
        "草稿版本無效，請重新整理。",
        409,
      );
    }
    const result = await getAdminEngagementAdapter()
      .updateNewsletterCampaign(command.campaignId, {
        title: command.title,
        subject: command.subject,
        previewText: command.previewText,
        contentMarkdown: command.contentMarkdown,
      }, {
        expectedVersion: command.expectedVersion,
        idempotencyKey: command.idempotencyKey,
      });
    revalidatePath("/admin/newsletter");
    revalidatePath("/admin/audit");
    return {
      status: "success",
      message: result.replayed
        ? "相同草稿更新已完成；已安全回傳原結果。"
        : "電子報草稿內容已更新。",
      data: result,
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function transitionNewsletterCampaignAction(
  _previous: AdminActionState<AdminNewsletterCampaignDraft>,
  formData: FormData,
): Promise<AdminActionState<AdminNewsletterCampaignDraft>> {
  try {
    await assertAdminMutationOrigin();
    await requireAdminRole(["owner", "merchandiser"]);
    const command = campaignStateSchema.parse({
      campaignId: formData.get("campaignId"),
      expectedVersion: formData.get("expectedVersion"),
      idempotencyKey: formData.get("idempotencyKey"),
      targetState: formData.get("targetState"),
    });
    if (command.targetState === "archived") {
      await requireAdminRole(["owner"]);
      await requireRecentAal2();
    }
    const result = await getAdminEngagementAdapter()
      .transitionNewsletterCampaign(
        command.campaignId,
        command.targetState,
        {
          expectedVersion: command.expectedVersion,
          idempotencyKey: command.idempotencyKey,
        },
      );
    revalidatePath("/admin/newsletter");
    revalidatePath("/admin/audit");
    return {
      status: "success",
      message: result.replayed
        ? "相同狀態操作已完成；已安全回傳原結果。"
        : "電子報工作狀態已更新；沒有建立任何寄送工作。",
      data: result,
    };
  } catch (error) {
    return actionError(error);
  }
}
