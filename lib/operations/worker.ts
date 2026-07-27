import { createHash } from "node:crypto";

import type { OrderTotalsSnapshot } from "@/lib/commerce/money";
import type { OrderAccessEmailPayloadResolver } from "@/lib/order-access/email-payload";
import type { InvoiceIssuePayloadResolver } from "@/lib/operations/invoice-payload";
import type {
  EmailProvider,
  InvoiceProvider,
  LogisticsProvider,
  PaymentGateway,
} from "@/lib/providers/interfaces";

import type { OperationJob } from "./contracts";
import type { OperationsWorkflowRepository } from "./repository";

export interface OperationWorkerProviders {
  readonly payment: PaymentGateway;
  readonly invoice: InvoiceProvider;
  readonly logistics: LogisticsProvider;
  readonly email: EmailProvider;
  readonly invoiceIssuePayloadResolver: InvoiceIssuePayloadResolver;
  readonly orderAccessEmailPayloadResolver?: OrderAccessEmailPayloadResolver;
}

export interface OperationWorkerResult {
  readonly claimed: boolean;
  readonly job: OperationJob | null;
}

const stringField = (
  payload: Readonly<Record<string, unknown>>,
  field: string,
): string => {
  const value = payload[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`INVALID_JOB_PAYLOAD:${field}`);
  }
  return value;
};

const integerField = (
  payload: Readonly<Record<string, unknown>>,
  field: string,
): number => {
  const value = payload[field];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`INVALID_JOB_PAYLOAD:${field}`);
  }
  return value as number;
};

const totalsField = (
  payload: Readonly<Record<string, unknown>>,
): OrderTotalsSnapshot => {
  const value = payload.totals;
  if (
    !value ||
    typeof value !== "object" ||
    !Number.isSafeInteger((value as { grossTwd?: unknown }).grossTwd)
  ) {
    throw new Error("INVALID_JOB_PAYLOAD:totals");
  }
  return value as OrderTotalsSnapshot;
};

const evidenceHash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const invalidJobPayload = (error: unknown): error is Error =>
  error instanceof Error &&
  error.message.startsWith("INVALID_JOB_PAYLOAD");

export class OperationsWorker {
  constructor(
    private readonly repository: OperationsWorkflowRepository,
    private readonly providers: OperationWorkerProviders,
  ) {}

  async runOne(input: {
    readonly workerId: string;
    readonly now?: number;
    readonly leaseMs?: number;
  }): Promise<OperationWorkerResult> {
    return this.#run(input, false);
  }

  async runReconciliationOne(input: {
    readonly workerId: string;
    readonly now?: number;
    readonly leaseMs?: number;
  }): Promise<OperationWorkerResult> {
    return this.#run(input, true);
  }

