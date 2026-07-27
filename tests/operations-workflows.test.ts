import { describe, expect, it } from "vitest";

import type { AdminIdentity } from "@/lib/admin/types";
import { CommerceDomainError } from "@/lib/commerce/errors";
import {
  operationsCommandAuthorization,
  operationsCommandSchema,
} from "@/lib/operations/contracts";
import { SandboxOperationsRepository } from "@/lib/operations/sandbox-repository";
import { OperationsWorker } from "@/lib/operations/worker";
import {
  MockEmailProvider,
  MockInvoiceProvider,
  MockLogisticsProvider,
  MockPaymentGateway,
} from "@/lib/providers/mock";

const owner = {
  userId: "demo-owner",
  role: "owner",
} satisfies Pick<AdminIdentity, "userId" | "role">;

class RefundUnknownPaymentGateway extends MockPaymentGateway {
  refundCalls = 0;

  override async refund() {
    this.refundCalls += 1;
    return { state: "unknown" as const };
  }
}

class TimeoutLogisticsProvider extends MockLogisticsProvider {
  createCalls = 0;

  override async createShipment(): Promise<never> {
    this.createCalls += 1;
    throw new Error("PROVIDER_TIMEOUT");
  }
}

function worker(
  repository: SandboxOperationsRepository,
  payment = new MockPaymentGateway(),
) {
  return new OperationsWorker(repository, {
    payment,
    invoice: new MockInvoiceProvider(),
    logistics: new MockLogisticsProvider(),
    email: new MockEmailProvider(),
    invoiceIssuePayloadResolver:
      repository.resolveInvoiceIssueOption,
  });
}

