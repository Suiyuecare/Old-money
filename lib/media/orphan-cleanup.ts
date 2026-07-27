import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { CommerceDomainError } from "@/lib/commerce/errors";
import { hashIdempotencyRequest } from "@/lib/commerce/idempotency";

import {
  isSafeDerivedObjectPath,
  isSafeSourceObjectPath,
  mediaScopeSchema,
  type MediaScope,
} from "./contracts";
import type { MediaStorage } from "./storage";

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const workerKeySchema = z.string().regex(
  /^[A-Za-z0-9][A-Za-z0-9_.:-]{15,199}$/,
);

const cleanupJobSchema = z.strictObject({
  id: uuidSchema,
  intentId: uuidSchema,
  scope: mediaScopeSchema,
  objectKind: z.enum(["derivative", "source"]),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  bucketId: z.enum([
    "lignee-product-source",
    "lignee-public-derivatives",
    "lignee-support-attachments",
  ]),
  objectPath: z.string().min(1).max(420),
  state: z.enum([
    "queued",
    "leased",
    "retry_pending",
    "quarantined",
    "deleted",
    "protected",
    "dead_letter",
  ]),
  attemptCount: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  notBefore: timestampSchema,
  leaseToken: uuidSchema.nullable(),
  leaseExpiresAt: timestampSchema.nullable(),
  lastErrorCode: z.string().nullable(),
  deletedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).superRefine((value, context) => {
  const expectedBucket = value.scope === "product"
    ? value.objectKind === "derivative"
      ? "lignee-public-derivatives"
      : "lignee-product-source"
    : "lignee-support-attachments";
  const validPath = value.objectKind === "derivative"
    ? (
        value.sha256 !== null
        && isSafeDerivedObjectPath(value.scope, value.objectPath)
        && value.objectPath.split("/")[1] === value.sha256
      )
    : (
        value.sha256 === null
        && isSafeSourceObjectPath(value.objectPath)
        && value.objectPath.split("/")[1] === value.scope
      );
  if (
    value.bucketId !== expectedBucket
    || !validPath
  ) {
    context.addIssue({
      code: "custom",
      message: "Cleanup job Storage coordinates are inconsistent.",
    });
  }
});

export type MediaOrphanCleanupJob = z.infer<typeof cleanupJobSchema>;

export interface MediaOrphanCleanupRepository {
  claimNext(input: {
    readonly workerId: string;
    readonly idempotencyKey: string;
    readonly requestHash: string;
    readonly now: number;
    readonly leaseMs: number;
  }): Promise<MediaOrphanCleanupJob | null>;
  complete(input: {
    readonly candidateId: string;
    readonly leaseToken: string;
    readonly idempotencyKey: string;
    readonly requestHash: string;
    readonly outcome: "succeeded" | "retry_safe";
    readonly evidenceHash?: string;
    readonly errorCode?: string;
    readonly retryAfterMs?: number;
    readonly now: number;
  }): Promise<MediaOrphanCleanupJob>;
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
      "MEDIA_CLEANUP_IDEMPOTENCY_CONFLICT",
      "Media cleanup idempotency payload conflict.",
      409,
    );
  }
  if (
    source.includes("LEASE_CONFLICT")
    || source.includes("CLAIM_CONFLICT")
    || source.includes("WORKER_COMMAND_IN_PROGRESS")
  ) {
    throw new CommerceDomainError(
      "MEDIA_CLEANUP_WORKER_CONFLICT",
      "Media cleanup is already being handled.",
      409,
    );
  }
  throw new CommerceDomainError(
    "MEDIA_CLEANUP_RPC_UNAVAILABLE",
    "Durable media cleanup is unavailable and remains fail closed.",
    error.code === "PGRST202" ? 503 : 502,
  );
}

function parseJob(
  value: unknown,
  label: string,
): MediaOrphanCleanupJob {
  const parsed = cleanupJobSchema.safeParse(value);
  if (!parsed.success) {
    throw new CommerceDomainError(
      "MEDIA_CLEANUP_INVALID_RESPONSE",
      `Media cleanup ${label} response is invalid.`,
      502,
    );
  }
  return Object.freeze(parsed.data);
}

