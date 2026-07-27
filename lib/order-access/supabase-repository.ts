import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { CommerceDomainError } from "@/lib/commerce/errors";
import { hashIdempotencyRequest } from "@/lib/commerce/idempotency";

import type {
  AccessExchangeResult,
  AccessLinkRequestResult,
  OrderAccessView,
} from "./contracts";
import type { OrderAccessRepository } from "./repository";

const orderViewSchema = z.object({
  publicId: z.string(),
  status: z.enum([
    "awaiting_payment",
    "paid",
    "processing",
    "cancel_requested",
    "cancelled",
    "shipped",
    "delivered",
    "closed",
  ]),
  paymentStatus: z.enum([
    "pending",
    "verification_pending",
    "paid",
    "partially_refunded",
    "refunded",
    "exception",
  ]),
  shipmentStatus: z.enum([
    "not_created",
    "label_pending",
    "label_created",
    "manual_tracking",
    "cancellation_pending",
    "cancelled",
    "picked_up",
    "delivered",
    "exception",
  ]),
  grossTwd: z.number().int().nonnegative(),
  trackingIds: z.array(z.string()),
  updatedAt: z.string().datetime({ offset: true }),
});

function unwrap(value: unknown): unknown {
  return Array.isArray(value) && value.length === 1 ? value[0] : value;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(unwrap(value));
  if (!result.success) {
    throw new CommerceDomainError(
      "ORDER_ACCESS_INVALID_RESPONSE",
      "The durable order access service returned an invalid response.",
      503,
    );
  }
  return result.data;
}

function fail(error: { readonly message?: string } | null): never {
  const message = error?.message ?? "";
  if (message.includes("RATE_LIMIT")) {
    throw new CommerceDomainError(
      "ORDER_ACCESS_RATE_LIMITED",
      "Too many order access requests.",
      429,
    );
  }
  if (message.includes("IDEMPOTENCY")) {
    throw new CommerceDomainError(
      "IDEMPOTENCY_CONFLICT",
      "The idempotency key is already bound to another access request.",
      409,
    );
  }
  throw new CommerceDomainError(
    "ORDER_ACCESS_REPOSITORY_UNAVAILABLE",
    "The durable order access service is unavailable.",
    503,
  );
}

export class SupabaseOrderAccessRepository
  implements OrderAccessRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async requestAccessLink(input: {
    readonly publicId: string;
    readonly emailDigest: string;
    readonly requestPrincipalHash: string;
    readonly challengeId: string;
    readonly tokenDigest: string;
    readonly expiresAt: string;
    readonly idempotencyKey: string;
  }): Promise<AccessLinkRequestResult> {
    const { data, error } = await this.client
      .schema("api")
      .rpc("order_access_request", {
        p_public_id: input.publicId,
        p_email_digest: input.emailDigest,
        p_request_principal_hash: input.requestPrincipalHash,
        p_proposed_challenge_id: input.challengeId,
        p_token_digest: input.tokenDigest,
        p_expires_at: input.expiresAt,
        p_idempotency_key: input.idempotencyKey,
        p_request_hash: hashIdempotencyRequest({
          publicId: input.publicId,
          emailDigest: input.emailDigest,
        }),
      });
    if (error) fail(error);
    return parse(
      z.object({
        challengeId: z.string().uuid(),
        deliveryQueued: z.boolean(),
        expiresAt: z.string().datetime({ offset: true }),
        replayed: z.boolean(),
      }),
      data,
    );
  }

  async exchangeAccessToken(input: {
    readonly tokenDigest: string;
    readonly sessionDigest: string;
    readonly sessionExpiresAt: string;
    readonly now: string;
  }): Promise<AccessExchangeResult> {
    const { data, error } = await this.client
      .schema("api")
      .rpc("order_access_exchange", {
        p_token_digest: input.tokenDigest,
        p_session_digest: input.sessionDigest,
        p_session_expires_at: input.sessionExpiresAt,
        p_now: input.now,
      });
    if (error) fail(error);
    return parse(
      z.object({
        granted: z.boolean(),
        sessionExpiresAt: z.string().datetime({ offset: true }).nullable(),
        order: orderViewSchema.nullable(),
      }),
      data,
    );
  }

  async readSession(input: {
    readonly sessionDigest: string;
    readonly now: string;
  }): Promise<OrderAccessView | null> {
    const { data, error } = await this.client
      .schema("api")
      .rpc("order_access_session_read", {
        p_session_digest: input.sessionDigest,
        p_now: input.now,
      });
    if (error) fail(error);
    if (data === null) return null;
    return parse(orderViewSchema, data);
  }

  async revokeSession(input: {
    readonly sessionDigest: string;
    readonly now: string;
  }): Promise<void> {
    const { error } = await this.client
      .schema("api")
      .rpc("order_access_session_revoke", {
        p_session_digest: input.sessionDigest,
        p_now: input.now,
      });
    if (error) fail(error);
  }
}
