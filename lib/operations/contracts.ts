import { z } from "zod";

import type { AdminRole } from "@/lib/admin/types";
import { idempotencyKeySchema } from "@/lib/commerce/validation";

const aggregateIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const operationReasonSchema = z.string().trim().min(3).max(500);
const amountSchema = z.number().int().positive().safe();

const orderCancelRequestSchema = z.strictObject({
  type: z.literal("order.cancel.request"),
  reason: operationReasonSchema,
});
const paymentReconcileSchema = z.strictObject({
  type: z.literal("payment.reconcile"),
  merchantTradeNo: z.string().regex(/^[A-Za-z0-9]{1,20}$/),
});
const invoiceIssueSchema = z.strictObject({
  type: z.literal("invoice.issue"),
});
const invoiceAdjustSchema = z.strictObject({
  type: z.literal("invoice.adjust"),
  kind: z.enum(["void", "allowance"]),
  relateNumber: z.string().min(1).max(50),
  amountTwd: amountSchema,
  reason: operationReasonSchema,
});
const shipmentCreateSchema = z.strictObject({
  type: z.literal("shipment.create"),
  parcelCount: z.number().int().min(1).max(3),
});
const shipmentCancelSchema = z.strictObject({
  type: z.literal("shipment.cancel"),
  trackingId: z.string().min(3).max(80),
  reason: operationReasonSchema,
});
const shipmentManualTrackingSchema = z.strictObject({
  type: z.literal("shipment.manual_tracking"),
  trackingId: z.string().min(3).max(80),
});
const shipmentStatusUpdateSchema = z.strictObject({
  type: z.literal("shipment.status.update"),
  trackingId: z.string().min(3).max(80),
  state: z.enum(["picked_up", "delivered"]),
});
const returnOpenSchema = z.strictObject({
  type: z.literal("return.open"),
  unitIds: z.array(aggregateIdSchema).min(1).max(10),
  reason: operationReasonSchema,
});
const returnDecisionSchema = z.strictObject({
  type: z.literal("return.decision"),
  returnId: aggregateIdSchema,
  decision: z.enum(["authorize", "reject"]),
  reason: operationReasonSchema,
});
const returnReceiveSchema = z.strictObject({
  type: z.literal("return.receive"),
  returnId: aggregateIdSchema,
  receivedUnitIds: z.array(aggregateIdSchema).min(1).max(10),
});
const returnInspectSchema = z.strictObject({
  type: z.literal("return.inspect"),
  returnId: aggregateIdSchema,
  accepted: z.boolean(),
  disposition: z.enum(["sellable", "damaged"]),
  note: operationReasonSchema,
});
const refundRequestSchema = z.strictObject({
  type: z.literal("refund.request"),
  amountTwd: amountSchema,
  reason: operationReasonSchema,
  providerTradeNo: z.string().min(1).max(80),
});
const refundExecuteSchema = z.strictObject({
  type: z.literal("refund.execute"),
  refundId: aggregateIdSchema,
});
const supportOpenSchema = z.strictObject({
  type: z.literal("support.open"),
  subject: z.string().trim().min(3).max(160),
  note: z.string().trim().min(1).max(4_000),
});
const supportNoteSchema = z.strictObject({
  type: z.literal("support.note"),
  caseId: aggregateIdSchema,
  note: z.string().trim().min(1).max(4_000),
});
const supportResolveSchema = z.strictObject({
  type: z.literal("support.resolve"),
  caseId: aggregateIdSchema,
  resolution: z.string().trim().min(3).max(1_000),
});

export const operationsCommandPayloadSchema = z.discriminatedUnion("type", [
  orderCancelRequestSchema,
  paymentReconcileSchema,
  invoiceIssueSchema,
  invoiceAdjustSchema,
  shipmentCreateSchema,
  shipmentCancelSchema,
  shipmentManualTrackingSchema,
  shipmentStatusUpdateSchema,
  returnOpenSchema,
  returnDecisionSchema,
  returnReceiveSchema,
  returnInspectSchema,
  refundRequestSchema,
  refundExecuteSchema,
  supportOpenSchema,
  supportNoteSchema,
  supportResolveSchema,
]);

export type OperationsCommandPayload = z.infer<
  typeof operationsCommandPayloadSchema
>;
export type OperationsCommandType = OperationsCommandPayload["type"];

export const operationsCommandSchema = z.strictObject({
  aggregateId: aggregateIdSchema,
  expectedVersion: z.number().int().positive().safe(),
  idempotencyKey: idempotencyKeySchema,
  command: operationsCommandPayloadSchema,
});

export type OperationsCommand = z.infer<typeof operationsCommandSchema>;

export type OperationalPaymentStatus =
  | "pending"
  | "verification_pending"
  | "paid"
  | "partially_refunded"
  | "refunded"
  | "exception";
export type OperationalInvoiceStatus =
  | "not_requested"
  | "pending_issue"
  | "issued"
  | "adjustment_pending"
  | "adjusted"
  | "exception";
export type OperationalShipmentStatus =
  | "not_created"
  | "label_pending"
  | "label_created"
  | "manual_tracking"
  | "cancellation_pending"
  | "cancelled"
  | "picked_up"
  | "delivered"
  | "exception";
export type OperationalReturnStatus =
  | "none"
  | "requested"
  | "authorized"
  | "rejected"
  | "received"
  | "inspecting"
  | "settlement_pending"
  | "closed";
export type OperationalRefundStatus =
  | "none"
  | "requested"
  | "queued"
  | "in_flight"
  | "unknown"
  | "succeeded"
  | "failed_terminal"
  | "manual_review";

