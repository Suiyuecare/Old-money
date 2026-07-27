import { describe, expect, it } from "vitest";

import { getCommerceEnvironment } from "@/lib/commerce/config";
import {
  DEMO_PUBLIC_COMMANDS_PER_MINUTE,
  DEMO_PUBLIC_COMMAND_WINDOW_MS,
} from "@/lib/commerce/demo-public-command";
import { IdempotencyConflictError } from "@/lib/commerce/errors";
import {
  DeterministicIdempotencyStore,
  hashIdempotencyRequest,
} from "@/lib/commerce/idempotency";
import { DeterministicInventoryLedger } from "@/lib/commerce/inventory";
import {
  DEMO_MAXIMUM_COMMANDS,
  DEMO_MAXIMUM_ORDERS,
  DEMO_STATE_TTL_MS,
  MockCommerceRepository,
} from "@/lib/commerce/mock-repositories";
import {
  createOrderTotalsSnapshot,
  shippingForMerchandise,
  splitTaxIncludedTwd,
} from "@/lib/commerce/money";
import { DemoRateLimitRepository } from "@/lib/commerce/rate-limit";
import {
  createFinancialQuoteDigest,
  createCurrentQuote,
  DEFAULT_QUOTE_DIGEST_CONTEXT,
  DEFAULT_QUOTE_FINANCIAL_REVISIONS,
} from "@/lib/commerce/quote";
import {
  canAccessAdmin,
  canCreateCheckout,
  canCreateProductionCanary,
  canServePublicMedia,
} from "@/lib/commerce/readiness";
import {
  paymentAttemptTransitions,
  reservationTransitions,
  transitionState,
} from "@/lib/commerce/state-machine";

const TEST_ORDER_QUOTE = Object.freeze({
  digest: "a".repeat(64),
  digestSchemaRevision: "test-financial-quote-v1",
  financialRevisions: DEFAULT_QUOTE_FINANCIAL_REVISIONS,
});

