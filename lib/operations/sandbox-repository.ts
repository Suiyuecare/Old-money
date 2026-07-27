import { createHash, randomUUID } from "node:crypto";

import type { AdminIdentity } from "@/lib/admin/types";
import { CommerceDomainError } from "@/lib/commerce/errors";
import { DeterministicIdempotencyStore } from "@/lib/commerce/idempotency";
import {
  splitTaxIncludedTwd,
  type OrderTotalsSnapshot,
} from "@/lib/commerce/money";
import {
  invoiceIssueJobPayloadSchema,
  type InvoiceIssuePayloadResolver,
} from "@/lib/operations/invoice-payload";
import {
  type InvoiceOption,
  toEcpayInvoiceFields,
} from "@/lib/providers/invoice-schema";

import type {
  OperationJob,
  OperationJobSafety,
  OperationJobType,
  OperationsCommand,
  OperationsCommandResult,
  OperationsProjection,
  OperationsQueueKind,
  OperationsQueuePage,
  PaymentCallbackInput,
  ProviderEventInput,
  ProviderEventRecord,
} from "./contracts";
import type {
  OperationCompletionOutcome,
  OperationsWorkflowRepository,
} from "./repository";

const MAX_JOBS = 256;
const MAX_PROVIDER_EVENTS = 512;
const MAX_COMMANDS = 512;
const COMMAND_TTL_MS = 60 * 60_000;
const MAX_SAFE_QUERY_ATTEMPTS = 5;

interface MutableProjection {
  id: string;
  publicId: string;
  version: number;
  orderStatus: OperationsProjection["orderStatus"];
  paymentStatus: OperationsProjection["paymentStatus"];
  invoiceStatus: OperationsProjection["invoiceStatus"];
  shipmentStatus: OperationsProjection["shipmentStatus"];
  returnStatus: OperationsProjection["returnStatus"];
  refundStatus: OperationsProjection["refundStatus"];
  supportStatus: OperationsProjection["supportStatus"];
  totalGrossTwd: number;
  refundedTwd: number;
  merchantTradeNo: string;
  providerTradeNo: string | null;
  invoiceRelateNumber: string | null;
  trackingIds: string[];
  updatedAt: string;
}

interface MutableJob {
  id: string;
  operationKey: string;
  aggregateId: string;
  type: OperationJobType;
  kind: "provider" | "outbox" | "reconciliation";
  safety: OperationJobSafety;
  state: OperationJob["state"];
  payload: Record<string, unknown>;
  attemptCount: number;
  availableAt: number;
  leaseToken: string | null;
  leaseExpiresAt: number | null;
  dispatchStartedAt: number | null;
  lastEvidenceHash: string | null;
  lastErrorCode: string | null;
  createdAt: number;
  updatedAt: number;
}

interface SandboxSeed
  extends Omit<
    OperationsProjection,
    "trackingIds" | "updatedAt"
  > {
  readonly trackingIds?: readonly string[];
  readonly updatedAt?: string;
}

const seedOrders: readonly SandboxSeed[] = [
  {
    id: "demo-order-id-000001",
    publicId: "LIG-20260727-1001",
    version: 1,
    orderStatus: "processing",
    paymentStatus: "paid",
    invoiceStatus: "not_requested",
    shipmentStatus: "not_created",
    returnStatus: "none",
    refundStatus: "none",
    supportStatus: "none",
    totalGrossTwd: 9_800,
    refundedTwd: 0,
    merchantTradeNo: "D000000000000000001",
    providerTradeNo: "MOCK-TRADE-000001",
    invoiceRelateNumber: null,
  },
  {
    id: "demo-order-id-000002",
    publicId: "LIG-20260727-1002",
    version: 1,
    orderStatus: "awaiting_payment",
    paymentStatus: "pending",
    invoiceStatus: "not_requested",
    shipmentStatus: "not_created",
    returnStatus: "none",
    refundStatus: "none",
    supportStatus: "none",
    totalGrossTwd: 18_600,
    refundedTwd: 0,
    merchantTradeNo: "D000000000000000002",
    providerTradeNo: null,
    invoiceRelateNumber: null,
  },
  {
    id: "demo-order-id-000003",
    publicId: "LIG-20260727-1003",
    version: 1,
    orderStatus: "delivered",
    paymentStatus: "paid",
    invoiceStatus: "issued",
    shipmentStatus: "delivered",
    returnStatus: "none",
    refundStatus: "none",
    supportStatus: "none",
    totalGrossTwd: 26_400,
    refundedTwd: 0,
    merchantTradeNo: "D000000000000000003",
    providerTradeNo: "MOCK-TRADE-000003",
    invoiceRelateNumber: "MOCK-INVOICE-000003",
    trackingIds: ["MOCK-TRACK-000003"],
  },
];

