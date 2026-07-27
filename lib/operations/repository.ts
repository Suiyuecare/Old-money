import type { AdminIdentity } from "@/lib/admin/types";

import type {
  OperationJob,
  OperationsCommand,
  OperationsCommandResult,
  OperationsProjection,
  OperationsQueueKind,
  OperationsQueuePage,
  PaymentCallbackInput,
  ProviderEventInput,
  ProviderEventRecord,
} from "./contracts";

export type OperationCompletionOutcome =
  | "succeeded"
  | "retry_safe"
  | "unknown"
  | "failed_terminal"
  | "manual_review";

export interface OperationsWorkflowRepository {
  executeCommand(
    command: OperationsCommand,
    actor: Pick<AdminIdentity, "userId" | "role">,
  ): Promise<OperationsCommandResult>;
  findProjection(aggregateId: string): Promise<OperationsProjection | null>;
  listQueue(input: {
    readonly kind: OperationsQueueKind;
    readonly limit: number;
    readonly offset: number;
  }): Promise<OperationsQueuePage>;
  recordProviderEvent(input: ProviderEventInput): Promise<ProviderEventRecord>;
  recordPaymentCallback(
    input: PaymentCallbackInput,
  ): Promise<ProviderEventRecord>;
  claimNextJob(input: {
    readonly workerId: string;
    readonly now: number;
    readonly leaseMs: number;
  }): Promise<OperationJob | null>;
  claimNextReconciliationJob(input: {
    readonly workerId: string;
    readonly now: number;
    readonly leaseMs: number;
  }): Promise<OperationJob | null>;
  markDispatchStarted(input: {
    readonly jobId: string;
    readonly leaseToken: string;
    readonly now: number;
  }): Promise<OperationJob>;
  completeJob(input: {
    readonly jobId: string;
    readonly leaseToken: string;
    readonly outcome: OperationCompletionOutcome;
    readonly evidenceHash?: string;
    readonly result?: Readonly<Record<string, unknown>>;
    readonly errorCode?: string;
    readonly retryAfterMs?: number;
    readonly now: number;
  }): Promise<OperationJob>;
}