describe("immutable TWD totals", () => {
  it("canonicalizes allocation and binds the complete financial snapshot", () => {
    const lines = [
      { skuId: "field-house-polo-s-estate-olive", quantity: 1 },
      {
        skuId: "breakfast-room-mug-launch-sample-estate-dark",
        quantity: 2,
      },
    ] as const;
    const forward = createCurrentQuote(lines);
    const reversed = createCurrentQuote([...lines].reverse());
    expect(forward.quoteDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(reversed.quoteDigest).toBe(forward.quoteDigest);
    expect(reversed.totals).toEqual(forward.totals);
    expect(reversed.lines).toEqual(forward.lines);
    expect(forward.lines.map((line) => line.lineGrossTwd)).toEqual([
      4_400,
      7_800,
    ]);
    for (const line of forward.lines) {
      const reverseLine = reversed.lines.find(
        (candidate) => candidate.skuId === line.skuId,
      );
      expect(reverseLine).toMatchObject({
        lineGrossTwd: line.lineGrossTwd,
        lineNetTwd: line.lineNetTwd,
        lineTaxTwd: line.lineTaxTwd,
        invoiceLineKey: line.invoiceLineKey,
      });
    }
    expect(
      createCurrentQuote([{ ...lines[0], quantity: 2 }]).quoteDigest,
    ).not.toBe(forward.quoteDigest);
  });

  it("changes the digest across every financial rules revision boundary", () => {
    const lines = [
      { skuId: "field-house-polo-s-estate-olive", quantity: 1 },
    ] as const;
    const baseline = createCurrentQuote(lines);
    for (const revisionName of Object.keys(
      DEFAULT_QUOTE_FINANCIAL_REVISIONS,
    ) as (keyof typeof DEFAULT_QUOTE_FINANCIAL_REVISIONS)[]) {
      const changed = createCurrentQuote(lines, {
        ...DEFAULT_QUOTE_FINANCIAL_REVISIONS,
        [revisionName]: `${DEFAULT_QUOTE_FINANCIAL_REVISIONS[revisionName]}-next`,
      });
      expect(changed.quoteDigest, revisionName).not.toBe(baseline.quoteDigest);
    }
    expect(baseline.digestSchemaRevision).toBe("lignee-financial-quote-v2");
    expect(baseline.currency).toBe("TWD");
    expect(baseline.taxIncluded).toBe(true);
    expect(
      createFinancialQuoteDigest(baseline.totals, {
        ...DEFAULT_QUOTE_DIGEST_CONTEXT,
        digestSchemaRevision: "lignee-financial-quote-v3",
      }),
    ).not.toBe(baseline.quoteDigest);
    expect(
      createFinancialQuoteDigest(baseline.totals, {
        ...DEFAULT_QUOTE_DIGEST_CONTEXT,
        currency: "TWD-next-revision",
      }),
    ).not.toBe(baseline.quoteDigest);
  });

  it("allocates tax-included residuals exactly across lines and units", () => {
    const totals = createOrderTotalsSnapshot([
      {
        skuId: "sku-a",
        quantity: 3,
        priceVersion: "price-v1",
        unitGrossTwd: 2_201,
      },
      {
        skuId: "sku-b",
        quantity: 1,
        priceVersion: "price-v1",
        unitGrossTwd: 5_398,
      },
    ]);

    expect(totals.merchandiseGrossTwd).toBe(12_001);
    expect(totals.shipping.grossTwd).toBe(0);
    expect(totals.lines.reduce((sum, line) => sum + line.grossTwd, 0)).toBe(
      totals.merchandiseGrossTwd,
    );
    expect(totals.lines.reduce((sum, line) => sum + line.netTwd, 0)).toBe(
      splitTaxIncludedTwd(totals.merchandiseGrossTwd).netTwd,
    );
    for (const line of totals.lines) {
      expect(line.units.reduce((sum, unit) => sum + unit.grossTwd, 0)).toBe(
        line.grossTwd,
      );
      expect(line.units.reduce((sum, unit) => sum + unit.netTwd, 0)).toBe(
        line.netTwd,
      );
      expect(line.netTwd + line.taxTwd).toBe(line.grossTwd);
    }
    expect(Object.isFrozen(totals)).toBe(true);
    expect(Object.isFrozen(totals.lines)).toBe(true);
  });

  it("enforces free shipping and cart limits at the exact boundaries", () => {
    expect(shippingForMerchandise(11_999)).toBe(250);
    expect(shippingForMerchandise(12_000)).toBe(0);
    expect(() =>
      createOrderTotalsSnapshot([
        {
          skuId: "sku-a",
          quantity: 4,
          priceVersion: "v1",
          unitGrossTwd: 100,
        },
      ]),
    ).toThrowError(/1–3/);
    expect(() =>
      createOrderTotalsSnapshot([
        {
          skuId: "sku-a",
          quantity: 1,
          priceVersion: "v1",
          unitGrossTwd: 250_001,
        },
      ]),
    ).toThrowError(/250,000/);
    expect(() =>
      createOrderTotalsSnapshot([
        {
          skuId: "sku-a",
          quantity: 3,
          priceVersion: "v1",
          unitGrossTwd: 100,
        },
        {
          skuId: "sku-a",
          quantity: 3,
          priceVersion: "v1",
          unitGrossTwd: 100,
        },
      ]),
    ).toThrowError(/exactly once/);
  });
});

describe("inventory reservation ledger", () => {
  it("reserves, replays, consumes, and reconciles without negative stock", () => {
    const ledger = new DeterministicInventoryLedger([
      { skuId: "sku-a", onHand: 10, reserved: 0, safetyStock: 2 },
    ]);
    const reserve = ledger.apply({
      operationKey: "reserve:order-1:sku-a",
      skuId: "sku-a",
      kind: "reserve",
      quantity: 3,
      orderId: "order-1",
      reservationId: "reservation-1",
    });
    expect(reserve.balance).toEqual({
      skuId: "sku-a",
      onHand: 10,
      reserved: 3,
      safetyStock: 2,
    });
    expect(
      ledger.apply({
        operationKey: "reserve:order-1:sku-a",
        skuId: "sku-a",
        kind: "reserve",
        quantity: 3,
        orderId: "order-1",
        reservationId: "reservation-1",
      }).replayed,
    ).toBe(true);
    expect(
      ledger.apply({
        operationKey: "sale:order-1:sku-a",
        skuId: "sku-a",
        kind: "sale",
        quantity: 3,
        orderId: "order-1",
        reservationId: "reservation-1",
      }).balance,
    ).toEqual({ skuId: "sku-a", onHand: 7, reserved: 0, safetyStock: 2 });
    expect(ledger.reconcile()).toEqual([]);
  });

  it("rejects conflicting idempotency keys and invariant-breaking releases", () => {
    const ledger = new DeterministicInventoryLedger([
      { skuId: "sku-a", onHand: 4, reserved: 1, safetyStock: 1 },
    ]);
    ledger.apply({
      operationKey: "release:1",
      skuId: "sku-a",
      kind: "release",
      quantity: 1,
    });
    expect(() =>
      ledger.apply({
        operationKey: "release:1",
        skuId: "sku-a",
        kind: "release",
        quantity: 2,
      }),
    ).toThrowError(/reused/);
    expect(() =>
      ledger.apply({
        operationKey: "release:2",
        skuId: "sku-a",
        kind: "release",
        quantity: 1,
      }),
    ).toThrowError(/invariants/);
  });
});

describe("state machines and command idempotency", () => {
  it("allows explicitly modeled late provider success but rejects arbitrary jumps", () => {
    expect(
      transitionState("failed", "succeeded_after_release", paymentAttemptTransitions),
    ).toBe("succeeded_after_release");
    expect(
      transitionState("release_pending", "consumed", reservationTransitions),
    ).toBe("consumed");
    expect(() =>
      transitionState("released", "active", reservationTransitions),
    ).toThrowError(/Cannot transition/);
  });

  it("hashes canonical input, replays equal commands, and conflicts on reuse", () => {
    expect(hashIdempotencyRequest({ b: 2, a: 1 })).toBe(
      hashIdempotencyRequest({ a: 1, b: 2 }),
    );
    const store = new DeterministicIdempotencyStore();
    const first = store.execute(
      {
        actorScope: "guest-1",
        commandName: "create-order",
        key: "idempotency-key-0001",
        request: { lines: [{ quantity: 1, skuId: "sku-a" }] },
      },
      () => ({ orderId: "order-1" }),
    );
    const replay = store.execute(
      {
        actorScope: "guest-1",
        commandName: "create-order",
        key: "idempotency-key-0001",
        request: { lines: [{ skuId: "sku-a", quantity: 1 }] },
      },
      () => ({ orderId: "must-not-run" }),
    );
    expect(first.replayed).toBe(false);
    expect(replay).toEqual({ result: { orderId: "order-1" }, replayed: true });
    expect(() =>
      store.execute(
        {
          actorScope: "guest-1",
          commandName: "create-order",
          key: "idempotency-key-0001",
          request: { lines: [{ skuId: "sku-a", quantity: 2 }] },
        },
        () => ({ orderId: "must-not-run" }),
      ),
    ).toThrow(IdempotencyConflictError);
  });

  it("fails closed at bounded idempotency and order capacity without evicting replay keys", async () => {
    const store = new DeterministicIdempotencyStore(1);
    const command = {
      actorScope: "guest",
      commandName: "bounded-command",
      key: "bounded-key-0001",
      request: { value: 1 },
    };
    expect(store.execute(command, () => "first")).toEqual({
      result: "first",
      replayed: false,
    });
    expect(store.execute(command, () => "must-not-run")).toEqual({
      result: "first",
      replayed: true,
    });
    expect(() =>
      store.execute(
        { ...command, key: "bounded-key-0002" },
        () => "must-not-run",
      ),
    ).toThrowError(/store is full/);
    expect(store.recordCount).toBe(1);

    const repository = new MockCommerceRepository({
      maximumCommands: 2,
      maximumOrders: 1,
    });
    const totals = createOrderTotalsSnapshot([
      {
        skuId: "sku-a",
        quantity: 1,
        priceVersion: "v1",
        unitGrossTwd: 100,
      },
    ]);
    const first = await repository.createOrder({
      idempotencyKey: "bounded-order-key-0001",
      totals,
      quote: TEST_ORDER_QUOTE,
      productionCanary: false,
    });
    const replay = await repository.createOrder({
      idempotencyKey: "bounded-order-key-0001",
      totals,
      quote: TEST_ORDER_QUOTE,
      productionCanary: false,
    });
    expect(replay.publicId).toBe(first.publicId);
    await expect(
      repository.createOrder({
        idempotencyKey: "bounded-order-key-0001",
        totals,
        quote: {
          ...TEST_ORDER_QUOTE,
          digest: "b".repeat(64),
        },
        productionCanary: false,
      }),
    ).rejects.toThrow(IdempotencyConflictError);
    await expect(
      repository.createOrder({
        idempotencyKey: "bounded-order-key-0002",
        totals,
        quote: TEST_ORDER_QUOTE,
        productionCanary: false,
      }),
    ).rejects.toThrowError(/order store is full/);
  });

  it("expires bounded demo session, order, and replay state and then recovers", async () => {
    let now = 1_000;
    const repository = new MockCommerceRepository({
      maximumCommands: 2,
      maximumOrders: 1,
      stateTtlMs: 100,
      now: () => now,
    });
    const draftInput = (key: string) => ({
      idempotencyKey: key,
      safetyRevision: 1,
    });
    const firstDraft = await repository.createCheckoutDraft(
      draftInput("ttl-session-key-0001"),
    );
    expect(firstDraft.expiresAt).toBe(new Date(now + 100).toISOString());
    await repository.createCheckoutDraft(draftInput("ttl-session-key-0002"));
    await expect(
      repository.createCheckoutDraft(draftInput("ttl-session-key-0003")),
    ).rejects.toThrowError(/store is full/);
    expect(
      await repository.findCheckoutDraftCommandReplay({
        idempotencyKey: "ttl-session-key-0001",
        safetyRevision: 1,
      }),
    ).toMatchObject({ id: "demo-checkout-ttl-session-key-" });

    now += 101;
    await expect(
      repository.createCheckoutDraft(draftInput("ttl-session-key-0003")),
    ).resolves.toMatchObject({ safetyRevision: 1 });

    const orderRepository = new MockCommerceRepository({
      maximumCommands: 2,
      maximumOrders: 1,
      stateTtlMs: 100,
      now: () => now,
    });
    const totals = createOrderTotalsSnapshot([
      {
        skuId: "sku-a",
        quantity: 1,
        priceVersion: "v1",
        unitGrossTwd: 100,
      },
    ]);
    const firstCommand = {
      idempotencyKey: "ttl-order-key-000001",
      totals,
      quote: TEST_ORDER_QUOTE,
      productionCanary: false,
    };
    const first = await orderRepository.createOrder(firstCommand);
    expect(await orderRepository.createOrder(firstCommand)).toEqual(first);
    await expect(
      orderRepository.createOrder({
        ...firstCommand,
        idempotencyKey: "ttl-order-key-000002",
      }),
    ).rejects.toThrowError(/order store is full/);

    now += 101;
    const recovered = await orderRepository.createOrder({
      ...firstCommand,
      idempotencyKey: "ttl-order-key-000002",
    });
    expect(recovered.publicId).not.toBe(first.publicId);
    await expect(
      orderRepository.findOrderByPublicId(first.publicId),
    ).resolves.toBeUndefined();
  });
});

describe("fail-closed readiness and rate limits", () => {
  it("keeps demo admission below bounded state capacity for the full TTL", () => {
    const maximumWindowsAcrossTtl =
      Math.ceil(DEMO_STATE_TTL_MS / DEMO_PUBLIC_COMMAND_WINDOW_MS) + 1;
    const maximumAdmittedCommands =
      maximumWindowsAcrossTtl * DEMO_PUBLIC_COMMANDS_PER_MINUTE;
    expect(maximumAdmittedCommands).toBeLessThan(DEMO_MAXIMUM_COMMANDS);
    expect(maximumAdmittedCommands).toBeLessThan(DEMO_MAXIMUM_ORDERS);
  });

  it("does not allow environment variables alone to enable production commerce", () => {
    const environment = getCommerceEnvironment({
      NODE_ENV: "production",
      LIGNEE_MODE: "live",
      COMMERCE_CAPABLE: "true",
      ECPAY_MERCHANT_ID: "merchant",
      ECPAY_HASH_KEY: "hash-key",
      ECPAY_HASH_IV: "hash-iv",
      LIGNEE_DATABASE_URL: "postgres://unresolved",
      LIGNEE_DATABASE_CA_CERT: "unresolved",
    });
    expect(environment.controlsSource).toBe("fail-closed-env");
    expect(environment.controls.commerceLive).toBe(false);
    expect(canCreateCheckout(environment, true).allowed).toBe(false);
    expect(
      canAccessAdmin(environment, {
        authenticated: true,
        aal2: true,
        activeMembership: true,
      }).allowed,
    ).toBe(true);
    expect(
      canServePublicMedia(environment, {
        edgeBeforeCacheVerified: true,
        revisionMatches: true,
        status: "sandbox_review",
        tombstoned: false,
      }).allowed,
    ).toBe(false);
    expect(
      canCreateProductionCanary(environment, {
        canonicalRequest: true,
        recentAal2Owner: true,
        csrfValid: true,
        testerAllowlisted: true,
        deviceAllowlisted: true,
        breakfastMugApprovedAt2200: true,
        isolatedStockAvailable: true,
        inFlightCount: 0,
        dailyCount: 0,
      }).allowed,
    ).toBe(false);
  });

  it("applies deterministic per-principal windows in the demo repository", async () => {
    const limiter = new DemoRateLimitRepository();
    expect(
      await limiter.consume({
        scope: "otp",
        principalHash: "principal",
        limit: 2,
        windowMs: 60_000,
        now: 1_000,
      }),
    ).toMatchObject({ allowed: true, remaining: 1, resetAt: 61_000 });
    await limiter.consume({
      scope: "otp",
      principalHash: "principal",
      limit: 2,
      windowMs: 60_000,
      now: 2_000,
    });
    expect(
      await limiter.consume({
        scope: "otp",
        principalHash: "principal",
        limit: 2,
        windowMs: 60_000,
        now: 3_000,
      }),
    ).toMatchObject({ allowed: false, remaining: 0 });
    expect(
      await limiter.consume({
        scope: "otp",
        principalHash: "principal",
        limit: 2,
        windowMs: 60_000,
        now: 61_000,
      }),
    ).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("bounds rate-limit windows without evicting an existing principal", async () => {
    const limiter = new DemoRateLimitRepository(1);
    const firstInput = {
      scope: "demo-order",
      principalHash: "global",
      limit: 2,
      windowMs: 60_000,
      now: 1_000,
    };
    await expect(limiter.consume(firstInput)).resolves.toMatchObject({
      allowed: true,
    });
    await expect(
      limiter.consume({ ...firstInput, principalHash: "second-principal" }),
    ).rejects.toThrowError(/store is full/);
    await expect(
      limiter.consume({ ...firstInput, now: 2_000 }),
    ).resolves.toMatchObject({ allowed: true, remaining: 0 });
  });
});