function immutableProjection(
  value: MutableProjection,
): OperationsProjection {
  return Object.freeze({
    ...value,
    trackingIds: Object.freeze([...value.trackingIds]),
  });
}

function immutableJob(value: MutableJob): OperationJob {
  return Object.freeze({
    ...value,
    payload: Object.freeze({ ...value.payload }),
    availableAt: new Date(value.availableAt).toISOString(),
    leaseExpiresAt:
      value.leaseExpiresAt === null
        ? null
        : new Date(value.leaseExpiresAt).toISOString(),
    dispatchStartedAt:
      value.dispatchStartedAt === null
        ? null
        : new Date(value.dispatchStartedAt).toISOString(),
    createdAt: new Date(value.createdAt).toISOString(),
    updatedAt: new Date(value.updatedAt).toISOString(),
  });
}

function operationKey(command: OperationsCommand, suffix: string): string {
  return `${command.command.type}:${command.aggregateId}:${command.idempotencyKey}:${suffix}`;
}

function sandboxTotals(
  projection: MutableProjection,
): OrderTotalsSnapshot {
  const allocation = splitTaxIncludedTwd(projection.totalGrossTwd);
  const invoiceLineKey = `item:01:${projection.id}`;
  return Object.freeze({
    ...allocation,
    currency: "TWD",
    taxRatePercent: 5,
    merchandiseGrossTwd: projection.totalGrossTwd,
    shipping: Object.freeze({
      grossTwd: 0,
      netTwd: 0,
      taxTwd: 0,
      invoiceLineKey: "shipping",
    }),
    lines: Object.freeze([
      Object.freeze({
        ...allocation,
        skuId: `sandbox-${projection.id}`,
        quantity: 1,
        unitGrossTwd: projection.totalGrossTwd,
        priceVersion: "sandbox-operations-v1",
        invoiceLineKey,
        units: Object.freeze([
          Object.freeze({
            ...allocation,
            skuId: `sandbox-${projection.id}`,
            unitOrdinal: 1,
            invoiceLineKey,
          }),
        ]),
      }),
    ]),
  });
}

