import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { POST as mediaCleanupRoute } from "@/app/api/internal/jobs/media-cleanup/route";
import type {
  MediaOrphanCleanupJob,
  MediaOrphanCleanupRepository,
} from "@/lib/media/orphan-cleanup";
import {
  MediaOrphanCleanupWorker,
  SupabaseMediaOrphanCleanupRepository,
} from "@/lib/media/orphan-cleanup";
import { SupabaseMediaStorage } from "@/lib/media/storage";

const leasedJob: MediaOrphanCleanupJob = {
  id: "151ac00c-f294-4d68-a102-a656299f68c0",
  intentId: "251ac00c-f294-4d68-a102-a656299f68c0",
  scope: "product",
  objectKind: "derivative",
  sha256: "a".repeat(64),
  bucketId: "lignee-public-derivatives",
  objectPath: `catalog/${"a".repeat(64)}/1600.webp`,
  state: "leased",
  attemptCount: 1,
  maxAttempts: 5,
  notBefore: "2026-07-27T00:00:00.000Z",
  leaseToken: "351ac00c-f294-4d68-a102-a656299f68c0",
  leaseExpiresAt: "2026-07-27T00:05:00.000Z",
  lastErrorCode: null,
  deletedAt: null,
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
};

const leasedSourceJob: MediaOrphanCleanupJob = {
  ...leasedJob,
  id: "451ac00c-f294-4d68-a102-a656299f68c0",
  objectKind: "source",
  sha256: null,
  bucketId: "lignee-product-source",
  objectPath:
    `incoming/product/product-51/${"b".repeat(64)}.jpg`,
};

class FakeRepository implements MediaOrphanCleanupRepository {
  completion:
  Parameters<MediaOrphanCleanupRepository["complete"]>[0] | null = null;

  constructor(private readonly claimed: MediaOrphanCleanupJob | null) {}

  async claimNext() {
    return this.claimed;
  }

  async complete(
    input: Parameters<MediaOrphanCleanupRepository["complete"]>[0],
  ) {
    this.completion = input;
    return {
      ...(this.claimed ?? leasedJob),
      state: input.outcome === "succeeded"
        ? "deleted" as const
        : "retry_pending" as const,
      leaseToken: null,
      leaseExpiresAt: null,
      lastErrorCode: input.errorCode ?? null,
      deletedAt: input.outcome === "succeeded"
        ? "2026-07-27T00:00:00.000Z"
        : null,
    };
  }
}

