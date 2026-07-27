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
      "RECONCILIATION_WORKER_DISABLED",
      "Reconciliation worker credential is unavailable.",
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
      "RECONCILIATION_WORKER_UNAUTHORIZED",
      "Reconciliation worker credential is invalid.",
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

    // Resolve providers before any lease is claimed. Production remains fail
    // closed until live query adapters are provisioned, so a missing provider
    // can never strand a newly leased job or be mistaken for success.
    const providers = getOperationWorkerProviders();
    const repository = getWorkerOperationsRepository();
    const worker = new OperationsWorker(repository, providers);
    const jobs = [];
    for (let index = 0; index < limit; index += 1) {
      const result = await worker.runReconciliationOne({
        workerId: "vercel-reconciliation-worker",
      });
      if (!result.claimed || !result.job) break;
      jobs.push(result.job);
    }
    return noStoreJson(
      {
        processed: jobs.length,
        jobs,
      },
    );
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

// Vercel Cron uses GET; both scheduler and operator-triggered execution share
// the same credential, lease and bounded batch behavior.
export const GET = POST;