export class SandboxOperationsRepository
  implements OperationsWorkflowRepository
{
  readonly #projections = new Map<string, MutableProjection>();
  readonly #jobs = new Map<string, MutableJob>();
  readonly #events = new Map<string, ProviderEventRecord>();
  readonly #refundIds = new Map<string, string>();
  readonly #refundAmounts = new Map<string, number>();
  readonly #returnIds = new Map<string, string>();
  readonly #supportIds = new Map<string, string>();
  readonly #invoiceOptions = new Map<
    string,
    {
      readonly aggregateId: string;
      readonly option: InvoiceOption;
    }
  >();
  readonly #commands: DeterministicIdempotencyStore;
  readonly #now: () => number;

  constructor(input: {
    readonly now?: () => number;
    readonly seeds?: readonly SandboxSeed[];
  } = {}) {
    this.#now = input.now ?? Date.now;
    this.#commands = new DeterministicIdempotencyStore({
      maximumRecords: MAX_COMMANDS,
      ttlMs: COMMAND_TTL_MS,
      now: this.#now,
    });
    const nowIso = new Date(this.#now()).toISOString();
    for (const seed of input.seeds ?? seedOrders) {
      this.#projections.set(seed.id, {
        ...seed,
        trackingIds: [...(seed.trackingIds ?? [])],
        updatedAt: seed.updatedAt ?? nowIso,
      });
    }
  }

  async executeCommand(
    command: OperationsCommand,
    actor: Pick<AdminIdentity, "userId" | "role">,
  ): Promise<OperationsCommandResult> {
    const execution = this.#commands.execute<OperationsCommandResult>(
      {
        actorScope: `admin:${actor.userId}`,
        commandName: command.command.type,
        key: command.idempotencyKey,
        request: command,
      },
      () => this.#applyCommand(command),
    );
    return execution.replayed
      ? Object.freeze({ ...execution.result, replayed: true })
      : execution.result;
  }

  async findProjection(
    aggregateId: string,
  ): Promise<OperationsProjection | null> {
    const projection = this.#projections.get(aggregateId);
    return projection ? immutableProjection(projection) : null;
  }

  async listQueue(input: {
    readonly kind: OperationsQueueKind;
    readonly limit: number;
    readonly offset: number;
  }): Promise<OperationsQueuePage> {
    let records: readonly unknown[];
    if (input.kind === "provider_events") {
      records = [...this.#events.values()];
    } else if (input.kind === "support") {
      records = [...this.#projections.values()]
        .filter((projection) => projection.supportStatus === "open")
        .map((projection) => immutableProjection(projection));
    } else {
      const jobs = [...this.#jobs.values()].filter((job) => {
        if (input.kind === "dead_letters") return job.state === "dead_letter";
        if (input.kind === "reconciliation") {
          return job.state === "unknown" || job.state === "manual_review";
        }
        if (input.kind === "outbox") return job.type === "email.send";
        return job.type !== "email.send";
      });
      records = jobs
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map((job) => immutableJob(job));
    }
    const page = records.slice(input.offset, input.offset + input.limit);
    return Object.freeze({
      kind: input.kind,
      items: Object.freeze(page),
      total: records.length,
      limit: input.limit,
      offset: input.offset,
    });
  }

  async recordProviderEvent(
    input: ProviderEventInput,
  ): Promise<ProviderEventRecord> {
    const key = [
      input.provider,
      input.eventType,
      input.providerObjectId,
      input.normalizedStatus,
      input.fingerprint,
    ].join(":");
    const existing = this.#events.get(key);
    if (existing) return Object.freeze({ ...existing, duplicate: true });
    if (this.#events.size >= MAX_PROVIDER_EVENTS) {
      throw new CommerceDomainError(
        "SANDBOX_PROVIDER_EVENT_CAPACITY",
        "Sandbox provider inbox is full.",
        503,
      );
    }
    const record = Object.freeze({
      ...input,
      redactedPayload: Object.freeze({ ...input.redactedPayload }),
      id: `demo-event-${createHash("sha256").update(key).digest("hex").slice(0, 20)}`,
      duplicate: false,
      receivedAt: new Date(this.#now()).toISOString(),
      reconciliationOperationKey: null,
    });
    this.#events.set(key, record);
    return record;
  }

  async recordPaymentCallback(
    input: PaymentCallbackInput,
  ): Promise<ProviderEventRecord> {
    const eventKey = [
      input.provider,
      "payment.callback",
      input.merchantTradeNo,
      input.callbackStatus,
      input.fingerprint,
    ].join(":");
    const existing = this.#events.get(eventKey);
    if (existing) return Object.freeze({ ...existing, duplicate: true });
    if (this.#events.size >= MAX_PROVIDER_EVENTS) {
      throw new CommerceDomainError(
        "SANDBOX_PROVIDER_EVENT_CAPACITY",
        "Sandbox provider inbox is full.",
        503,
      );
    }
    const aggregateId =
      [...this.#projections.values()].find(
        (projection) =>
          projection.merchantTradeNo === input.merchantTradeNo,
      )?.id ??
      `unmatched-${createHash("sha256")
        .update(input.merchantTradeNo)
        .digest("hex")
        .slice(0, 20)}`;
    const reconciliationOperationKey = `payment.callback:${input.merchantTradeNo}:${input.fingerprint}:query`;
    this.#enqueueExternalJob({
      operationKey: reconciliationOperationKey,
      aggregateId,
      type: "payment.query",
      safety: "safe_query",
      payload: { merchantTradeNo: input.merchantTradeNo },
    });
    const record = Object.freeze({
      provider: input.provider,
      eventType: "payment.callback",
      providerObjectId: input.merchantTradeNo,
      normalizedStatus: input.callbackStatus,
      fingerprint: input.fingerprint,
      verified: true,
      redactedPayload: Object.freeze({ ...input.redactedPayload }),
      id: `demo-event-${createHash("sha256")
        .update(eventKey)
        .digest("hex")
        .slice(0, 20)}`,
      duplicate: false,
      receivedAt: new Date(this.#now()).toISOString(),
      reconciliationOperationKey,
    });
    this.#events.set(eventKey, record);
    return record;
  }

  async claimNextJob(input: {
    readonly workerId: string;
    readonly now: number;
    readonly leaseMs: number;
  }): Promise<OperationJob | null> {
    this.#recoverExpiredLeases(input.now);
    const candidate = [...this.#jobs.values()]
      .filter(
        (job) =>
          job.state === "queued" && job.availableAt <= input.now,
      )
      .sort(
        (left, right) =>
          left.availableAt - right.availableAt ||
          left.createdAt - right.createdAt,
      )[0];
    if (!candidate) return null;
    candidate.state = "leased";
    candidate.attemptCount += 1;
    candidate.leaseToken = `${input.workerId}:${randomUUID()}`;
    candidate.leaseExpiresAt = input.now + input.leaseMs;
    candidate.updatedAt = input.now;
    this.#markProjectionInFlight(candidate);
    return immutableJob(candidate);
  }

  async claimNextReconciliationJob(input: {
    readonly workerId: string;
    readonly now: number;
    readonly leaseMs: number;
  }): Promise<OperationJob | null> {
    this.#recoverExpiredLeases(input.now, "reconciliation");
    const candidate = [...this.#jobs.values()]
      .filter(
        (job) =>
          job.kind === "reconciliation" &&
          job.safety === "safe_query" &&
          job.state === "queued" &&
          job.availableAt <= input.now,
      )
      .sort(
        (left, right) =>
          left.availableAt - right.availableAt ||
          left.createdAt - right.createdAt,
      )[0];
    if (!candidate) return null;
    candidate.state = "leased";
    candidate.attemptCount += 1;
    candidate.leaseToken = `${input.workerId}:${randomUUID()}`;
    candidate.leaseExpiresAt = input.now + input.leaseMs;
    candidate.updatedAt = input.now;
    return immutableJob(candidate);
  }

  readonly resolveInvoiceIssueOption: InvoiceIssuePayloadResolver =
    async (request) => {
      const payload = invoiceIssueJobPayloadSchema.safeParse(
        request.payload,
      );
      if (!payload.success) {
        throw new Error(
          "INVALID_JOB_PAYLOAD:invoice_issue_reference",
        );
      }
      const resolved = this.#invoiceOptions.get(
        payload.data.invoiceId,
      );
      if (
        !resolved ||
        resolved.aggregateId !== request.aggregateId
      ) {
        throw new Error(
          "INVALID_JOB_PAYLOAD:invoice_issue_reference",
        );
      }
      return toEcpayInvoiceFields(resolved.option);
    };

  async markDispatchStarted(input: {
    readonly jobId: string;
    readonly leaseToken: string;
    readonly now: number;
  }): Promise<OperationJob> {
    const job = this.#jobs.get(input.jobId);
    if (
      !job ||
      job.state !== "leased" ||
      job.leaseToken !== input.leaseToken
    ) {
      throw new CommerceDomainError(
        "OPERATIONS_LEASE_CONFLICT",
        "The operations lease is stale or unavailable.",
        409,
      );
    }
    if (job.safety !== "remote_effect") {
      throw new CommerceDomainError(
        "OPERATIONS_DISPATCH_FENCE_INVALID",
        "Only remote effects can open a provider dispatch fence.",
        409,
      );
    }
    if (
      job.leaseExpiresAt === null ||
      job.leaseExpiresAt <= input.now
    ) {
      throw new CommerceDomainError(
        "OPERATIONS_LEASE_CONFLICT",
        "The operations lease expired before provider dispatch.",
        409,
      );
    }
    if (job.dispatchStartedAt === null) {
      job.dispatchStartedAt = input.now;
      job.updatedAt = input.now;
    }
    return immutableJob(job);
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
    const job = this.#jobs.get(input.jobId);
    if (
      !job ||
      job.state !== "leased" ||
      job.leaseToken !== input.leaseToken
    ) {
      throw new CommerceDomainError(
        "OPERATIONS_LEASE_CONFLICT",
        "The operations lease is stale or unavailable.",
        409,
      );
    }
    if (
      input.outcome === "retry_safe" &&
      job.safety === "remote_effect" &&
      job.dispatchStartedAt !== null
    ) {
      throw new CommerceDomainError(
        "OPERATIONS_DISPATCH_ALREADY_STARTED",
        "A dispatched remote effect cannot be queued for retry.",
        409,
      );
    }
    if (
      input.outcome === "succeeded" &&
      job.safety === "remote_effect" &&
      job.dispatchStartedAt === null
    ) {
      throw new CommerceDomainError(
        "OPERATIONS_DISPATCH_FENCE_REQUIRED",
        "A remote effect cannot succeed before provider dispatch starts.",
        409,
      );
    }
    job.lastEvidenceHash = input.evidenceHash ?? null;
    job.lastErrorCode = input.errorCode ?? null;
    job.leaseToken = null;
    job.leaseExpiresAt = null;
    job.updatedAt = input.now;

    if (input.outcome === "succeeded") {
      job.state = "completed";
      this.#applyJobSuccess(job, input.result ?? {});
    } else if (
      input.outcome === "retry_safe" &&
      job.attemptCount < MAX_SAFE_QUERY_ATTEMPTS
    ) {
      job.state = "queued";
      job.availableAt = input.now + (input.retryAfterMs ?? 30_000);
    } else if (input.outcome === "unknown") {
      if (
        job.safety === "safe_query" &&
        job.attemptCount < MAX_SAFE_QUERY_ATTEMPTS
      ) {
        job.state = "queued";
        job.availableAt = input.now + (input.retryAfterMs ?? 30_000);
      } else {
        job.state = "unknown";
        this.#markProjectionUnknown(job);
      }
    } else if (input.outcome === "manual_review") {
      job.state = "manual_review";
      this.#markProjectionUnknown(job);
    } else {
      job.state = "dead_letter";
      this.#markProjectionTerminalFailure(job);
    }
    return immutableJob(job);
  }

  #applyCommand(command: OperationsCommand): OperationsCommandResult {
    const projection = this.#projections.get(command.aggregateId);
    if (!projection) {
      throw new CommerceDomainError(
        "OPERATIONS_AGGREGATE_NOT_FOUND",
        "The operational order was not found.",
        404,
      );
    }
    if (projection.version !== command.expectedVersion) {
      throw new CommerceDomainError(
        "VERSION_CONFLICT",
        "The operational projection changed; reload before retrying.",
        409,
      );
    }
    const jobs: string[] = [];
    const references: Record<string, string> = {};
    const payload = command.command;
    switch (payload.type) {
      case "order.cancel.request": {
        if (
          projection.orderStatus === "cancelled" ||
          projection.orderStatus === "closed"
        ) {
          this.#invalidTransition(payload.type, projection.orderStatus);
        }
        projection.orderStatus = "cancel_requested";
        break;
      }
      case "payment.reconcile": {
        projection.paymentStatus = "verification_pending";
        jobs.push(
          this.#enqueueJob(command, "payment.query", "safe_query", {
            merchantTradeNo: payload.merchantTradeNo,
          }),
        );
        break;
      }
      case "invoice.issue": {
        if (projection.paymentStatus !== "paid") {
          this.#invalidTransition(payload.type, projection.paymentStatus);
        }
        if (
          projection.invoiceStatus !== "not_requested" &&
          projection.invoiceStatus !== "exception"
        ) {
          this.#invalidTransition(payload.type, projection.invoiceStatus);
        }
        const invoiceId = randomUUID();
        this.#invoiceOptions.set(invoiceId, {
          aggregateId: projection.id,
          option: {
            kind: "ecpay_email",
            email: "buyer@example.com",
          },
        });
        references.invoiceId = invoiceId;
        projection.invoiceStatus = "pending_issue";
        jobs.push(
          this.#enqueueJob(command, "invoice.issue", "remote_effect", {
            invoiceId,
            totals: sandboxTotals(projection),
          }),
        );
        break;
      }
      case "invoice.adjust": {
        if (projection.invoiceStatus !== "issued") {
          this.#invalidTransition(payload.type, projection.invoiceStatus);
        }
        projection.invoiceStatus = "adjustment_pending";
        jobs.push(
          this.#enqueueJob(command, "invoice.adjust", "remote_effect", {
            kind: payload.kind,
            relateNumber: payload.relateNumber,
            amountTwd: payload.amountTwd,
          }),
        );
        break;
      }
      case "shipment.create": {
        if (
          projection.paymentStatus !== "paid" ||
          projection.shipmentStatus !== "not_created"
        ) {
          this.#invalidTransition(payload.type, projection.shipmentStatus);
        }
        projection.shipmentStatus = "label_pending";
        jobs.push(
          this.#enqueueJob(command, "shipment.create", "remote_effect", {
            parcelCount: payload.parcelCount,
          }),
        );
        break;
      }
      case "shipment.cancel": {
        if (
          projection.shipmentStatus !== "label_created" &&
          projection.shipmentStatus !== "manual_tracking"
        ) {
          this.#invalidTransition(payload.type, projection.shipmentStatus);
        }
        projection.shipmentStatus = "cancellation_pending";
        jobs.push(
          this.#enqueueJob(command, "shipment.cancel", "remote_effect", {
            trackingId: payload.trackingId,
          }),
        );
        break;
      }
      case "shipment.manual_tracking": {
        if (
          projection.shipmentStatus !== "not_created" &&
          projection.shipmentStatus !== "label_pending"
        ) {
          this.#invalidTransition(payload.type, projection.shipmentStatus);
        }
        projection.shipmentStatus = "manual_tracking";
        projection.trackingIds = [payload.trackingId];
        projection.orderStatus = "shipped";
        break;
      }
      case "shipment.status.update": {
        if (
          !projection.trackingIds.includes(payload.trackingId) ||
          (payload.state === "picked_up" &&
            projection.shipmentStatus !== "label_created" &&
            projection.shipmentStatus !== "manual_tracking") ||
          (payload.state === "delivered" &&
            projection.shipmentStatus !== "label_created" &&
            projection.shipmentStatus !== "manual_tracking" &&
            projection.shipmentStatus !== "picked_up")
        ) {
          this.#invalidTransition(payload.type, projection.shipmentStatus);
        }
        projection.shipmentStatus = payload.state;
        projection.orderStatus =
          payload.state === "delivered" ? "delivered" : "shipped";
        break;
      }
      case "return.open": {
        if (
          projection.orderStatus !== "delivered" ||
          projection.returnStatus !== "none"
        ) {
          this.#invalidTransition(payload.type, projection.returnStatus);
        }
        const returnId = `demo-return-${createHash("sha256")
          .update(operationKey(command, "return"))
          .digest("hex")
          .slice(0, 20)}`;
        this.#returnIds.set(command.aggregateId, returnId);
        references.returnId = returnId;
        projection.returnStatus = "requested";
        break;
      }
      case "return.decision": {
        if (
          projection.returnStatus !== "requested" ||
          this.#returnIds.get(command.aggregateId) !== payload.returnId
        ) {
          this.#invalidTransition(payload.type, projection.returnStatus);
        }
        projection.returnStatus =
          payload.decision === "authorize" ? "authorized" : "rejected";
        break;
      }
      case "return.receive": {
        if (
          projection.returnStatus !== "authorized" ||
          this.#returnIds.get(command.aggregateId) !== payload.returnId
        ) {
          this.#invalidTransition(payload.type, projection.returnStatus);
        }
        projection.returnStatus = "received";
        break;
      }
      case "return.inspect": {
        if (
          (
            projection.returnStatus !== "received" &&
            projection.returnStatus !== "inspecting"
          ) ||
          this.#returnIds.get(command.aggregateId) !== payload.returnId
        ) {
          this.#invalidTransition(payload.type, projection.returnStatus);
        }
        projection.returnStatus = payload.accepted
          ? "settlement_pending"
          : "closed";
        break;
      }
      case "refund.request": {
        const refundable =
          projection.totalGrossTwd - projection.refundedTwd;
        if (
          projection.paymentStatus !== "paid" ||
          payload.amountTwd > refundable ||
          projection.refundStatus !== "none"
        ) {
          this.#invalidTransition(payload.type, projection.refundStatus);
        }
        const refundId = `demo-refund-${createHash("sha256")
          .update(operationKey(command, "refund"))
          .digest("hex")
          .slice(0, 20)}`;
        this.#refundIds.set(command.aggregateId, refundId);
        this.#refundAmounts.set(command.aggregateId, payload.amountTwd);
        references.refundId = refundId;
        projection.providerTradeNo = payload.providerTradeNo;
        projection.refundStatus = "requested";
        jobs.push(
          this.#enqueueJob(command, "email.send", "remote_effect", {
            templateVersion: "refund-requested-v1",
            to: "sandbox-customer@example.invalid",
            subject: "LIGNÉE refund request received",
            text: `Sandbox refund request ${refundId} was recorded.`,
          }),
        );
        break;
      }
      case "refund.execute": {
        if (
          projection.refundStatus !== "requested" ||
          this.#refundIds.get(command.aggregateId) !== payload.refundId ||
          !projection.providerTradeNo
        ) {
          this.#invalidTransition(payload.type, projection.refundStatus);
        }
        projection.refundStatus = "queued";
        jobs.push(
          this.#enqueueJob(command, "payment.refund", "remote_effect", {
            refundId: payload.refundId,
            providerTradeNo: projection.providerTradeNo,
            amountTwd:
              this.#refundAmounts.get(command.aggregateId) ??
              projection.totalGrossTwd - projection.refundedTwd,
          }),
        );
        break;
      }
      case "support.open": {
        if (projection.supportStatus === "open") {
          this.#invalidTransition(payload.type, projection.supportStatus);
        }
        const caseId = `demo-case-${createHash("sha256")
          .update(operationKey(command, "support"))
          .digest("hex")
          .slice(0, 20)}`;
        this.#supportIds.set(command.aggregateId, caseId);
        references.caseId = caseId;
        projection.supportStatus = "open";
        break;
      }
      case "support.note": {
        if (
          projection.supportStatus !== "open" ||
          this.#supportIds.get(command.aggregateId) !== payload.caseId
        ) {
          this.#invalidTransition(payload.type, projection.supportStatus);
        }
        break;
      }
      case "support.resolve": {
        if (
          projection.supportStatus !== "open" ||
          this.#supportIds.get(command.aggregateId) !== payload.caseId
        ) {
          this.#invalidTransition(payload.type, projection.supportStatus);
        }
        projection.supportStatus = "resolved";
        break;
      }
    }
    projection.version += 1;
    projection.updatedAt = new Date(this.#now()).toISOString();
    return Object.freeze({
      projection: immutableProjection(projection),
      replayed: false,
      enqueuedOperationKeys: Object.freeze(jobs),
      references: Object.freeze(references),
    });
  }

  #enqueueJob(
    command: OperationsCommand,
    type: OperationJobType,
    safety: OperationJobSafety,
    payload: Record<string, unknown>,
  ): string {
    if (this.#jobs.size >= MAX_JOBS) {
      throw new CommerceDomainError(
        "SANDBOX_OPERATIONS_CAPACITY",
        "Sandbox operations queue is full.",
        503,
      );
    }
    const key = operationKey(command, type);
    const existing = [...this.#jobs.values()].find(
      (job) => job.operationKey === key,
    );
    if (existing) return key;
    const now = this.#now();
    const id = `demo-job-${createHash("sha256").update(key).digest("hex").slice(0, 20)}`;
    this.#jobs.set(id, {
      id,
      operationKey: key,
      aggregateId: command.aggregateId,
      type,
      kind:
        type === "email.send"
          ? "outbox"
          : type === "payment.query"
            ? "reconciliation"
            : "provider",
      safety,
      state: "queued",
      payload,
      attemptCount: 0,
      availableAt: now,
      leaseToken: null,
      leaseExpiresAt: null,
      dispatchStartedAt: null,
      lastEvidenceHash: null,
      lastErrorCode: null,
      createdAt: now,
      updatedAt: now,
    });
    return key;
  }

  #enqueueExternalJob(input: {
    readonly operationKey: string;
    readonly aggregateId: string;
    readonly type: OperationJobType;
    readonly kind?: "provider" | "outbox" | "reconciliation";
    readonly safety: OperationJobSafety;
    readonly payload: Record<string, unknown>;
  }): void {
    if (
      [...this.#jobs.values()].some(
        (job) => job.operationKey === input.operationKey,
      )
    ) {
      return;
    }
    if (this.#jobs.size >= MAX_JOBS) {
      throw new CommerceDomainError(
        "SANDBOX_OPERATIONS_CAPACITY",
        "Sandbox operations queue is full.",
        503,
      );
    }
    const now = this.#now();
    const id = `demo-job-${createHash("sha256")
      .update(input.operationKey)
      .digest("hex")
      .slice(0, 20)}`;
    this.#jobs.set(id, {
      id,
      ...input,
      kind:
        input.kind ??
        (input.type === "email.send"
          ? "outbox"
          : input.type === "payment.query"
            ? "reconciliation"
            : "provider"),
      state: "queued",
      attemptCount: 0,
      availableAt: now,
      leaseToken: null,
      leaseExpiresAt: null,
      dispatchStartedAt: null,
      lastEvidenceHash: null,
      lastErrorCode: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  #recoverExpiredLeases(
    now: number,
    kind?: MutableJob["kind"],
  ): void {
    for (const job of this.#jobs.values()) {
      if (
        (kind !== undefined && job.kind !== kind) ||
        job.state !== "leased" ||
        job.leaseExpiresAt === null ||
        job.leaseExpiresAt > now
      ) {
        continue;
      }
      job.leaseToken = null;
      job.leaseExpiresAt = null;
      job.updatedAt = now;
      if (
        job.safety === "safe_query" ||
        job.safety === "retry_safe" ||
        (job.safety === "remote_effect" &&
          job.dispatchStartedAt === null)
      ) {
        job.state = "queued";
        job.availableAt = now;
        job.lastErrorCode =
          job.safety === "remote_effect"
            ? "PRE_DISPATCH_LEASE_EXPIRED_REQUEUED"
            : "SAFE_LEASE_EXPIRED_REQUEUED";
      } else {
        // The worker may have completed the remote effect before crashing.
        // Re-running it is unsafe; reconciliation/manual review owns recovery.
        job.state = "unknown";
        job.lastErrorCode = "LEASE_EXPIRED_EFFECT_UNKNOWN";
        this.#markProjectionUnknown(job);
      }
    }
  }

  #markProjectionInFlight(job: MutableJob): void {
    const projection = this.#projections.get(job.aggregateId);
    if (!projection) return;
    if (job.type === "payment.refund") {
      projection.refundStatus = "in_flight";
      projection.version += 1;
      projection.updatedAt = new Date(job.updatedAt).toISOString();
    }
  }

  #applyJobSuccess(
    job: MutableJob,
    result: Readonly<Record<string, unknown>>,
  ): void {
    const projection = this.#projections.get(job.aggregateId);
    if (!projection) return;
    switch (job.type) {
      case "payment.query": {
        if (result.tradeStatus === "paid") {
          projection.paymentStatus = "paid";
          projection.orderStatus = "paid";
          projection.providerTradeNo =
            typeof result.providerTradeNo === "string"
              ? result.providerTradeNo
              : projection.providerTradeNo;
        } else if (result.tradeStatus === "unpaid") {
          projection.paymentStatus = "pending";
        }
        break;
      }
      case "payment.refund": {
        const amount =
          typeof job.payload.amountTwd === "number"
            ? job.payload.amountTwd
            : 0;
        projection.refundedTwd += amount;
        projection.refundStatus = "succeeded";
        projection.paymentStatus =
          projection.refundedTwd >= projection.totalGrossTwd
            ? "refunded"
            : "partially_refunded";
        break;
      }
      case "invoice.issue":
        projection.invoiceStatus = "issued";
        projection.invoiceRelateNumber =
          typeof result.relateNumber === "string"
            ? result.relateNumber
            : projection.invoiceRelateNumber;
        break;
      case "invoice.adjust":
        projection.invoiceStatus = "adjusted";
        break;
      case "shipment.create":
        projection.shipmentStatus = "label_created";
        projection.trackingIds = Array.isArray(result.trackingIds)
          ? result.trackingIds.filter(
              (value): value is string => typeof value === "string",
            )
          : [];
        break;
      case "shipment.cancel":
        projection.shipmentStatus =
          result.state === "picked_up" ? "picked_up" : "cancelled";
        break;
      case "email.send":
        break;
    }
    projection.version += 1;
    projection.updatedAt = new Date(job.updatedAt).toISOString();
  }

  #markProjectionUnknown(job: MutableJob): void {
    const projection = this.#projections.get(job.aggregateId);
    if (!projection) return;
    if (job.type === "payment.refund") projection.refundStatus = "unknown";
    else if (job.type.startsWith("invoice.")) {
      projection.invoiceStatus = "exception";
    } else if (job.type.startsWith("shipment.")) {
      projection.shipmentStatus = "exception";
    } else if (job.type === "payment.query") {
      projection.paymentStatus = "verification_pending";
    }
    projection.version += 1;
    projection.updatedAt = new Date(job.updatedAt).toISOString();
  }

  #markProjectionTerminalFailure(job: MutableJob): void {
    const projection = this.#projections.get(job.aggregateId);
    if (!projection) return;
    if (job.type === "payment.refund") {
      projection.refundStatus = "failed_terminal";
    } else if (job.type.startsWith("invoice.")) {
      projection.invoiceStatus = "exception";
    } else if (job.type.startsWith("shipment.")) {
      projection.shipmentStatus = "exception";
    } else if (job.type === "payment.query") {
      projection.paymentStatus = "exception";
    }
    projection.version += 1;
    projection.updatedAt = new Date(job.updatedAt).toISOString();
  }

  #invalidTransition(command: string, current: string): never {
    throw new CommerceDomainError(
      "INVALID_OPERATIONS_TRANSITION",
      `Cannot apply ${command} while the aggregate is ${current}.`,
      409,
      { command, current },
    );
  }
}