export class SupabaseMediaOrphanCleanupRepository
implements MediaOrphanCleanupRepository {
  constructor(private readonly client: SupabaseClient) {}

  async claimNext(input: {
    readonly workerId: string;
    readonly idempotencyKey: string;
    readonly requestHash: string;
    readonly now: number;
    readonly leaseMs: number;
  }): Promise<MediaOrphanCleanupJob | null> {
    workerKeySchema.parse(input.idempotencyKey);
    const args = {
      p_worker_id: input.workerId,
      p_idempotency_key: input.idempotencyKey,
      p_request_hash: input.requestHash,
      p_now: new Date(input.now).toISOString(),
      p_lease_seconds: Math.max(
        60,
        Math.min(300, Math.floor(input.leaseMs / 1_000)),
      ),
    };
    let response = await this.client
      .schema("api")
      .rpc("worker_media_orphan_cleanup_claim", args);
    if (response.error) {
      response = await this.client
        .schema("api")
        .rpc("worker_media_orphan_cleanup_claim", args);
    }
    const { data, error } = response;
    if (error) rpcFailure(error);
    if (data === null) return null;
    const job = parseJob(data, "claim");
    if (job.state !== "leased" || !job.leaseToken) {
      throw new CommerceDomainError(
        "MEDIA_CLEANUP_INVALID_LEASE",
        "Media cleanup claim did not return an active lease.",
        502,
      );
    }
    return job;
  }

  async complete(input: {
    readonly candidateId: string;
    readonly leaseToken: string;
    readonly idempotencyKey: string;
    readonly requestHash: string;
    readonly outcome: "succeeded" | "retry_safe";
    readonly evidenceHash?: string;
    readonly errorCode?: string;
    readonly retryAfterMs?: number;
    readonly now: number;
  }): Promise<MediaOrphanCleanupJob> {
    workerKeySchema.parse(input.idempotencyKey);
    const args = {
      p_candidate_id: input.candidateId,
      p_lease_token: input.leaseToken,
      p_idempotency_key: input.idempotencyKey,
      p_request_hash: input.requestHash,
      p_outcome: input.outcome,
      p_evidence_hash: input.evidenceHash ?? null,
      p_error_code: input.errorCode ?? null,
      p_retry_after_seconds: input.retryAfterMs === undefined
        ? null
        : Math.max(60, Math.floor(input.retryAfterMs / 1_000)),
      p_now: new Date(input.now).toISOString(),
    };
    let response = await this.client
      .schema("api")
      .rpc("worker_media_orphan_cleanup_complete", args);
    if (response.error) {
      response = await this.client
        .schema("api")
        .rpc("worker_media_orphan_cleanup_complete", args);
    }
    const { data, error } = response;
    if (error) rpcFailure(error);
    return parseJob(data, "completion");
  }
}

export interface MediaOrphanCleanupRunResult {
  readonly claimed: boolean;
  readonly job: MediaOrphanCleanupJob | null;
}

const evidenceHash = (job: MediaOrphanCleanupJob): string =>
  createHash("sha256")
    .update("lignee-media-orphan-deleted-v1\0")
    .update(job.bucketId)
    .update("\0")
    .update(job.objectPath)
    .digest("hex");

export class MediaOrphanCleanupWorker {
  constructor(
    private readonly repository: MediaOrphanCleanupRepository,
    private readonly storage: Pick<
      MediaStorage,
      "removeUnregisteredMediaObject"
    >,
    private readonly clock: () => number = Date.now,
  ) {}

  async runOne(input: {
    readonly workerId: string;
    readonly runKey: string;
    readonly now?: number;
    readonly leaseMs?: number;
  }): Promise<MediaOrphanCleanupRunResult> {
    const now = input.now ?? this.clock();
    const claimRequest = {
      workerId: input.workerId,
      now,
      leaseMs: input.leaseMs ?? 300_000,
    };
    const job = await this.repository.claimNext({
      ...claimRequest,
      idempotencyKey: `${input.runKey}:claim`,
      requestHash: hashIdempotencyRequest(claimRequest),
    });
    if (!job) return Object.freeze({ claimed: false, job: null });
    if (!job.leaseToken) {
      throw new CommerceDomainError(
        "MEDIA_CLEANUP_INVALID_LEASE",
        "Media cleanup worker received no lease token.",
        502,
      );
    }

    let outcome: "succeeded" | "retry_safe" = "succeeded";
    let errorCode: string | undefined;
    let deletionEvidence: string | undefined;
    try {
      await this.storage.removeUnregisteredMediaObject({
        scope: job.scope as MediaScope,
        objectKind: job.objectKind,
        objectPath: job.objectPath,
      });
      deletionEvidence = evidenceHash(job);
    } catch {
      // Storage deletion is idempotent, and the database lease blocks any
      // asset from claiming this SHA while an outcome is uncertain.
      outcome = "retry_safe";
      errorCode = "MEDIA_STORAGE_DELETE_RETRY_SAFE";
    }

    const completionRequest = {
      candidateId: job.id,
      leaseToken: job.leaseToken,
      outcome,
      evidenceHash: deletionEvidence,
      errorCode,
      retryAfterMs: outcome === "retry_safe" ? 15 * 60_000 : undefined,
      // Use completion time for the database lease fence. Tests can pass an
      // explicit `now`; Production samples the injected clock again after the
      // Storage request returns.
      now: input.now ?? this.clock(),
    } as const;
    const completed = await this.repository.complete({
      ...completionRequest,
      idempotencyKey: `${input.runKey}:complete:${job.id}`,
      requestHash: hashIdempotencyRequest(completionRequest),
    });
    return Object.freeze({ claimed: true, job: completed });
  }
}