describe("media orphan cleanup worker", () => {
  it("deletes only the leased, server-validated derivative coordinate", async () => {
    const repository = new FakeRepository(leasedJob);
    const removed: { scope: string; objectPath: string }[] = [];
    const worker = new MediaOrphanCleanupWorker(repository, {
      async removeUnregisteredMediaObject(input) {
        removed.push(input);
      },
    });

    const result = await worker.runOne({
      workerId: "media-cleanup-test-worker",
      runKey: "media-cleanup-run-0001",
      now: Date.parse("2026-07-27T00:00:00.000Z"),
    });

    expect(removed).toEqual([{
      scope: "product",
      objectKind: "derivative",
      objectPath: leasedJob.objectPath,
    }]);
    expect(repository.completion).toMatchObject({
      candidateId: leasedJob.id,
      leaseToken: leasedJob.leaseToken,
      outcome: "succeeded",
    });
    expect(repository.completion?.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.job?.state).toBe("deleted");
  });

  it("records a retry-safe state when Storage deletion fails", async () => {
    const repository = new FakeRepository(leasedJob);
    const worker = new MediaOrphanCleanupWorker(repository, {
      async removeUnregisteredMediaObject() {
        throw new Error("temporary Storage failure");
      },
    });

    const result = await worker.runOne({
      workerId: "media-cleanup-test-worker",
      runKey: "media-cleanup-run-0002",
      now: Date.parse("2026-07-27T00:00:00.000Z"),
    });

    expect(repository.completion).toMatchObject({
      outcome: "retry_safe",
      errorCode: "MEDIA_STORAGE_DELETE_RETRY_SAFE",
      retryAfterMs: 15 * 60_000,
    });
    expect(result.job?.state).toBe("retry_pending");
  });

  it("cleans an abandoned product source through the source bucket mapping", async () => {
    const repository = new FakeRepository(leasedSourceJob);
    const removed: {
      scope: string;
      objectKind: string;
      objectPath: string;
    }[] = [];
    const worker = new MediaOrphanCleanupWorker(repository, {
      async removeUnregisteredMediaObject(input) {
        removed.push(input);
      },
    });
    await worker.runOne({
      workerId: "media-cleanup-test-worker",
      runKey: "media-cleanup-run-source-0001",
      now: Date.parse("2026-07-27T00:00:00.000Z"),
    });
    expect(removed).toEqual([{
      scope: "product",
      objectKind: "source",
      objectPath: leasedSourceJob.objectPath,
    }]);
  });

  it("maps product and support sources to their exact private buckets", async () => {
    const removals: { bucket: string; paths: string[] }[] = [];
    const client = {
      storage: {
        from(bucket: string) {
          return {
            async remove(paths: string[]) {
              removals.push({ bucket, paths });
              return { error: null };
            },
          };
        },
      },
    } as unknown as SupabaseClient;
    const storage = new SupabaseMediaStorage(client, {
      productSourceBucket: "lignee-product-source",
      productDerivativeBucket: "lignee-public-derivatives",
      supportAttachmentBucket: "lignee-support-attachments",
    });
    const productPath =
      `incoming/product/product-51/${"c".repeat(64)}.jpg`;
    const supportPath =
      `incoming/support/case-51/${"d".repeat(64)}.avif`;

    await storage.removeUnregisteredMediaObject({
      scope: "product",
      objectKind: "source",
      objectPath: productPath,
    });
    await storage.removeUnregisteredMediaObject({
      scope: "support",
      objectKind: "source",
      objectPath: supportPath,
    });

    expect(removals).toEqual([
      {
        bucket: "lignee-product-source",
        paths: [productPath],
      },
      {
        bucket: "lignee-support-attachments",
        paths: [supportPath],
      },
    ]);
  });

  it("refuses a source path whose embedded scope does not match", async () => {
    let addressedStorage = false;
    const client = {
      storage: {
        from() {
          addressedStorage = true;
          return {
            async remove() {
              return { error: null };
            },
          };
        },
      },
    } as unknown as SupabaseClient;
    const storage = new SupabaseMediaStorage(client, {
      productSourceBucket: "lignee-product-source",
      productDerivativeBucket: "lignee-public-derivatives",
      supportAttachmentBucket: "lignee-support-attachments",
    });

    await expect(storage.removeUnregisteredMediaObject({
      scope: "support",
      objectKind: "source",
      objectPath:
        `incoming/product/product-51/${"e".repeat(64)}.jpg`,
    })).rejects.toMatchObject({
      code: "INVALID_MEDIA_CLEANUP_PATH",
      httpStatus: 400,
    });
    expect(addressedStorage).toBe(false);
  });

  it("rejects a claimed source whose bucket does not match its scope", async () => {
    const invalidJob = {
      ...leasedSourceJob,
      scope: "support",
      bucketId: "lignee-product-source",
      objectPath:
        `incoming/support/case-51/${"f".repeat(64)}.jpg`,
    };
    const client = {
      schema() {
        return {
          async rpc() {
            return { data: invalidJob, error: null };
          },
        };
      },
    } as unknown as SupabaseClient;
    const repository = new SupabaseMediaOrphanCleanupRepository(client);

    await expect(repository.claimNext({
      workerId: "media-cleanup-test-worker",
      idempotencyKey: "media-cleanup-claim-invalid-bucket",
      requestHash: "1".repeat(64),
      now: Date.parse("2026-07-27T00:00:00.000Z"),
      leaseMs: 300_000,
    })).rejects.toMatchObject({
      code: "MEDIA_CLEANUP_INVALID_RESPONSE",
      httpStatus: 502,
    });
  });

  it("does not address Storage when no candidate is claimable", async () => {
    const repository = new FakeRepository(null);
    let called = false;
    const worker = new MediaOrphanCleanupWorker(repository, {
      async removeUnregisteredMediaObject() {
        called = true;
      },
    });
    const result = await worker.runOne({
      workerId: "media-cleanup-test-worker",
      runKey: "media-cleanup-run-0003",
      now: Date.parse("2026-07-27T00:00:00.000Z"),
    });
    expect(result).toEqual({ claimed: false, job: null });
    expect(called).toBe(false);
  });

  it("rejects an invalid scheduler credential before loading secrets", async () => {
    const previous = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "media-cleanup-route-secret";
    try {
      const response = await mediaCleanupRoute(new Request(
        "http://localhost:3000/api/internal/jobs/media-cleanup",
        {
          method: "POST",
          headers: { authorization: "Bearer incorrect" },
        },
      ));
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        error: { code: "MEDIA_CLEANUP_WORKER_UNAUTHORIZED" },
      });
    } finally {
      if (previous === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previous;
    }
  });
});