describe("durable operations workflow", () => {
  it("enforces expected versions and payload-bound idempotency", async () => {
    const repository = new SandboxOperationsRepository({
      now: () => Date.parse("2026-07-28T00:00:00.000Z"),
    });
    const command = operationsCommandSchema.parse({
      aggregateId: "demo-order-id-000001",
      expectedVersion: 1,
      idempotencyKey: "operations-invoice-issue-0001",
      command: {
        type: "invoice.issue",
      },
    });
    const first = await repository.executeCommand(command, owner);
    const replay = await repository.executeCommand(command, owner);
    expect(first).toMatchObject({
      replayed: false,
      projection: { version: 2, invoiceStatus: "pending_issue" },
    });
    expect(first.enqueuedOperationKeys).toHaveLength(1);
    expect(replay).toMatchObject({
      replayed: true,
      projection: { version: 2 },
    });

    await expect(
      repository.executeCommand(
        {
          ...command,
          expectedVersion: 99,
        },
        owner,
      ),
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      httpStatus: 409,
    } satisfies Partial<CommerceDomainError>);

    await expect(
      repository.executeCommand(
        {
          ...command,
          idempotencyKey: "operations-invoice-stale-0001",
        },
        owner,
      ),
    ).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
      httpStatus: 409,
    } satisfies Partial<CommerceDomainError>);
  });

  it("moves shipment creation through provider completion and verified delivery", async () => {
    let now = Date.parse("2026-07-28T00:00:00.000Z");
    const repository = new SandboxOperationsRepository({ now: () => now });
    const command = operationsCommandSchema.parse({
      aggregateId: "demo-order-id-000001",
      expectedVersion: 1,
      idempotencyKey: "operations-shipment-create-0001",
      command: { type: "shipment.create", parcelCount: 2 },
    });
    const queued = await repository.executeCommand(command, owner);
    expect(queued.projection.shipmentStatus).toBe("label_pending");

    now += 1_000;
    const result = await worker(repository).runOne({
      workerId: "test-worker",
      now,
    });
    expect(result.job).toMatchObject({
      state: "completed",
      type: "shipment.create",
      attemptCount: 1,
    });
    const labelCreated = await repository.findProjection(
      "demo-order-id-000001",
    );
    expect(labelCreated).toMatchObject({
      version: 3,
      shipmentStatus: "label_created",
      trackingIds: expect.arrayContaining([
        expect.stringMatching(/^parcel_/),
      ]),
    });
    const trackingId = labelCreated?.trackingIds[0];
    if (!trackingId || !labelCreated) {
      throw new Error("Expected shipment creation to persist a tracking ID.");
    }

    const pickedUp = await repository.executeCommand(
      operationsCommandSchema.parse({
        aggregateId: "demo-order-id-000001",
        expectedVersion: labelCreated.version,
        idempotencyKey: "operations-shipment-picked-up-0001",
        command: {
          type: "shipment.status.update",
          trackingId,
          state: "picked_up",
        },
      }),
      owner,
    );
    expect(pickedUp.projection).toMatchObject({
      version: 4,
      orderStatus: "shipped",
      shipmentStatus: "picked_up",
    });

    const delivered = await repository.executeCommand(
      operationsCommandSchema.parse({
        aggregateId: "demo-order-id-000001",
        expectedVersion: pickedUp.projection.version,
        idempotencyKey: "operations-shipment-delivered-0001",
        command: {
          type: "shipment.status.update",
          trackingId,
          state: "delivered",
        },
      }),
      owner,
    );
    expect(delivered.projection).toMatchObject({
      version: 5,
      orderStatus: "delivered",
      shipmentStatus: "delivered",
    });
  });

  it("never requeues a provider timeout after dispatch starts", async () => {
    const now = Date.parse("2026-07-28T00:00:00.000Z");
    const repository = new SandboxOperationsRepository({ now: () => now });
    await repository.executeCommand(
      operationsCommandSchema.parse({
        aggregateId: "demo-order-id-000001",
        expectedVersion: 1,
        idempotencyKey: "operations-shipment-timeout-0001",
        command: { type: "shipment.create", parcelCount: 1 },
      }),
      owner,
    );
    const logistics = new TimeoutLogisticsProvider();
    const operationsWorker = new OperationsWorker(repository, {
      payment: new MockPaymentGateway(),
      invoice: new MockInvoiceProvider(),
      logistics,
      email: new MockEmailProvider(),
      invoiceIssuePayloadResolver:
        repository.resolveInvoiceIssueOption,
    });

    const result = await operationsWorker.runOne({
      workerId: "timeout-worker",
      now,
    });
    expect(result.job).toMatchObject({
      type: "shipment.create",
      state: "unknown",
      dispatchStartedAt: "2026-07-28T00:00:00.000Z",
      lastErrorCode:
        "PROVIDER_TIMEOUT_OR_EXCEPTION_AFTER_DISPATCH",
    });
    expect(logistics.createCalls).toBe(1);
    expect(
      await operationsWorker.runOne({
        workerId: "timeout-worker",
        now: now + 60_000,
      }),
    ).toMatchObject({ claimed: false, job: null });
    expect(logistics.createCalls).toBe(1);
  });

  it("never directly retries an unknown refund outcome", async () => {
    let now = Date.parse("2026-07-28T00:00:00.000Z");
    const repository = new SandboxOperationsRepository({ now: () => now });
    const requested = await repository.executeCommand(
      operationsCommandSchema.parse({
        aggregateId: "demo-order-id-000001",
        expectedVersion: 1,
        idempotencyKey: "operations-refund-request-0001",
        command: {
          type: "refund.request",
          amountTwd: 3_000,
          reason: "Customer returned one item.",
          providerTradeNo: "MOCK-TRADE-000001",
        },
      }),
      owner,
    );
    const refundId = requested.references.refundId;
    expect(refundId).toBeTruthy();
    await repository.executeCommand(
      operationsCommandSchema.parse({
        aggregateId: "demo-order-id-000001",
        expectedVersion: requested.projection.version,
        idempotencyKey: "operations-refund-execute-0001",
        command: { type: "refund.execute", refundId },
      }),
      owner,
    );

    const payment = new RefundUnknownPaymentGateway();
    const operationsWorker = worker(repository, payment);
    // The refund-request notification is an independent transactional outbox
    // item and is completed first.
    await operationsWorker.runOne({ workerId: "test-worker", now });
    now += 1_000;
    const refundResult = await operationsWorker.runOne({
      workerId: "test-worker",
      now,
    });
    expect(refundResult.job).toMatchObject({
      type: "payment.refund",
      state: "unknown",
      dispatchStartedAt: "2026-07-28T00:00:01.000Z",
      lastErrorCode: "REFUND_OUTCOME_UNKNOWN",
    });
    expect(payment.refundCalls).toBe(1);
    expect(
      await repository.findProjection("demo-order-id-000001"),
    ).toMatchObject({
      refundStatus: "unknown",
      refundedTwd: 0,
      paymentStatus: "paid",
    });

    now += 60_000;
    expect(
      await operationsWorker.runOne({ workerId: "test-worker", now }),
    ).toMatchObject({ claimed: false, job: null });
    expect(payment.refundCalls).toBe(1);
    const reconciliation = await repository.listQueue({
      kind: "reconciliation",
      limit: 20,
      offset: 0,
    });
    expect(reconciliation.items).toEqual([
      expect.objectContaining({
        type: "payment.refund",
        state: "unknown",
      }),
    ]);
  });

  it("re-leases an expired mutation only when dispatch never started", async () => {
    let now = Date.parse("2026-07-28T00:00:00.000Z");
    const repository = new SandboxOperationsRepository({ now: () => now });
    await repository.executeCommand(
      operationsCommandSchema.parse({
        aggregateId: "demo-order-id-000001",
        expectedVersion: 1,
        idempotencyKey: "operations-crash-invoice-0001",
        command: {
          type: "invoice.issue",
        },
      }),
      owner,
    );
    const leased = await repository.claimNextJob({
      workerId: "crashing-worker",
      now,
      leaseMs: 10_000,
    });
    expect(leased?.state).toBe("leased");
    expect(leased?.dispatchStartedAt).toBeNull();
    expect(leased?.payload).toMatchObject({
      invoiceId: expect.stringMatching(
        /^[a-f0-9-]{36}$/,
      ),
    });
    expect(JSON.stringify(leased?.payload)).not.toContain(
      "buyer@example.com",
    );
    expect(leased?.payload).not.toHaveProperty("option");

    now += 11_000;
    const next = await repository.claimNextJob({
      workerId: "replacement-worker",
      now,
      leaseMs: 10_000,
    });
    expect(next).toMatchObject({
      id: leased?.id,
      state: "leased",
      attemptCount: 2,
      dispatchStartedAt: null,
      lastErrorCode: "PRE_DISPATCH_LEASE_EXPIRED_REQUEUED",
    });
  });

  it("turns an expired mutation lease into unknown after dispatch starts", async () => {
    let now = Date.parse("2026-07-28T00:00:00.000Z");
    const repository = new SandboxOperationsRepository({ now: () => now });
    await repository.executeCommand(
      operationsCommandSchema.parse({
        aggregateId: "demo-order-id-000001",
        expectedVersion: 1,
        idempotencyKey: "operations-dispatched-crash-invoice-0001",
        command: { type: "invoice.issue" },
      }),
      owner,
    );
    const leased = await repository.claimNextJob({
      workerId: "crashing-worker",
      now,
      leaseMs: 10_000,
    });
    if (!leased?.leaseToken) {
      throw new Error("Expected a leased remote-effect job.");
    }
    const fenced = await repository.markDispatchStarted({
      jobId: leased.id,
      leaseToken: leased.leaseToken,
      now,
    });
    expect(fenced.dispatchStartedAt).toBe(
      "2026-07-28T00:00:00.000Z",
    );

    await expect(
      repository.completeJob({
        jobId: leased.id,
        leaseToken: leased.leaseToken,
        outcome: "retry_safe",
        retryAfterMs: 30_000,
        now,
      }),
    ).rejects.toMatchObject({
      code: "OPERATIONS_DISPATCH_ALREADY_STARTED",
      httpStatus: 409,
    } satisfies Partial<CommerceDomainError>);

    now += 11_000;
    const next = await repository.claimNextJob({
      workerId: "replacement-worker",
      now,
      leaseMs: 10_000,
    });
    expect(next).toBeNull();
    const reconciliation = await repository.listQueue({
      kind: "reconciliation",
      limit: 20,
      offset: 0,
    });
    expect(reconciliation.items).toEqual([
      expect.objectContaining({
        operationKey: leased.operationKey,
        state: "unknown",
        dispatchStartedAt: "2026-07-28T00:00:00.000Z",
        lastErrorCode: "LEASE_EXPIRED_EFFECT_UNKNOWN",
      }),
    ]);
    expect(
      await worker(repository).runReconciliationOne({
        workerId: "reconciliation-worker",
        now,
      }),
    ).toMatchObject({ claimed: false, job: null });
  });

  it("retries transient invoice resolution before opening the dispatch fence", async () => {
    let now = Date.parse("2026-07-28T00:00:00.000Z");
    const repository = new SandboxOperationsRepository({ now: () => now });
    await repository.executeCommand(
      operationsCommandSchema.parse({
        aggregateId: "demo-order-id-000001",
        expectedVersion: 1,
        idempotencyKey: "operations-invoice-resolution-retry-0001",
        command: { type: "invoice.issue" },
      }),
      owner,
    );
    let resolutionAttempts = 0;
    const operationsWorker = new OperationsWorker(repository, {
      payment: new MockPaymentGateway(),
      invoice: new MockInvoiceProvider(),
      logistics: new MockLogisticsProvider(),
      email: new MockEmailProvider(),
      invoiceIssuePayloadResolver: async () => {
        resolutionAttempts += 1;
        if (resolutionAttempts === 1) {
          throw new Error("KMS_TEMPORARILY_UNAVAILABLE");
        }
        return { CustomerEmail: "buyer@example.com" };
      },
    });

    const beforeDispatch = await operationsWorker.runOne({
      workerId: "invoice-worker",
      now,
    });
    expect(beforeDispatch.job).toMatchObject({
      state: "queued",
      dispatchStartedAt: null,
      lastErrorCode: "INVOICE_PAYLOAD_RESOLUTION_UNAVAILABLE",
    });

    now += 31_000;
    const completed = await operationsWorker.runOne({
      workerId: "invoice-worker",
      now,
    });
    expect(completed.job).toMatchObject({
      state: "completed",
      attemptCount: 2,
      dispatchStartedAt: "2026-07-28T00:00:31.000Z",
    });
    expect(resolutionAttempts).toBe(2);
  });

  it("can safely re-lease an expired read-only payment query", async () => {
    let now = Date.parse("2026-07-28T00:00:00.000Z");
    const repository = new SandboxOperationsRepository({ now: () => now });
    await repository.executeCommand(
      operationsCommandSchema.parse({
        aggregateId: "demo-order-id-000002",
        expectedVersion: 1,
        idempotencyKey: "operations-query-recovery-0001",
        command: {
          type: "payment.reconcile",
          merchantTradeNo: "D000000000000000002",
        },
      }),
      owner,
    );
    const first = await repository.claimNextJob({
      workerId: "crashing-query-worker",
      now,
      leaseMs: 5_000,
    });
    now += 6_000;
    const recovered = await repository.claimNextJob({
      workerId: "replacement-query-worker",
      now,
      leaseMs: 5_000,
    });
    expect(recovered).toMatchObject({
      id: first?.id,
      type: "payment.query",
      state: "leased",
      attemptCount: 2,
    });
  });

  it("bounds inconclusive reconciliation queries and preserves evidence", async () => {
    let now = Date.parse("2026-07-28T00:00:00.000Z");
    const repository = new SandboxOperationsRepository({
      now: () => now,
    });
    await repository.executeCommand(
      operationsCommandSchema.parse({
        aggregateId: "demo-order-id-000002",
        expectedVersion: 1,
        idempotencyKey:
          "operations-bounded-reconciliation-0001",
        command: {
          type: "payment.reconcile",
          merchantTradeNo: "D000000000000000002",
        },
      }),
      owner,
    );
    const reconciliationWorker = worker(repository);
    let final;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      final =
        await reconciliationWorker.runReconciliationOne({
          workerId: "reconciliation-worker",
          now,
        });
      now += 31_000;
    }
    expect(final).toMatchObject({
      claimed: true,
      job: {
        type: "payment.query",
        state: "manual_review",
        attemptCount: 5,
        lastEvidenceHash: expect.stringMatching(
          /^[a-f0-9]{64}$/,
        ),
        lastErrorCode:
          "PAYMENT_QUERY_INCONCLUSIVE_MANUAL_REVIEW",
      },
    });
    const queue = await repository.listQueue({
      kind: "reconciliation",
      limit: 20,
      offset: 0,
    });
    expect(queue.items).toEqual([
      expect.objectContaining({
        type: "payment.query",
        state: "manual_review",
      }),
    ]);
  });

  it("deduplicates verified provider inbox events", async () => {
    const repository = new SandboxOperationsRepository();
    const event = {
      provider: "ecpay",
      eventType: "payment.callback",
      providerObjectId: "D000000000000000001",
      normalizedStatus: "paid",
      fingerprint: "a".repeat(64),
      verified: true,
      redactedPayload: { RtnCode: "1" },
    };
    expect(await repository.recordProviderEvent(event)).toMatchObject({
      duplicate: false,
    });
    expect(await repository.recordProviderEvent(event)).toMatchObject({
      duplicate: true,
    });
    const inbox = await repository.listQueue({
      kind: "provider_events",
      limit: 20,
      offset: 0,
    });
    expect(inbox.total).toBe(1);
  });

  it("declares Owner-only recent AAL2 for remote refund and invoice adjustment", () => {
    expect(
      operationsCommandAuthorization["refund.execute"],
    ).toEqual({
      roles: ["owner"],
      requireRecentAal2: true,
    });
    expect(
      operationsCommandAuthorization["invoice.adjust"],
    ).toEqual({
      roles: ["owner"],
      requireRecentAal2: true,
    });
    expect(
      operationsCommandSchema.safeParse({
        aggregateId: "demo-order-id-000001",
        expectedVersion: 1,
        idempotencyKey: "operations-extra-field-0001",
        command: {
          type: "refund.execute",
          refundId: "demo-refund-id",
          unexpected: true,
        },
      }).success,
    ).toBe(false);
    expect(
      operationsCommandSchema.safeParse({
        aggregateId: "demo-order-id-000001",
        expectedVersion: 1,
        idempotencyKey: "operations-invoice-pii-0001",
        command: {
          type: "invoice.issue",
          option: {
            kind: "ecpay_email",
            email: "buyer@example.com",
          },
        },
      }).success,
    ).toBe(false);
  });
});
