import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { CommerceDomainError } from "@/lib/commerce/errors";
import {
  getOperationWorkerProviders,
  getWorkerOperationsRepository,
} from "@/lib/operations/container";
import { operationsErrorResponse } from "@/lib/operations/http";
import { OperationsWorker } from "@/lib/operations/worker";
import { noStoreJson } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function assertWorkerCredential(request: Request): void {
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!expected) {
    throw new CommerceDomainError(
      "OPERATIONS_WORKER_DISABLED",
      "Operations worker credential is unavailable.",
      503,
    );
  }
  const supplied = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (
    left.byteLength !== right.byteLength ||
    !timingSafeEqual(left, right)
  ) {
    throw new CommerceDomainError(
      "OPERATIONS_WORKER_UNAUTHORIZED",
      "Operations worker credential is invalid.",
      401,
    );
  }
}

export async function POST(request: Request) {
  try {
    assertWorkerCredential(request);
    const url = new URL(request.url);
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(20)
      .default(5)
      .parse(url.searchParams.get("limit") ?? undefined);
    const repository = getWorkerOperationsRepository();
    const worker = new OperationsWorker(
      repository,
      getOperationWorkerProviders(),
    );
    const jobs: {
      readonly id: string;
      readonly state: string;
      readonly attemptCount: number;
    }[] = [];
    for (let index = 0; index < limit; index += 1) {
      const result = await worker.runOne({
        workerId: "vercel-operations-worker",
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

// Vercel Cron invokes Route Handlers with GET. The same bearer credential and
// bounded lease loop apply to both scheduler and operator-triggered runs.
export const GET = POST;
