import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { CommerceDomainError } from "@/lib/commerce/errors";

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const workerKeySchema = z.string().regex(
  /^[A-Za-z0-9][A-Za-z0-9_.:-]{15,199}$/,
);

const recoveryPayloadSchema = z.strictObject({
  recoveryRequestId: uuidSchema,
  targetUserId: uuidSchema,
  approvedBy: uuidSchema,
});

const recoveryResultSchema = z.strictObject({
  sessionsRevoked: z.literal(true),
  totpFactorsRemoved: z.number().int().nonnegative(),
  recoveryEmailQueued: z.literal(true),
  messageId: z.string().min(1).max(200).optional(),
});

const recoveryJobSchema = z.strictObject({
  id: uuidSchema,
  operationKey: z.string().min(1),
  jobType: z.literal("auth.revoke_sessions_and_recover"),
  aggregateId: uuidSchema,
  payload: recoveryPayloadSchema,
  state: z.enum(["queued", "leased", "completed", "dead_letter"]),
  attemptCount: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  availableAt: timestampSchema,
  leaseToken: uuidSchema.nullable(),
  leaseExpiresAt: timestampSchema.nullable(),
  lastEvidenceHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  lastErrorCode: z.string().nullable(),
  result: z.union([
    recoveryResultSchema,
    z.strictObject({}),
  ]).nullable().optional(),
  completedAt: timestampSchema.nullable().optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type OwnerRecoveryJob = z.infer<typeof recoveryJobSchema>;
export type OwnerRecoverySuccessResult = z.infer<
  typeof recoveryResultSchema
>;
export type OwnerRecoveryCompletionOutcome =
  | "succeeded"
  | "retry_safe"
  | "failed_terminal";

export interface OwnerRecoveryOutboxRepository {
  claimNextJob(input: {
    readonly workerId: string;
    readonly idempotencyKey: string;
    readonly requestHash: string;
    readonly now: number;
    readonly leaseMs: number;
  }): Promise<OwnerRecoveryJob | null>;
  completeJob(input: {
    readonly jobId: string;
    readonly leaseToken: string;
    readonly idempotencyKey: string;
    readonly requestHash: string;
    readonly outcome: OwnerRecoveryCompletionOutcome;
    readonly evidenceHash?: string;
    readonly result?: OwnerRecoverySuccessResult;
    readonly errorCode?: string;
    readonly retryAfterMs?: number;
    readonly now: number;
  }): Promise<OwnerRecoveryJob>;
}

interface RpcErrorLike {
  readonly code?: string;
  readonly message?: string;
  readonly details?: string;
  readonly hint?: string;
}

function rpcFailure(error: RpcErrorLike): never {
  const source = [
    error.code,
    error.message,
    error.details,
    error.hint,
  ].filter(Boolean).join(" ");
  if (source.includes("IDEMPOTENCY_PAYLOAD_CONFLICT")) {
    throw new CommerceDomainError(
      "OWNER_RECOVERY_WORKER_IDEMPOTENCY_CONFLICT",
      "Owner recovery worker idempotency payload conflict.",
      409,
    );
  }
  if (
    source.includes("LEASE_CONFLICT")
    || source.includes("CLAIM_CONFLICT")
    || source.includes("WORKER_COMMAND_IN_PROGRESS")
  ) {
    throw new CommerceDomainError(
      "OWNER_RECOVERY_WORKER_CONFLICT",
      "Owner recovery worker command is already being handled.",
      409,
    );
  }
  throw new CommerceDomainError(
    "OWNER_RECOVERY_WORKER_RPC_UNAVAILABLE",
    "Owner recovery worker RPC is unavailable and remains fail closed.",
    error.code === "PGRST202" ? 503 : 502,
  );
}

function parseJob(value: unknown, label: string): OwnerRecoveryJob {
  const parsed = recoveryJobSchema.safeParse(value);
  if (!parsed.success) {
    throw new CommerceDomainError(
      "OWNER_RECOVERY_WORKER_INVALID_RESPONSE",
      `Owner recovery ${label} response is invalid.`,
      502,
    );
  }
  return Object.freeze(parsed.data);
}

export class SupabaseOwnerRecoveryOutboxRepository
implements OwnerRecoveryOutboxRepository {
  constructor(private readonly client: SupabaseClient) {}

  async claimNextJob(input: {
    readonly workerId: string;
    readonly idempotencyKey: string;
    readonly requestHash: string;
    readonly now: number;
    readonly leaseMs: number;
  }): Promise<OwnerRecoveryJob | null> {
    workerKeySchema.parse(input.idempotencyKey);
    const args = {
      p_worker_id: input.workerId,
      p_idempotency_key: input.idempotencyKey,
      p_request_hash: input.requestHash,
      p_now: new Date(input.now).toISOString(),
      p_lease_seconds: Math.max(
        15,
        Math.min(300, Math.floor(input.leaseMs / 1_000)),
      ),
    };
    let response = await this.client
      .schema("api")
      .rpc("worker_auth_recovery_claim", args);
    if (response.error) {
      // The RPC receipt binds this exact key and payload hash, so one replay
      // safely covers a response lost after commit without claiming twice.
      response = await this.client
        .schema("api")
        .rpc("worker_auth_recovery_claim", args);
    }
    const { data, error } = response;
    if (error) rpcFailure(error);
    if (data === null) return null;
    const job = parseJob(data, "claim");
    if (job.state !== "leased" || !job.leaseToken) {
      throw new CommerceDomainError(
        "OWNER_RECOVERY_WORKER_INVALID_LEASE",
        "Owner recovery claim did not return an active lease.",
        502,
      );
    }
    return job;
  }

  async completeJob(input: {
    readonly jobId: string;
    readonly leaseToken: string;
    readonly idempotencyKey: string;
    readonly requestHash: string;
    readonly outcome: OwnerRecoveryCompletionOutcome;
    readonly evidenceHash?: string;
    readonly result?: OwnerRecoverySuccessResult;
    readonly errorCode?: string;
    readonly retryAfterMs?: number;
    readonly now: number;
  }): Promise<OwnerRecoveryJob> {
    workerKeySchema.parse(input.idempotencyKey);
    const args = {
      p_job_id: input.jobId,
      p_lease_token: input.leaseToken,
      p_idempotency_key: input.idempotencyKey,
      p_request_hash: input.requestHash,
      p_outcome: input.outcome,
      p_evidence_hash: input.evidenceHash ?? null,
      p_result: input.result ?? {},
      p_error_code: input.errorCode ?? null,
      p_retry_after_seconds: input.retryAfterMs === undefined
        ? null
        : Math.max(1, Math.floor(input.retryAfterMs / 1_000)),
      p_now: new Date(input.now).toISOString(),
    };
    let response = await this.client
      .schema("api")
      .rpc("worker_auth_recovery_complete", args);
    if (response.error) {
      response = await this.client
        .schema("api")
        .rpc("worker_auth_recovery_complete", args);
    }
    const { data, error } = response;
    if (error) rpcFailure(error);
    return parseJob(data, "completion");
  }
}

export interface OwnerRecoveryAuthUser {
  readonly id: string;
  readonly email?: string;
  readonly appMetadata: Readonly<Record<string, unknown>>;
}

export interface OwnerRecoveryAuthFactor {
  readonly id: string;
  readonly factorType: string;
}

export interface OwnerRecoveryAuthGateway {
  getUser(userId: string): Promise<OwnerRecoveryAuthUser | null>;
  listFactors(userId: string): Promise<readonly OwnerRecoveryAuthFactor[]>;
  deleteFactor(userId: string, factorId: string): Promise<void>;
  updateAppMetadata(
    userId: string,
    appMetadata: Readonly<Record<string, unknown>>,
  ): Promise<void>;
  queuePasswordRecoveryEmail(
    email: string,
    redirectTo: string,
  ): Promise<void>;
}

export function createSupabaseOwnerRecoveryAuthGateway(
  client: SupabaseClient,
): OwnerRecoveryAuthGateway {
  return {
    async getUser(userId) {
      const { data, error } = await client.auth.admin.getUserById(userId);
      if (error) {
        throw new OwnerRecoveryAuthFailure(
          "AUTH_RECOVERY_USER_LOOKUP_FAILED",
          true,
        );
      }
      if (!data.user) return null;
      return {
        id: data.user.id,
        email: data.user.email,
        appMetadata: data.user.app_metadata ?? {},
      };
    },
    async listFactors(userId) {
      const { data, error } = await client.auth.admin.mfa.listFactors({
        userId,
      });
      if (error) {
        throw new OwnerRecoveryAuthFailure(
          "AUTH_RECOVERY_FACTOR_LIST_FAILED",
          true,
        );
      }
      return data.factors.map((factor) => ({
        id: factor.id,
        factorType: factor.factor_type,
      }));
    },
    async deleteFactor(userId, factorId) {
      const { error } = await client.auth.admin.mfa.deleteFactor({
        userId,
        id: factorId,
      });
      if (error) {
        throw new OwnerRecoveryAuthFailure(
          "AUTH_RECOVERY_FACTOR_DELETE_FAILED",
          true,
        );
      }
    },
    async updateAppMetadata(userId, appMetadata) {
      const { error } = await client.auth.admin.updateUserById(userId, {
        app_metadata: { ...appMetadata },
      });
      if (error) {
        throw new OwnerRecoveryAuthFailure(
          "AUTH_RECOVERY_MARKER_WRITE_FAILED",
          true,
        );
      }
    },
    async queuePasswordRecoveryEmail(email, redirectTo) {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (error) {
        throw new OwnerRecoveryAuthFailure(
          "AUTH_RECOVERY_EMAIL_OUTCOME_UNKNOWN",
          false,
        );
      }
    },
  };
}

interface RecoveryMarker {
  readonly requestId: string;
  readonly emailState: "dispatching" | "queued";
  readonly totpFactorsRemoved: number;
}

function recoveryMarker(
  value: unknown,
): RecoveryMarker | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const item = value as Readonly<Record<string, unknown>>;
  if (
    typeof item.requestId !== "string"
    || (item.emailState !== "dispatching" && item.emailState !== "queued")
    || !Number.isSafeInteger(item.totpFactorsRemoved)
    || (item.totpFactorsRemoved as number) < 0
  ) {
    return null;
  }
  return {
    requestId: item.requestId,
    emailState: item.emailState,
    totpFactorsRemoved: item.totpFactorsRemoved as number,
  };
}

export class OwnerRecoveryAuthFailure extends Error {
  constructor(
    readonly code: string,
    readonly retrySafe: boolean,
  ) {
    super(code);
    this.name = "OwnerRecoveryAuthFailure";
  }
}

export class SupabaseOwnerRecoveryAuthAdmin {
  constructor(
    private readonly gateway: OwnerRecoveryAuthGateway,
    private readonly recoveryRedirectUrl =
      "https://estatelignee.com/admin/recovery/confirm",
  ) {}

  async recover(input: {
    readonly recoveryRequestId: string;
    readonly targetUserId: string;
  }): Promise<OwnerRecoverySuccessResult> {
    const user = await this.gateway.getUser(input.targetUserId);
    if (!user || user.id !== input.targetUserId || !user.email) {
      throw new OwnerRecoveryAuthFailure(
        "AUTH_RECOVERY_TARGET_INVALID",
        false,
      );
    }

    const priorMarker = recoveryMarker(
      user.appMetadata.lignee_owner_recovery,
    );
    if (
      priorMarker?.requestId === input.recoveryRequestId
      && priorMarker.emailState === "queued"
    ) {
      return {
        sessionsRevoked: true,
        totpFactorsRemoved: priorMarker.totpFactorsRemoved,
        recoveryEmailQueued: true,
      };
    }
    if (
      priorMarker?.requestId === input.recoveryRequestId
      && priorMarker.emailState === "dispatching"
    ) {
      throw new OwnerRecoveryAuthFailure(
        "AUTH_RECOVERY_PRIOR_EMAIL_OUTCOME_UNKNOWN",
        false,
      );
    }

    const factors = await this.gateway.listFactors(input.targetUserId);
    const totpFactors = factors.filter(
      (factor) => factor.factorType === "totp",
    );
    for (const factor of totpFactors) {
      await this.gateway.deleteFactor(input.targetUserId, factor.id);
    }

    const dispatchingMarker: RecoveryMarker = {
      requestId: input.recoveryRequestId,
      emailState: "dispatching",
      totpFactorsRemoved: totpFactors.length,
    };
    await this.gateway.updateAppMetadata(input.targetUserId, {
      ...user.appMetadata,
      lignee_owner_recovery: dispatchingMarker,
    });

    try {
      await this.gateway.queuePasswordRecoveryEmail(
        user.email,
        this.recoveryRedirectUrl,
      );
    } catch {
      throw new OwnerRecoveryAuthFailure(
        "AUTH_RECOVERY_EMAIL_OUTCOME_UNKNOWN",
        false,
      );
    }

    try {
      await this.gateway.updateAppMetadata(input.targetUserId, {
        ...user.appMetadata,
        lignee_owner_recovery: {
          ...dispatchingMarker,
          emailState: "queued",
        } satisfies RecoveryMarker,
      });
    } catch {
      throw new OwnerRecoveryAuthFailure(
        "AUTH_RECOVERY_MARKER_FINALIZE_FAILED",
        false,
      );
    }

    return {
      sessionsRevoked: true,
      totpFactorsRemoved: totpFactors.length,
      recoveryEmailQueued: true,
    };
  }
}

function sha256(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function workerCommandKey(
  kind: "claim" | "complete",
  seed: string,
): string {
  return `owner-recovery.${kind}.${sha256(seed).slice(0, 48)}`;
}

export function ownerRecoveryClaimRequestHash(input: {
  readonly workerId: string;
  readonly now: number;
  readonly leaseMs: number;
}): string {
  return sha256({
    leaseSeconds: Math.max(
      15,
      Math.min(300, Math.floor(input.leaseMs / 1_000)),
    ),
    now: new Date(input.now).toISOString(),
    operation: "auth_recovery.claim",
    workerId: input.workerId,
  });
}

function ownerRecoveryCompletionRequestHash(input: {
  readonly jobId: string;
  readonly leaseToken: string;
  readonly outcome: OwnerRecoveryCompletionOutcome;
  readonly evidenceHash?: string;
  readonly result?: OwnerRecoverySuccessResult;
  readonly errorCode?: string;
  readonly retryAfterMs?: number;
  readonly now: number;
}): string {
  return sha256({
    errorCode: input.errorCode ?? null,
    evidenceHash: input.evidenceHash ?? null,
    jobId: input.jobId,
    leaseToken: input.leaseToken,
    now: new Date(input.now).toISOString(),
    operation: "auth_recovery.complete",
    outcome: input.outcome,
    result: input.result ?? {},
    retryAfterSeconds: input.retryAfterMs === undefined
      ? null
      : Math.max(1, Math.floor(input.retryAfterMs / 1_000)),
  });
}

export interface OwnerRecoveryWorkerRunResult {
  readonly claimed: boolean;
  readonly job: OwnerRecoveryJob | null;
}

export class OwnerRecoveryWorker {
  constructor(
    private readonly repository: OwnerRecoveryOutboxRepository,
    private readonly authAdmin: SupabaseOwnerRecoveryAuthAdmin,
  ) {}

  async runOne(input: {
    readonly workerId: string;
    readonly runKey: string;
    readonly now?: number;
    readonly leaseMs?: number;
  }): Promise<OwnerRecoveryWorkerRunResult> {
    const now = input.now ?? Date.now();
    const leaseMs = input.leaseMs ?? 120_000;
    const claimKey = workerCommandKey("claim", input.runKey);
    const job = await this.repository.claimNextJob({
      workerId: input.workerId,
      idempotencyKey: claimKey,
      requestHash: ownerRecoveryClaimRequestHash({
        workerId: input.workerId,
        now,
        leaseMs,
      }),
      now,
      leaseMs,
    });
    if (!job) return Object.freeze({ claimed: false, job: null });
    if (!job.leaseToken) {
      throw new CommerceDomainError(
        "OWNER_RECOVERY_WORKER_INVALID_LEASE",
        "Owner recovery worker received a job without a lease token.",
        502,
      );
    }

    const completionKey = workerCommandKey(
      "complete",
      `${input.runKey}:${job.id}:${job.leaseToken}`,
    );
    const complete = async (
      completion: Omit<
        Parameters<OwnerRecoveryOutboxRepository["completeJob"]>[0],
        | "jobId"
        | "leaseToken"
        | "idempotencyKey"
        | "requestHash"
        | "now"
      >,
    ) => {
      const command = {
        jobId: job.id,
        leaseToken: job.leaseToken as string,
        ...completion,
        now,
      };
      return this.repository.completeJob({
        ...command,
        idempotencyKey: completionKey,
        requestHash: ownerRecoveryCompletionRequestHash(command),
      });
    };

    try {
      const payload = recoveryPayloadSchema.parse(job.payload);
      if (
        job.aggregateId !== payload.targetUserId
        || job.operationKey
          !== `auth-owner-recovery:${payload.recoveryRequestId}`
      ) {
        throw new OwnerRecoveryAuthFailure(
          "AUTH_RECOVERY_JOB_PAYLOAD_INVALID",
          false,
        );
      }
      const result = await this.authAdmin.recover(payload);
      const completed = await complete({
        outcome: "succeeded",
        evidenceHash: sha256({
          jobId: job.id,
          operationKey: job.operationKey,
          recoveryRequestId: payload.recoveryRequestId,
          result,
        }),
        result,
      });
      return Object.freeze({ claimed: true, job: completed });
    } catch (error) {
      const failure = error instanceof OwnerRecoveryAuthFailure
        ? error
        : new OwnerRecoveryAuthFailure(
            error instanceof z.ZodError
              ? "AUTH_RECOVERY_JOB_PAYLOAD_INVALID"
              : "AUTH_RECOVERY_UNCLASSIFIED_FAILURE",
            false,
          );
      const completed = await complete({
        outcome: failure.retrySafe ? "retry_safe" : "failed_terminal",
        errorCode: failure.code,
        retryAfterMs: failure.retrySafe
          ? Math.min(86_400_000, 30_000 * 2 ** Math.max(0, job.attemptCount - 1))
          : undefined,
      });
      return Object.freeze({ claimed: true, job: completed });
    }
  }
}
