import { z } from "zod";

import {
  deriveOrderAccessChallengeToken,
  normalizeOrderAccessEmail,
} from "./service";

export const ORDER_ACCESS_EMAIL_TEMPLATE_VERSION =
  "order-access-v1";

/**
 * Durable outbox contract. The token, rendered link, email subject/body, and
 * plaintext recipient are intentionally absent. recipientRef must point to a
 * server-side encrypted contact record that the worker is allowed to resolve.
 */
export const orderAccessEmailJobPayloadSchema = z.strictObject({
  kind: z.literal("order_access_link"),
  templateVersion: z.literal(
    ORDER_ACCESS_EMAIL_TEMPLATE_VERSION,
  ),
  challengeId: z.string().uuid(),
  recipientRef: z.string().uuid(),
});

export type OrderAccessEmailJobPayload = z.infer<
  typeof orderAccessEmailJobPayloadSchema
>;

export interface ResolvedEmailPayload {
  readonly templateVersion: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export type OrderAccessEmailPayloadResolver = (
  payload: Readonly<Record<string, unknown>>,
) => Promise<ResolvedEmailPayload>;

export function createOrderAccessEmailPayloadResolver(input: {
  readonly tokenKey: Buffer;
  readonly resolveRecipient: (
    recipientRef: string,
    challengeId: string,
  ) => Promise<string | null>;
}): OrderAccessEmailPayloadResolver {
  if (input.tokenKey.length !== 32) {
    throw new Error(
      "INVALID_JOB_PAYLOAD:order_access_token_key",
    );
  }
  return async (storedPayload) => {
    const parsed =
      orderAccessEmailJobPayloadSchema.safeParse(storedPayload);
    if (!parsed.success) {
      throw new Error(
        "INVALID_JOB_PAYLOAD:order_access_email",
      );
    }
    const recipient = await input.resolveRecipient(
      parsed.data.recipientRef,
      parsed.data.challengeId,
    );
    const normalizedRecipient = recipient
      ? normalizeOrderAccessEmail(recipient)
      : "";
    if (!z.email().safeParse(normalizedRecipient).success) {
      throw new Error(
        "INVALID_JOB_PAYLOAD:order_access_recipient",
      );
    }

    const token = deriveOrderAccessChallengeToken(
      parsed.data.challengeId,
      input.tokenKey,
    );
    const accessUrl = new URL(
      "/orders/access",
      "https://estatelignee.com",
    );
    accessUrl.hash = new URLSearchParams({ token }).toString();
    return Object.freeze({
      templateVersion: parsed.data.templateVersion,
      to: normalizedRecipient,
      subject: "您的 LIGNÉE 安全訂單連結",
      text: [
        "請使用以下短效、單次連結查詢您的 LIGNÉE 訂單：",
        accessUrl.toString(),
        "",
        "此連結將於 15 分鐘後失效；若您未提出查詢，可忽略此信。",
      ].join("\n"),
    });
  };
}
