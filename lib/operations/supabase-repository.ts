import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { AdminIdentity } from "@/lib/admin/types";
import { CommerceDomainError } from "@/lib/commerce/errors";
import { hashIdempotencyRequest } from "@/lib/commerce/idempotency";

import {
  operationsQueueKindSchema,
  type OperationJob,
  type OperationsCommand,
  type OperationsCommandResult,
  type OperationsProjection,
  type OperationsQueueKind,
  type OperationsQueuePage,
  type PaymentCallbackInput,
  type ProviderEventInput,
  type ProviderEventRecord,
} from "./contracts";
import type {
  OperationCompletionOutcome,
  OperationsWorkflowRepository,
} from "./repository";

const projectionSchema = z.object({
  id: z.string(),
  publicId: z.string(),
  version: z.number().int().positive(),
  orderStatus: z.enum([
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
  invoiceStatus: z.enum([
    "not_requested",
    "pending_issue",
    "issued",
    "adjustment_pending",
    "adjusted",
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
  returnStatus: z.enum([
    "none",
    "requested",
    "authorized",
    "rejected",
    "received",
    "inspecting",
    "settlement_pending",
    "closed",
  ]),
  refundStatus: z.enum([
    "none",
    "requested",
    "queued",
    "in_flight",
    "unknown",
    "succeeded",
    "failed_terminal",
    "manual_review",
  ]),
  supportStatus: z.enum(["none", "open", "resolved"]),
  totalGrossTwd: z.number().int().nonnegative(),
  refundedTwd: z.number().int().nonnegative(),
  merchantTradeNo: z.string(),
  providerTradeNo: z.string().nullable(),
  invoiceRelateNumber: z.string().nullable(),
  trackingIds: z.array(z.string()),
  updatedAt: z.string().datetime({ offset: true }),
});

const commandResultSchema = z.object({
  projection: projectionSchema,
  replayed: z.boolean().default(false),
  enqueuedOperationKeys: z.array(z.string()).default([]),
  references: z.record(z.string(), z.string()).default({}),
});

const jobSchema = z.object({
  id: z.string(),
  operationKey: z.string(),
  aggregateId: z.string(),
  type: z.enum([
    "payment.query",
    "payment.refund",
    "invoice.issue",
    "invoice.adjust",
    "shipment.create",
    "shipment.cancel",
    "email.send",
  ]),
  safety: z.enum(["safe_query", "remote_effect", "retry_safe"]),
  state: z.enum([
    "queued",
    "leased",
    "completed",
    "unknown",
    "manual_review",
    "dead_letter",
  ]),
  payload: z.record(z.string(), z.unknown()),
  attemptCount: z.number().int().nonnegative(),
  availableAt: z.string().datetime({ offset: true }),
  leaseToken: z.string().nullable(),
  leaseExpiresAt: z.string().datetime({ offset: true }).nullable(),
  dispatchStartedAt: z.string().datetime({ offset: true }).nullable(),
  lastEvidenceHash: z.string().nullable(),
  lastErrorCode: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

function unwrap(value: unknown): unknown {
  return Array.isArray(value) && value.length === 1 ? value[0] : value;
}

function rpcError(error: { readonly message?: string } | null): never {
  const message = error?.message ?? "";
  if (
    message.includes("ROW_VERSION_CONFLICT") ||
    message.includes("VERSION_CONFLICT")
  ) {
    throw new CommerceDomainError(
      "VERSION_CONFLICT",
      "The operational projection changed; reload before retrying.",
      409,
    );
  }
  if (
    message.includes("IDEMPOTENCY_KEY_CONFLICT") ||
    message.includes("IDEMPOTENCY_COMMAND_IN_PROGRESS")
  ) {
    throw new CommerceDomainError(
      "IDEMPOTENCY_CONFLICT",
      "The idempotency key is already committed to another command.",
      409,
    );
  }
  if (message.includes("NOT_FOUND")) {
    throw new CommerceDomainError(
      "OPERATIONS_AGGREGATE_NOT_FOUND",
      "The operational aggregate was not found.",
      404,
    );
  }
  if (
    message.includes("ADMIN_ROLE_DENIED") ||
    message.includes("ADMIN_AAL2_REQUIRED") ||
    message.includes("ADMIN_MEMBERSHIP_REQUIRED")
  ) {
    throw new CommerceDomainError(
      "OPERATIONS_FORBIDDEN",
      "The current administrator may not perform this operation.",
      403,
    );
  }
  throw new CommerceDomainError(
    "OPERATIONS_REPOSITORY_UNAVAILABLE",
    "The durable operations repository is unavailable.",
    503,
  );
}

function parseOrUnavailable<T>(
  schema: z.ZodType<T>,
  value: unknown,
  label: string,
): T {
  const parsed = schema.safeParse(unwrap(value));
  if (!parsed.success) {
    throw new CommerceDomainError(
      "OPERATIONS_INVALID_RESPONSE",
      `The durable operations repository returned an invalid ${label}.`,
      503,
    );
  }
  return parsed.data;
}

export class SupabaseOperationsRepository
  implements OperationsWorkflowRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async executeCommand(
    command: OperationsCommand,
    actor: Pick<AdminIdentity, "userId" | "role">,
  ): Promise<OperationsCommandResult> {
    // RPC authorization derives the actor from auth.uid(); never trust a
    // caller-supplied actor ID. The argument exists for adapter parity.
    void actor;
    const requestHash = hashIdempotencyRequest({
      aggregateId: command.aggregateId,
      expectedVersion: command.expectedVersion,
      command: command.command,
    });
    const { data, error } = await this.client
      .schema("api")
      .rpc("admin_operations_command", {
        p_idempotency_key: command.idempotencyKey,
        p_request_hash: requestHash,
        p_expected_version: command.expectedVersion,
        p_command_type: command.command.type,
        p_aggregate_id: command.aggregateId,
        // The legacy SQL command contract only checks that `option` is an
        // object. It is now an opaque source marker; a database trigger strips
        // it before the durable invoice job is stored.
        p_payload:
          command.command.type === "invoice.issue"
            ? {
                ...command.command,
                option: { source: "order_encrypted_pii" },
              }
            : command.command,
      });
    if (error) rpcError(error);
    return parseOrUnavailable(
      commandResultSchema,
      data,
      "command result",
    );
  }

  async findProjection(
    aggregateId: string,
  ): Promise<OperationsProjection | null> {
    const { data, error } = await this.client
      .schema("api")
      .rpc("admin_operations_projection_get", {
        p_aggregate_id: aggregateId,
      });
    if (error?.message?.includes("NOT_FOUND")) return null;
    if (error) rpcError(error);
    return parseOrUnavailable(projectionSchema, data, "projection");
  }

  async listQueue(input: {
    readonly kind: OperationsQueueKind;
    readonly limit: number;
    readonly offset: number;
  }): Promise<OperationsQueuePage> {
    const { data, error } = await this.client
      .schema("api")
      .rpc("admin_operations_queue", {
        p_kind: input.kind,
        p_limit: input.limit,
        p_offset: input.offset,
      });
    if (error) rpcError(error);
    const schema = z.object({
      kind: operationsQueueKindSchema,
      items: z.array(z.record(z.string(), z.unknown())),
      total: z.number().int().nonnegative(),
      limit: z.number().int().positive(),
      offset: z.number().int().nonnegative(),
    });
    return parseOrUnavailable(schema, data, "queue page");
  }

  async recordProviderEvent(
    input: ProviderEventInput,
  ): Promise<ProviderEventRecord> {
    const { data, error } = await this.client
      .schema("api")
      .rpc("operations_provider_event_store", {
        p_provider: input.provider,
        p_event_type: input.eventType,
        p_provider_object_id: input.providerObjectId,
        p_normalized_status: input.normalizedStatus,
        p_fingerprint: input.fingerprint,
        p_verified: input.verified,
        p_redacted_payload: input.redactedPayload,
      });
    if (error) rpcError(error);
    return parseOrUnavailable(
      z.object({
        provider: z.string(),
        eventType: z.string(),
        providerObjectId: z.string(),
        normalizedStatus: z.string(),
        fingerprint: z.string(),
        verified: z.boolean(),
        redactedPayload: z.record(z.string(), z.unknown()),
        id: z.string(),
        duplicate: z.boolean(),
        receivedAt: z.string().datetime({ offset: true }),
        reconciliationOperationKey: z.string().nullable(),
      }),
      data,
      "provider event",
    );
  }

  async recordPaymentCallback(
    input: PaymentCallbackInput,
  ): Promise<ProviderEventRecord> {
    const { data, error } = await this.client
      .schema("api")
      .rpc("operations_payment_callback_record", {
        p_provider: input.provider,
        p_merchant_trade_no: input.merchantTradeNo,
        p_provider_trade_no: input.providerTradeNo,
        p_callback_status: input.callbackStatus,
        p_fingerprint: input.fingerprint,
        p_redacted_payload: input.redactedPayload,
      });
    if (error) rpcError(error);
    return parseOrUnavailable(
      z.object({
        provider: z.literal("ecpay"),
        eventType: z.literal("payment.callback"),
        providerObjectId: z.string(),
        normalizedStatus: z.string(),
        fingerprint: z.string(),
        verified: z.literal(true),
        redactedPayload: z.record(z.string(), z.unknown()),
        id: z.string(),
        duplicate: z.boolean(),
        receivedAt: z.string().datetime({ offset: true }),
        reconciliationOperationKey: z.string(),
      }),
      data,
      "payment callback receipt",
    );
  }

  async claimNextJob(input: {
    readonly workerId: string;
    readonly now: number;
    readonly leaseMs: number;
  }): Promise<OperationJob | null> {
    const { data, error } = await this.client
      .schema("api")
      .rpc("worker_operations_claim", {
        p_worker_id: input.workerId,
        p_now: new Date(input.now).toISOString(),
        p_lease_seconds: Math.max(1, Math.floor(input.leaseMs / 1_000)),
      });
    if (error) rpcError(error);
    if (data === null) return null;
    return parseOrUnavailable(jobSchema, data, "worker lease");
  }

  async claimNextReconciliationJob(input: {
    readonly workerId: string;
    readonly now: number;
    readonly leaseMs: number;
  }): Promise<OperationJob | null> {
    const { data, error } = await this.client
      .schema("api")
      .rpc("worker_reconciliation_claim", {
        p_worker_id: input.workerId,
        p_now: new Date(input.now).toISOString(),
        p_lease_seconds: Math.max(
          1,
          Math.floor(input.leaseMs / 1_000),
        ),
      });
    if (error) rpcError(error);
    if (data === null) return null;
    return parseOrUnavailable(
      jobSchema,
      data,
      "reconciliation worker lease",
    );
  }

  async completeJob(input: {
    readonly jobId: string;
    readonly leaseToken: string;
    readonly outcome: OperationCompletionOutcome;
    readonly evidenceHash?: string;
    readonly result?: Readonly<Record<string, unknown>>;
    readonly errorCode?: string;
    readonly retryAfterMs?: number;
    readonly now: number;
  }): Promise<OperationJob> {
    const { data, error } = await this.client
      .schema("api")
      .rpc("worker_operations_complete", {
        p_job_id: input.jobId,
        p_lease_token: input.leaseToken,
        p_outcome: input.outcome,
        p_evidence_hash: input.evidenceHash ?? null,
        p_result: input.result ?? {},
        p_error_code: input.errorCode ?? null,
        p_retry_after_seconds:
          input.retryAfterMs === undefined
            ? null
            : Math.max(1, Math.floor(input.retryAfterMs / 1_000)),
        p_now: new Date(input.now).toISOString(),
      });
    if (error) rpcError(error);
    return parseOrUnavailable(jobSchema, data, "worker completion");
  }

  async markDispatchStarted(input: {
    readonly jobId: string;
    readonly leaseToken: string;
    readonly now: number;
  }): Promise<OperationJob> {
    const { data, error } = await this.client
      .schema("api")
      .rpc("worker_operations_dispatch_start", {
        p_job_id: input.jobId,
        p_lease_token: input.leaseToken,
        p_now: new Date(input.now).toISOString(),
      });
    if (error) rpcError(error);
    return parseOrUnavailable(
      jobSchema,
      data,
      "worker dispatch fence",
    );
  }
}
