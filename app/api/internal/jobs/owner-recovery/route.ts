import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { CommerceDomainError } from "@/lib/commerce/errors";
import { noStoreJson } from "@/lib/http";
import { getProductionOwnerRecoveryWorker } from "@/lib/admin/owner-recovery-runtime";
import { operationsErrorResponse } from "@/lib/operations/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const requestKeySchema = z.string()
  .min(16)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]+$/);

function assertWorkerCredential(request: Request): void {
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!expected) {
    throw new CommerceDomainError(
      "OWNER_RECOVERY_WORKER_DISABLED",
      "Owner recovery worker credential is unavailable.",
      503,
    );
  }
  const supplied = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (
    left.byteLength !== right.byteLength
    || !timingSafeEqual(left, right)
  ) {
    throw new CommerceDomainError(
      "OWNER_RECOVERY_WORKER_UNAUTHORIZED",
      "Owner recovery worker credential is invalid.",
      401,
    );
  }
}

export async function POST(request: Request) {
  try {
    assertWorkerCredential(request);
    const url = new URL(request.url);
    const limit = z.coerce.number().int().min(1).max(5).default(1)
      .parse(url.searchParams.get("limit") ?? undefined);
    const providedKey = request.headers.get("idempotency-key");
    const requestKey = providedKey
      ? requestKeySchema.parse(providedKey)
      : randomUUID();
    const worker = getProductionOwnerRecoveryWorker();
    const jobs: {
      readonly id: string;
      readonly state: string;
      readonly attemptCount: number;
    }[] = [];

    for (let index = 0; index < limit; index += 1) {
      const result = await worker.runOne({
        workerId: "vercel-owner-recovery-worker",
        runKey: `${requestKey}:${index}`,
      });
      if (!result.claimed || !result.job) break;
      jobs.push({
        id: result.job.id,
        state: result.job.state,
        attemptCount: result.job.attemptCount,
      });
    }

    return noStoreJson({
      processed: jobs.length,
      jobs,
    });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

// Scheduler-compatible without weakening the existing CRON_SECRET boundary.
export const GET = POST;