  async #run(
    input: {
      readonly workerId: string;
      readonly now?: number;
      readonly leaseMs?: number;
    },
    reconciliationOnly: boolean,
  ): Promise<OperationWorkerResult> {
    const fixedNow = input.now;
    const clock =
      fixedNow === undefined ? Date.now : () => fixedNow;
    const claimNow = clock();
    const claim = reconciliationOnly
      ? this.repository.claimNextReconciliationJob.bind(
          this.repository,
        )
      : this.repository.claimNextJob.bind(this.repository);
    const job = await claim({
      workerId: input.workerId,
      now: claimNow,
      leaseMs: input.leaseMs ?? 30_000,
    });
    if (!job) return Object.freeze({ claimed: false, job: null });
    const completed = await this.#execute(job, clock);
    return Object.freeze({ claimed: true, job: completed });
  }

  async #execute(
    job: OperationJob,
    clock: () => number,
  ): Promise<OperationJob> {
    if (!job.leaseToken) {
      throw new Error("Worker received a job without a lease token.");
    }
    const leaseToken = job.leaseToken;
    let dispatchStarted = job.dispatchStartedAt !== null;
    const startRemoteDispatch = async (): Promise<void> => {
      const fenced = await this.repository.markDispatchStarted({
        jobId: job.id,
        leaseToken,
        now: clock(),
      });
      if (fenced.dispatchStartedAt === null) {
        throw new Error("REMOTE_EFFECT_DISPATCH_FENCE_NOT_PERSISTED");
      }
      dispatchStarted = true;
    };
    try {
      switch (job.type) {
        case "payment.query": {
          const result = await this.providers.payment.queryTrade({
            merchantTradeNo: stringField(
              job.payload,
              "merchantTradeNo",
            ),
          });
          return this.repository.completeJob({
            jobId: job.id,
            leaseToken: job.leaseToken,
            outcome:
              result.tradeStatus === "unknown"
                ? job.attemptCount >= 5
                  ? "manual_review"
                  : "retry_safe"
                : "succeeded",
            evidenceHash: result.evidenceHash,
            result: { ...result },
            errorCode:
              result.tradeStatus === "unknown"
                ? job.attemptCount >= 5
                  ? "PAYMENT_QUERY_INCONCLUSIVE_MANUAL_REVIEW"
                  : "PAYMENT_QUERY_INCONCLUSIVE"
                : undefined,
            retryAfterMs: 30_000,
            now: clock(),
          });
        }
        case "payment.refund": {
          const providerTradeNo = stringField(
            job.payload,
            "providerTradeNo",
          );
          const amountTwd = integerField(job.payload, "amountTwd");
          await startRemoteDispatch();
          const result = await this.providers.payment.refund({
            operationKey: job.operationKey,
            providerTradeNo,
            amountTwd,
          });
          return this.repository.completeJob({
            jobId: job.id,
            leaseToken: job.leaseToken,
            outcome:
              result.state === "succeeded"
                ? "succeeded"
                : result.state === "failed_terminal"
                  ? "failed_terminal"
                  : "unknown",
            evidenceHash: evidenceHash(result),
            result: { ...result },
            errorCode:
              result.state === "unknown"
                ? "REFUND_OUTCOME_UNKNOWN"
                : undefined,
            now: clock(),
          });
        }
        case "invoice.issue": {
          const totals = totalsField(job.payload);
          let option: Readonly<Record<string, string>>;
          try {
            option =
              await this.providers.invoiceIssuePayloadResolver({
                aggregateId: job.aggregateId,
                operationKey: job.operationKey,
                payload: job.payload,
              });
          } catch (error) {
            const invalidPayload = invalidJobPayload(error);
            return this.repository.completeJob({
              jobId: job.id,
              leaseToken: job.leaseToken,
              outcome: invalidPayload
                ? "failed_terminal"
                : job.attemptCount >= 5
                  ? "manual_review"
                  : "retry_safe",
              errorCode: invalidPayload
                ? error.message
                : job.attemptCount >= 5
                  ? "INVOICE_PAYLOAD_RESOLUTION_MANUAL_REVIEW"
                  : "INVOICE_PAYLOAD_RESOLUTION_UNAVAILABLE",
              retryAfterMs: 30_000,
              now: clock(),
            });
          }
          await startRemoteDispatch();
          const result = await this.providers.invoice.issue({
            operationKey: job.operationKey,
            orderId: job.aggregateId,
            totals,
            option,
          });
          return this.repository.completeJob({
            jobId: job.id,
            leaseToken: job.leaseToken,
            outcome:
              result.state === "issued"
                ? "succeeded"
                : result.state === "failed_terminal"
                  ? "failed_terminal"
                  : "unknown",
            evidenceHash: evidenceHash(result),
            result: { ...result },
            errorCode:
              result.state === "unknown"
                ? "INVOICE_OUTCOME_UNKNOWN"
                : undefined,
            now: clock(),
          });
        }
        case "invoice.adjust": {
          const kind = stringField(job.payload, "kind");
          if (kind !== "void" && kind !== "allowance") {
            throw new Error("INVALID_JOB_PAYLOAD:kind");
          }
          const relateNumber = stringField(
            job.payload,
            "relateNumber",
          );
          const amountTwd = integerField(job.payload, "amountTwd");
          await startRemoteDispatch();
          const result = await this.providers.invoice.adjust({
            operationKey: job.operationKey,
            relateNumber,
            amountTwd,
            kind,
          });
          return this.repository.completeJob({
            jobId: job.id,
            leaseToken: job.leaseToken,
            outcome:
              result.state === "succeeded"
                ? "succeeded"
                : result.state === "failed_terminal"
                  ? "failed_terminal"
                  : "unknown",
            evidenceHash: evidenceHash(result),
            result: { ...result },
            errorCode:
              result.state === "unknown"
                ? "INVOICE_ADJUSTMENT_OUTCOME_UNKNOWN"
                : undefined,
            now: clock(),
          });
        }
        case "shipment.create": {
          const parcelCount = integerField(
            job.payload,
            "parcelCount",
          );
          await startRemoteDispatch();
          const result = await this.providers.logistics.createShipment({
            operationKey: job.operationKey,
            orderId: job.aggregateId,
            parcelCount,
          });
          return this.repository.completeJob({
            jobId: job.id,
            leaseToken: job.leaseToken,
            outcome:
              result.state === "created"
                ? "succeeded"
                : result.state === "failed_terminal"
                  ? "failed_terminal"
                  : "unknown",
            evidenceHash: evidenceHash(result),
            result: { ...result },
            errorCode:
              result.state === "unknown"
                ? "SHIPMENT_OUTCOME_UNKNOWN"
                : undefined,
            now: clock(),
          });
        }
        case "shipment.cancel": {
          const trackingId = stringField(job.payload, "trackingId");
          await startRemoteDispatch();
          const result = await this.providers.logistics.cancelShipment({
            operationKey: job.operationKey,
            trackingId,
          });
          return this.repository.completeJob({
            jobId: job.id,
            leaseToken: job.leaseToken,
            outcome:
              result.state === "unknown" ? "unknown" : "succeeded",
            evidenceHash: evidenceHash(result),
            result: { ...result },
            errorCode:
              result.state === "unknown"
                ? "SHIPMENT_CANCELLATION_UNKNOWN"
                : undefined,
            now: clock(),
          });
        }
        case "email.send": {
          let payload;
          try {
            if (job.payload.kind === "order_access_link") {
              const resolver =
                this.providers.orderAccessEmailPayloadResolver;
              if (!resolver) {
                throw new Error(
                  "INVALID_JOB_PAYLOAD:order_access_email_resolver",
                );
              }
              payload = await resolver(job.payload);
            } else {
              payload = {
                templateVersion: stringField(
                  job.payload,
                  "templateVersion",
                ),
                to: stringField(job.payload, "to"),
                subject: stringField(job.payload, "subject"),
                text: stringField(job.payload, "text"),
              };
            }
          } catch (error) {
            // Resolution happens before any provider dispatch. A transient
            // recipient lookup can therefore be retried safely; malformed
            // durable payloads are terminal.
            return this.repository.completeJob({
              jobId: job.id,
              leaseToken: job.leaseToken,
              outcome: invalidJobPayload(error)
                ? "failed_terminal"
                : "retry_safe",
              errorCode: invalidJobPayload(error)
                ? error.message
                : "EMAIL_PAYLOAD_RESOLUTION_UNAVAILABLE",
              retryAfterMs: 30_000,
              now: clock(),
            });
          }
          await startRemoteDispatch();
          const result = await this.providers.email.send({
            operationKey: job.operationKey,
            ...payload,
          });
          return this.repository.completeJob({
            jobId: job.id,
            leaseToken: job.leaseToken,
            outcome:
              result.state === "queued"
                ? "succeeded"
                : result.state === "failed_terminal"
                  ? "failed_terminal"
                  : "unknown",
            evidenceHash: evidenceHash(result),
            result: { ...result },
            errorCode:
              result.state === "unknown" ? "EMAIL_OUTCOME_UNKNOWN" : undefined,
            now: clock(),
          });
        }
      }
    } catch (error) {
      // A timeout/throw after dispatch can mean the provider applied the
      // effect. Mutating effects are never directly retried from this branch.
      const invalidPayload = invalidJobPayload(error);
      return this.repository.completeJob({
        jobId: job.id,
        leaseToken: job.leaseToken,
        outcome: dispatchStarted
          ? "unknown"
          : invalidPayload
            ? "failed_terminal"
            : "retry_safe",
        errorCode:
          !dispatchStarted &&
          invalidPayload &&
          error instanceof Error
            ? error.message
            : dispatchStarted
              ? "PROVIDER_TIMEOUT_OR_EXCEPTION_AFTER_DISPATCH"
              : "PRE_DISPATCH_UNAVAILABLE",
        retryAfterMs: 30_000,
        now: clock(),
      });
    }
  }
}