export interface OperationsProjection {
  readonly id: string;
  readonly publicId: string;
  readonly version: number;
  readonly orderStatus:
    | "awaiting_payment"
    | "paid"
    | "processing"
    | "cancel_requested"
    | "cancelled"
    | "shipped"
    | "delivered"
    | "closed";
  readonly paymentStatus: OperationalPaymentStatus;
  readonly invoiceStatus: OperationalInvoiceStatus;
  readonly shipmentStatus: OperationalShipmentStatus;
  readonly returnStatus: OperationalReturnStatus;
  readonly refundStatus: OperationalRefundStatus;
  readonly supportStatus: "none" | "open" | "resolved";
  readonly totalGrossTwd: number;
  readonly refundedTwd: number;
  readonly merchantTradeNo: string;
  readonly providerTradeNo: string | null;
  readonly invoiceRelateNumber: string | null;
  readonly trackingIds: readonly string[];
  readonly updatedAt: string;
}

export interface OperationsCommandResult {
  readonly projection: OperationsProjection;
  readonly replayed: boolean;
  readonly enqueuedOperationKeys: readonly string[];
  readonly references: Readonly<Record<string, string>>;
}

export const operationsQueueKindSchema = z.enum([
  "outbox",
  "provider_operations",
  "dead_letters",
  "reconciliation",
  "provider_events",
  "support",
]);
export type OperationsQueueKind = z.infer<typeof operationsQueueKindSchema>;

export const operationsQueueAuthorization: Readonly<
  Record<OperationsQueueKind, readonly AdminRole[]>
> = Object.freeze({
  outbox: ["owner", "support"],
  provider_operations: ["owner"],
  dead_letters: ["owner"],
  reconciliation: ["owner"],
  provider_events: ["owner", "support"],
  support: ["owner", "support"],
});

export type OperationJobState =
  | "queued"
  | "leased"
  | "completed"
  | "unknown"
  | "manual_review"
  | "dead_letter";

export type OperationJobType =
  | "payment.query"
  | "payment.refund"
  | "invoice.issue"
  | "invoice.adjust"
  | "shipment.create"
  | "shipment.cancel"
  | "email.send";

export type OperationJobSafety =
  | "safe_query"
  | "remote_effect"
  | "retry_safe";

export interface OperationJob {
  readonly id: string;
  readonly operationKey: string;
  readonly aggregateId: string;
  readonly type: OperationJobType;
  readonly safety: OperationJobSafety;
  readonly state: OperationJobState;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly attemptCount: number;
  readonly availableAt: string;
  readonly leaseToken: string | null;
  readonly leaseExpiresAt: string | null;
  readonly dispatchStartedAt: string | null;
  readonly lastEvidenceHash: string | null;
  readonly lastErrorCode: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProviderEventInput {
  readonly provider: string;
  readonly eventType: string;
  readonly providerObjectId: string;
  readonly normalizedStatus: string;
  readonly fingerprint: string;
  readonly verified: boolean;
  readonly redactedPayload: Readonly<Record<string, unknown>>;
}

export interface ProviderEventRecord extends ProviderEventInput {
  readonly id: string;
  readonly duplicate: boolean;
  readonly receivedAt: string;
  readonly reconciliationOperationKey: string | null;
}

export interface PaymentCallbackInput {
  readonly provider: "ecpay";
  readonly merchantTradeNo: string;
  readonly providerTradeNo: string | null;
  readonly callbackStatus: string;
  readonly fingerprint: string;
  readonly redactedPayload: Readonly<Record<string, unknown>>;
}

export interface OperationsQueuePage {
  readonly kind: OperationsQueueKind;
  readonly items: readonly unknown[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

interface CommandAuthorizationRule {
  readonly roles: readonly AdminRole[];
  readonly requireRecentAal2: boolean;
}

export const operationsCommandAuthorization: Readonly<
  Record<OperationsCommandType, CommandAuthorizationRule>
> = Object.freeze({
  "order.cancel.request": {
    roles: ["owner", "support"],
    requireRecentAal2: false,
  },
  "payment.reconcile": {
    roles: ["owner", "support"],
    requireRecentAal2: false,
  },
  "invoice.issue": {
    roles: ["owner", "support"],
    requireRecentAal2: false,
  },
  "invoice.adjust": {
    roles: ["owner"],
    requireRecentAal2: true,
  },
  "shipment.create": {
    roles: ["owner", "fulfillment"],
    requireRecentAal2: false,
  },
  "shipment.cancel": {
    roles: ["owner", "fulfillment"],
    requireRecentAal2: false,
  },
  "shipment.manual_tracking": {
    roles: ["owner", "fulfillment"],
    requireRecentAal2: false,
  },
  "shipment.status.update": {
    roles: ["owner", "fulfillment"],
    requireRecentAal2: false,
  },
  "return.open": {
    roles: ["owner", "support"],
    requireRecentAal2: false,
  },
  "return.decision": {
    roles: ["owner", "support"],
    requireRecentAal2: false,
  },
  "return.receive": {
    roles: ["owner", "fulfillment"],
    requireRecentAal2: false,
  },
  "return.inspect": {
    roles: ["owner", "fulfillment"],
    requireRecentAal2: false,
  },
  "refund.request": {
    roles: ["owner", "support"],
    requireRecentAal2: false,
  },
  "refund.execute": {
    roles: ["owner"],
    requireRecentAal2: true,
  },
  "support.open": {
    roles: ["owner", "support"],
    requireRecentAal2: false,
  },
  "support.note": {
    roles: ["owner", "support"],
    requireRecentAal2: false,
  },
  "support.resolve": {
    roles: ["owner", "support"],
    requireRecentAal2: false,
  },
});
