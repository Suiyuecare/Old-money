import { z } from "zod";

import { idempotencyKeySchema } from "@/lib/commerce/validation";

export const ORDER_ACCESS_LINK_TTL_MS = 15 * 60_000;
export const ORDER_ACCESS_SESSION_TTL_MS = 15 * 60_000;
export const ORDER_ACCESS_COOKIE = "__Host-lignee-order-access";

export const orderAccessRequestSchema = z.strictObject({
  publicId: z
    .string()
    .trim()
    .min(4)
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/),
  email: z.string().trim().toLowerCase().email().max(254),
  idempotencyKey: idempotencyKeySchema,
});

export const orderAccessExchangeSchema = z.strictObject({
  token: z.string().min(32).max(256).regex(/^[A-Za-z0-9_-]+$/),
});

export type OrderAccessRequest = z.infer<
  typeof orderAccessRequestSchema
>;

export interface OrderAccessView {
  readonly publicId: string;
  readonly status:
    | "awaiting_payment"
    | "paid"
    | "processing"
    | "cancel_requested"
    | "cancelled"
    | "shipped"
    | "delivered"
    | "closed";
  readonly paymentStatus:
    | "pending"
    | "verification_pending"
    | "paid"
    | "partially_refunded"
    | "refunded"
    | "exception";
  readonly shipmentStatus:
    | "not_created"
    | "label_pending"
    | "label_created"
    | "manual_tracking"
    | "cancellation_pending"
    | "cancelled"
    | "picked_up"
    | "delivered"
    | "exception";
  readonly grossTwd: number;
  readonly trackingIds: readonly string[];
  readonly updatedAt: string;
}

export interface AccessLinkRequestResult {
  readonly challengeId: string;
  readonly deliveryQueued: boolean;
  readonly expiresAt: string;
  readonly replayed: boolean;
}

export interface AccessExchangeResult {
  readonly granted: boolean;
  readonly sessionExpiresAt: string | null;
  readonly order: OrderAccessView | null;
}
