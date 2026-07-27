import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";

import { POST as ownerRecoveryRoute } from "@/app/api/internal/jobs/owner-recovery/route";
import {
  isProductionOwnerRecoveryWorkerEnvironment,
} from "@/lib/admin/owner-recovery-runtime";
import {
  OwnerRecoveryAuthFailure,
  OwnerRecoveryWorker,
  type OwnerRecoveryAuthGateway,
  type OwnerRecoveryJob,
  type OwnerRecoveryOutboxRepository,
  SupabaseOwnerRecoveryAuthAdmin,
  SupabaseOwnerRecoveryOutboxRepository,
} from "@/lib/admin/owner-recovery-worker";

const ids = {
  job: "00000000-0000-4000-8000-000000000101",
  request: "00000000-0000-4000-8000-000000000102",
  target: "00000000-0000-4000-8000-000000000103",
  approver: "00000000-0000-4000-8000-000000000104",
  lease: "00000000-0000-4000-8000-000000000105",
  factorOne: "00000000-0000-4000-8000-000000000106",
  factorTwo: "00000000-0000-4000-8000-000000000107",
} as const;

const timestamp = "2026-07-28T04:00:00.000Z";

function leasedJob(): OwnerRecoveryJob {
  return {
    id: ids.job,
    operationKey: `auth-owner-recovery:${ids.request}`,
    jobType: "auth.revoke_sessions_and_recover",
    aggregateId: ids.target,
    payload: {
      recoveryRequestId: ids.request,
      targetUserId: ids.target,
      approvedBy: ids.approver,
    },
    state: "leased",
    attemptCount: 1,
    maxAttempts: 5,
    availableAt: timestamp,
    leaseToken: ids.lease,
    leaseExpiresAt: "2026-07-28T04:01:00.000Z",
    lastEvidenceHash: null,
    lastErrorCode: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

class FakeRecoveryRepository implements OwnerRecoveryOutboxRepository {
  readonly claims: Parameters<OwnerRecoveryOutboxRepository["claimNextJob"]>[0][] = [];
  readonly completions: Parameters<OwnerRecoveryOutboxRepository["completeJob"]>[0][] = [];

  constructor(private readonly job: OwnerRecoveryJob | null = leasedJob()) {}

  async claimNextJob(
    input: Parameters<OwnerRecoveryOutboxRepository["claimNextJob"]>[0],
  ) {
    this.claims.push(input);
    return this.job;
  }

  async completeJob(
    input: Parameters<OwnerRecoveryOutboxRepository["completeJob"]>[0],
  ): Promise<OwnerRecoveryJob> {
    this.completions.push(input);
    if (!this.job) throw new Error("Missing fake job.");
    return {
      ...this.job,
      state: input.outcome === "succeeded"
        ? "completed"
        : input.outcome === "retry_safe"
          ? "queued"
          : "dead_letter",
      leaseToken: null,
      leaseExpiresAt: null,
      lastEvidenceHash: input.evidenceHash ?? null,
      lastErrorCode: input.errorCode ?? null,
      result: input.result,
      completedAt: input.outcome === "retry_safe" ? null : timestamp,
    };
  }
}

function gateway(
  overrides: Partial<OwnerRecoveryAuthGateway> = {},
): OwnerRecoveryAuthGateway {
  return {
    async getUser() {
      return {
        id: ids.target,
        email: "owner@example.com",
        appMetadata: { provider: "email" },
      };
    },
    async listFactors() {
      return [];
    },
    async deleteFactor() {},
    async updateAppMetadata() {},
    async queuePasswordRecoveryEmail() {},
    ...overrides,
  };
}

const previousCronSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (previousCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previousCronSecret;
});

describe("Owner recovery Auth adapter", () => {
  it("removes only TOTP factors, preserves app metadata and queues one safe recovery email", async () => {
    const deleted: string[] = [];
    const metadata: Readonly<Record<string, unknown>>[] = [];
    const emails: { readonly email: string; readonly redirectTo: string }[] = [];
    const adapter = new SupabaseOwnerRecoveryAuthAdmin(gateway({
      async listFactors() {
        return [
          { id: ids.factorOne, factorType: "totp" },
          { id: ids.factorTwo, factorType: "webauthn" },
        ];
      },
      async deleteFactor(_userId, factorId) {
        deleted.push(factorId);
      },
      async updateAppMetadata(_userId, value) {
        metadata.push(value);
      },
      async queuePasswordRecoveryEmail(email, redirectTo) {
        emails.push({ email, redirectTo });
      },
    }));

    await expect(adapter.recover({
      recoveryRequestId: ids.request,
      targetUserId: ids.target,
    })).resolves.toEqual({
      sessionsRevoked: true,
      totpFactorsRemoved: 1,
      recoveryEmailQueued: true,
    });
    expect(deleted).toEqual([ids.factorOne]);
    expect(emails).toEqual([{
      email: "owner@example.com",
      redirectTo: "https://estatelignee.com/admin/recovery/confirm",
    }]);
    expect(metadata).toHaveLength(2);
    expect(metadata[0]).toMatchObject({
      provider: "email",
      lignee_owner_recovery: {
        requestId: ids.request,
        emailState: "dispatching",
        totpFactorsRemoved: 1,
      },
    });
    expect(metadata[1]).toMatchObject({
      provider: "email",
      lignee_owner_recovery: {
        requestId: ids.request,
        emailState: "queued",
        totpFactorsRemoved: 1,
      },
    });
  });

  it("replays a queued marker without resending and fails closed on an unknown dispatch outcome", async () => {
    let remoteCalls = 0;
    const queued = new SupabaseOwnerRecoveryAuthAdmin(gateway({
      async getUser() {
        return {
          id: ids.target,
          email: "owner@example.com",
          appMetadata: {
            lignee_owner_recovery: {
              requestId: ids.request,
              emailState: "queued",
              totpFactorsRemoved: 2,
            },
          },
        };
      },
      async listFactors() {
        remoteCalls += 1;
        return [];
      },
      async queuePasswordRecoveryEmail() {
        remoteCalls += 1;
      },
    }));
    await expect(queued.recover({
      recoveryRequestId: ids.request,
      targetUserId: ids.target,
    })).resolves.toMatchObject({
      totpFactorsRemoved: 2,
      recoveryEmailQueued: true,
    });
    expect(remoteCalls).toBe(0);

    const dispatching = new SupabaseOwnerRecoveryAuthAdmin(gateway({
      async getUser() {
        return {
          id: ids.target,
          email: "owner@example.com",
          appMetadata: {
            lignee_owner_recovery: {
              requestId: ids.request,
              emailState: "dispatching",
              totpFactorsRemoved: 2,
            },
          },
        };
      },
    }));
    await expect(dispatching.recover({
      recoveryRequestId: ids.request,
      targetUserId: ids.target,
    })).rejects.toMatchObject({
      code: "AUTH_RECOVERY_PRIOR_EMAIL_OUTCOME_UNKNOWN",
      retrySafe: false,
    });
  });
});

describe("Owner recovery worker", () => {
  it("writes a sanitized evidence-backed success through explicit idempotent RPC inputs", async () => {
    const repository = new FakeRecoveryRepository();
    const worker = new OwnerRecoveryWorker(
      repository,
      new SupabaseOwnerRecoveryAuthAdmin(gateway()),
    );
    const result = await worker.runOne({
      workerId: "owner-recovery-test-worker",
      runKey: "owner-recovery-test-run-0001",
      now: Date.parse(timestamp),
    });

    expect(result.job?.state).toBe("completed");
    expect(repository.claims).toHaveLength(1);
    expect(repository.claims[0]?.idempotencyKey).toMatch(
      /^owner-recovery\.claim\.[a-f0-9]{48}$/,
    );
    expect(repository.claims[0]?.requestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(repository.completions).toHaveLength(1);
    expect(repository.completions[0]).toMatchObject({
      outcome: "succeeded",
      result: {
        sessionsRevoked: true,
        totpFactorsRemoved: 0,
        recoveryEmailQueued: true,
      },
    });
    expect(repository.completions[0]?.idempotencyKey).toMatch(
      /^owner-recovery\.complete\.[a-f0-9]{48}$/,
    );
    expect(repository.completions[0]?.requestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(repository.completions[0]?.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(repository.completions[0])).not.toContain(
      "owner@example.com",
    );
    expect(JSON.stringify(repository.completions[0])).not.toContain(
      "access_token",
    );
  });

  it("retries only pre-dispatch failures and dead-letters an ambiguous email outcome", async () => {
    const retryRepository = new FakeRecoveryRepository();
    const retryWorker = new OwnerRecoveryWorker(
      retryRepository,
      new SupabaseOwnerRecoveryAuthAdmin(gateway({
        async listFactors() {
          throw new OwnerRecoveryAuthFailure(
            "AUTH_RECOVERY_FACTOR_LIST_FAILED",
            true,
          );
        },
      })),
    );
    await retryWorker.runOne({
      workerId: "owner-recovery-test-worker",
      runKey: "owner-recovery-test-run-0002",
      now: Date.parse(timestamp),
    });
    expect(retryRepository.completions[0]).toMatchObject({
      outcome: "retry_safe",
      errorCode: "AUTH_RECOVERY_FACTOR_LIST_FAILED",
      retryAfterMs: 30_000,
    });

    const terminalRepository = new FakeRecoveryRepository();
    const terminalWorker = new OwnerRecoveryWorker(
      terminalRepository,
      new SupabaseOwnerRecoveryAuthAdmin(gateway({
        async queuePasswordRecoveryEmail() {
          throw new Error("simulated provider timeout with secret details");
        },
      })),
    );
    await terminalWorker.runOne({
      workerId: "owner-recovery-test-worker",
      runKey: "owner-recovery-test-run-0003",
      now: Date.parse(timestamp),
    });
    expect(terminalRepository.completions[0]).toMatchObject({
      outcome: "failed_terminal",
      errorCode: "AUTH_RECOVERY_EMAIL_OUTCOME_UNKNOWN",
    });
    expect(JSON.stringify(terminalRepository.completions[0])).not.toContain(
      "secret details",
    );
  });

  it("uses the exact claim and complete RPC signatures", async () => {
    const calls: {
      readonly schema: string;
      readonly name: string;
      readonly args: Readonly<Record<string, unknown>>;
    }[] = [];
    const completed = {
      ...leasedJob(),
      state: "completed",
      leaseToken: null,
      leaseExpiresAt: null,
      result: {
        sessionsRevoked: true,
        totpFactorsRemoved: 2,
        recoveryEmailQueued: true,
      },
      completedAt: timestamp,
    };
    const client = {
      schema(schema: string) {
        return {
          async rpc(name: string, args: Readonly<Record<string, unknown>>) {
            calls.push({ schema, name, args });
            return {
              data: name === "worker_auth_recovery_claim"
                ? leasedJob()
                : completed,
              error: null,
            };
          },
        };
      },
    } as unknown as SupabaseClient;
    const repository = new SupabaseOwnerRecoveryOutboxRepository(client);
    const claim = await repository.claimNextJob({
      workerId: "owner-recovery-test-worker",
      idempotencyKey: "owner-recovery-claim-idem-0001",
      requestHash: "a".repeat(64),
      now: Date.parse(timestamp),
      leaseMs: 60_000,
    });
    await repository.completeJob({
      jobId: ids.job,
      leaseToken: ids.lease,
      idempotencyKey: "owner-recovery-complete-idem-0001",
      requestHash: "b".repeat(64),
      outcome: "succeeded",
      evidenceHash: "c".repeat(64),
      result: {
        sessionsRevoked: true,
        totpFactorsRemoved: 2,
        recoveryEmailQueued: true,
      },
      now: Date.parse(timestamp),
    });
    expect(claim?.id).toBe(ids.job);
    expect(calls).toEqual([
      {
        schema: "api",
        name: "worker_auth_recovery_claim",
        args: {
          p_worker_id: "owner-recovery-test-worker",
          p_idempotency_key: "owner-recovery-claim-idem-0001",
          p_request_hash: "a".repeat(64),
          p_now: timestamp,
          p_lease_seconds: 60,
        },
      },
      {
        schema: "api",
        name: "worker_auth_recovery_complete",
        args: {
          p_job_id: ids.job,
          p_lease_token: ids.lease,
          p_idempotency_key: "owner-recovery-complete-idem-0001",
          p_request_hash: "b".repeat(64),
          p_outcome: "succeeded",
          p_evidence_hash: "c".repeat(64),
          p_result: {
            sessionsRevoked: true,
            totpFactorsRemoved: 2,
            recoveryEmailQueued: true,
          },
          p_error_code: null,
          p_retry_after_seconds: null,
          p_now: timestamp,
        },
      },
    ]);
  });
});

describe("Owner recovery request and runtime boundaries", () => {
  it("accepts only a Production deployment with the lazy secret binding", () => {
    expect(isProductionOwnerRecoveryWorkerEnvironment({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      LIGNEE_MODE: "production-disabled",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "publishable-key-value-0001",
      SUPABASE_SECRET_KEY: "secret-key-value-000001",
      CRON_SECRET: "owner-recovery-cron-secret-value-0001",
    })).toBe(true);
    expect(isProductionOwnerRecoveryWorkerEnvironment({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      LIGNEE_MODE: "production-disabled",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "publishable-key-value-0001",
      SUPABASE_SECRET_KEY: "secret-key-value-000001",
      CRON_SECRET: "owner-recovery-cron-secret-value-0001",
    })).toBe(false);
  });

  it("rejects invalid worker credentials before the Production gate", async () => {
    process.env.CRON_SECRET = "owner-recovery-route-test-secret";
    const unauthorized = await ownerRecoveryRoute(new Request(
      "http://localhost:3000/api/internal/jobs/owner-recovery",
      {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
      },
    ));
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toMatchObject({
      error: { code: "OWNER_RECOVERY_WORKER_UNAUTHORIZED" },
    });

    const disabled = await ownerRecoveryRoute(new Request(
      "http://localhost:3000/api/internal/jobs/owner-recovery",
      {
        method: "POST",
        headers: {
          authorization: "Bearer owner-recovery-route-test-secret",
        },
      },
    ));
    expect(disabled.status).toBe(503);
    expect(await disabled.json()).toMatchObject({
      error: { code: "OWNER_RECOVERY_WORKER_DISABLED" },
    });
  });

  it("binds AAL1 requests to auth.uid while preserving second-Owner recent-AAL2 approval", () => {
    const source = readFileSync(
      new URL("../lib/admin/actions.ts", import.meta.url),
      "utf8",
    );
    const requestStart = source.indexOf(
      "export async function requestOwnerRecoveryAction",
    );
    const approvalStart = source.indexOf(
      "export async function approveOwnerRecoveryAction",
    );
    const requestSection = source.slice(requestStart, approvalStart);
    const approvalSection = source.slice(approvalStart);

    expect(requestSection).toContain("await assertAdminMutationOrigin()");
    expect(requestSection).toContain("client.auth.getUser()");
    expect(requestSection).toContain("getAdminOwnerRecoveryContext()");
    expect(requestSection).toContain("targetUserId: user.id");
    expect(requestSection).not.toContain("formData.get(\"targetUserId\")");
    expect(requestSection).not.toContain("requireRecentAal2()");
    expect(approvalSection).toContain("await requireAdminRole([\"owner\"])");
    expect(approvalSection).toContain("await requireRecentAal2()");
  });
});
