import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as operationsCommand } from "@/app/api/admin/operations/commands/route";
import { GET as operationsQueue } from "@/app/api/admin/operations/queue/route";
import { POST as operationsWorker } from "@/app/api/internal/jobs/operations/route";
import { POST as reconciliationWorker } from "@/app/api/internal/jobs/reconcile/route";
import { resetSandboxOperationsForTests } from "@/lib/operations/container";

const origin = "http://localhost:3000";
const previous = {
  mode: process.env.LIGNEE_MODE,
  cronSecret: process.env.CRON_SECRET,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY,
};

function jsonRequest(
  path: string,
  body: unknown,
  requestOrigin = origin,
) {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: requestOrigin,
      "sec-fetch-site":
        requestOrigin === origin ? "same-origin" : "cross-site",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.LIGNEE_MODE = "demo";
  process.env.CRON_SECRET = "operations-test-secret";
  resetSandboxOperationsForTests({
    now: () => Date.parse("2026-07-27T00:00:00.000Z"),
  });
});

afterEach(() => {
  if (previous.mode === undefined) delete process.env.LIGNEE_MODE;
  else process.env.LIGNEE_MODE = previous.mode;
  if (previous.cronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previous.cronSecret;
  if (previous.supabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = previous.supabaseUrl;
  if (previous.supabaseKey === undefined) {
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
  } else {
    process.env.SUPABASE_PUBLISHABLE_KEY = previous.supabaseKey;
  }
});

describe("operations API boundaries", () => {
  it("queues an admin command and lets the authenticated worker complete it", async () => {
    const commandResponse = await operationsCommand(
      jsonRequest("/api/admin/operations/commands", {
        aggregateId: "demo-order-id-000001",
        expectedVersion: 1,
        idempotencyKey: "operations-route-shipment-0001",
        command: { type: "shipment.create", parcelCount: 1 },
      }),
    );
    expect(commandResponse.status).toBe(200);
    expect(commandResponse.headers.get("cache-control")).toContain(
      "no-store",
    );
    expect(await commandResponse.json()).toMatchObject({
      operation: {
        replayed: false,
        projection: { shipmentStatus: "label_pending" },
      },
    });

    const queueResponse = await operationsQueue(
      new Request(
        `${origin}/api/admin/operations/queue?kind=provider_operations`,
      ),
    );
    expect(queueResponse.status).toBe(200);
    expect(await queueResponse.json()).toMatchObject({ total: 1 });

    const workerResponse = await operationsWorker(
      new Request(`${origin}/api/internal/jobs/operations?limit=1`, {
        method: "POST",
        headers: {
          authorization: "Bearer operations-test-secret",
        },
      }),
    );
    expect(workerResponse.status).toBe(200);
    const workerBody = await workerResponse.json();
    expect(workerBody).toMatchObject({
      processed: 1,
      jobs: [
        {
          state: "completed",
          attemptCount: 1,
        },
      ],
    });
    expect(Object.keys(workerBody.jobs[0]).sort()).toEqual([
      "attemptCount",
      "id",
      "state",
    ]);
    expect(JSON.stringify(workerBody)).not.toContain("payload");
    expect(JSON.stringify(workerBody)).not.toContain(
      "demo-order-id-000001",
    );
  });

  it("rejects cross-origin admin mutations and invalid worker credentials", async () => {
    const commandResponse = await operationsCommand(
      jsonRequest(
        "/api/admin/operations/commands",
        {
          aggregateId: "demo-order-id-000001",
          expectedVersion: 1,
          idempotencyKey: "operations-route-cross-origin-0001",
          command: { type: "shipment.create", parcelCount: 1 },
        },
        "https://attacker.example",
      ),
    );
    expect(commandResponse.status).toBe(403);
    expect(await commandResponse.json()).toMatchObject({
      error: { code: "ORIGIN_REJECTED" },
    });

    const workerResponse = await operationsWorker(
      new Request(`${origin}/api/internal/jobs/operations`, {
        method: "POST",
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );
    expect(workerResponse.status).toBe(401);
    expect(await workerResponse.json()).toMatchObject({
      error: { code: "OPERATIONS_WORKER_UNAUTHORIZED" },
    });

    const reconciliationResponse = await reconciliationWorker(
      new Request(`${origin}/api/internal/jobs/reconcile`, {
        method: "POST",
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );
    expect(reconciliationResponse.status).toBe(401);
    expect(await reconciliationResponse.json()).toMatchObject({
      error: {
        code: "RECONCILIATION_WORKER_UNAUTHORIZED",
      },
    });
  });

  it("leases only bounded safe reconciliation queries", async () => {
    const commandResponse = await operationsCommand(
      jsonRequest("/api/admin/operations/commands", {
        aggregateId: "demo-order-id-000002",
        expectedVersion: 1,
        idempotencyKey:
          "operations-route-reconciliation-0001",
        command: {
          type: "payment.reconcile",
          merchantTradeNo: "D000000000000000002",
        },
      }),
    );
    expect(commandResponse.status).toBe(200);

    const response = await reconciliationWorker(
      new Request(
        `${origin}/api/internal/jobs/reconcile?limit=1`,
        {
          method: "POST",
          headers: {
            authorization:
              "Bearer operations-test-secret",
          },
        },
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain(
      "no-store",
    );
    expect(await response.json()).toMatchObject({
      processed: 1,
      jobs: [
        {
          type: "payment.query",
          safety: "safe_query",
          state: "queued",
          attemptCount: 1,
          lastEvidenceHash: expect.stringMatching(
            /^[a-f0-9]{64}$/,
          ),
          lastErrorCode: "PAYMENT_QUERY_INCONCLUSIVE",
        },
      ],
    });
  });

  it("fails closed outside local demo when Auth bindings are absent", async () => {
    process.env.LIGNEE_MODE = "production-disabled";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    const response = await operationsCommand(
      jsonRequest("/api/admin/operations/commands", {
        aggregateId: "demo-order-id-000001",
        expectedVersion: 1,
        idempotencyKey: "operations-route-fail-closed-0001",
        command: { type: "shipment.create", parcelCount: 1 },
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "ADMIN_ACCESS_DENIED" },
    });

    const workerResponse = await reconciliationWorker(
      new Request(`${origin}/api/internal/jobs/reconcile`, {
        method: "POST",
        headers: {
          authorization:
            "Bearer operations-test-secret",
        },
      }),
    );
    expect(workerResponse.status).toBe(503);
    expect(await workerResponse.json()).toMatchObject({
      error: {
        code: "OPERATIONS_PROVIDERS_UNAVAILABLE",
      },
    });
  });
});
