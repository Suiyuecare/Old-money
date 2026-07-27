import {
  getProductBySlug,
  getSkuById,
  products,
  skus,
} from "@/lib/catalog";

import { CommerceDomainError } from "./errors";
import { DeterministicIdempotencyStore } from "./idempotency";
import {
  DeterministicInventoryLedger,
  type InventoryBalance,
} from "./inventory";
import type {
  AuditEvent,
  CatalogRepository,
  CheckoutDraft,
  CommerceRepository,
  OperationsRepository,
  OrderRecord,
} from "./repositories";

export class MockCatalogRepository implements CatalogRepository {
  async listPublished() {
    return products;
  }

  async findPublishedProductBySlug(slug: string) {
    return getProductBySlug(slug);
  }

  async findCurrentSku(skuId: string) {
    return getSkuById(skuId);
  }
}

const initialInventory: readonly InventoryBalance[] = skus.map((sku) => ({
  skuId: sku.id,
  onHand: 12,
  reserved: 0,
  safetyStock: 2,
}));

export const DEMO_STATE_TTL_MS = 15 * 60_000;
export const DEMO_MAXIMUM_COMMANDS = 128;
export const DEMO_MAXIMUM_ORDERS = 128;

export class MockCommerceRepository implements CommerceRepository {
  readonly #idempotency: DeterministicIdempotencyStore;
  readonly #inventory = new DeterministicInventoryLedger(initialInventory);
  readonly #orders = new Map<
    string,
    { readonly order: OrderRecord; readonly expiresAt: number }
  >();
  readonly #maximumOrders: number;
  readonly #stateTtlMs: number;
  readonly #now: () => number;
  #orderSequence = 0;

  constructor(input: {
    readonly maximumCommands?: number;
    readonly maximumOrders?: number;
    readonly stateTtlMs?: number;
    readonly now?: () => number;
  } = {}) {
    this.#stateTtlMs = input.stateTtlMs ?? DEMO_STATE_TTL_MS;
    this.#now = input.now ?? Date.now;
    if (!Number.isSafeInteger(this.#stateTtlMs) || this.#stateTtlMs < 1) {
      throw new CommerceDomainError(
        "INVALID_DEMO_TTL",
        "Demo order state TTL must be a positive integer.",
      );
    }
    this.#idempotency = new DeterministicIdempotencyStore({
      maximumRecords: input.maximumCommands ?? DEMO_MAXIMUM_COMMANDS,
      ttlMs: this.#stateTtlMs,
      now: this.#now,
    });
    this.#maximumOrders = input.maximumOrders ?? DEMO_MAXIMUM_ORDERS;
    if (!Number.isSafeInteger(this.#maximumOrders) || this.#maximumOrders < 1) {
      throw new CommerceDomainError(
        "INVALID_DEMO_CAPACITY",
        "Demo order capacity must be a positive integer.",
      );
    }
  }

  async findCheckoutDraftCommandReplay(input: {
    readonly idempotencyKey: string;
    readonly safetyRevision: number;
  }): Promise<CheckoutDraft | undefined> {
    return this.#idempotency.inspect<CheckoutDraft>({
      actorScope: "guest",
      commandName: "create-checkout-draft",
      key: input.idempotencyKey,
      request: { safetyRevision: input.safetyRevision },
    })?.result;
  }

  async createCheckoutDraft(input: {
    readonly idempotencyKey: string;
    readonly safetyRevision: number;
  }): Promise<CheckoutDraft> {
    return this.#idempotency.execute(
      {
        actorScope: "guest",
        commandName: "create-checkout-draft",
        key: input.idempotencyKey,
        request: { safetyRevision: input.safetyRevision },
      },
      () =>
        Object.freeze({
          id: `demo-checkout-${input.idempotencyKey.slice(0, 16)}`,
          emailVerified: false,
          expiresAt: new Date(this.#now() + this.#stateTtlMs).toISOString(),
          safetyRevision: input.safetyRevision,
        }),
    ).result;
  }

  async findOrderCommandReplay(input: {
    readonly idempotencyKey: string;
    readonly totals: OrderRecord["totals"];
    readonly quote: OrderRecord["quote"];
    readonly productionCanary: boolean;
  }): Promise<OrderRecord | undefined> {
    return this.#idempotency.inspect<OrderRecord>({
      actorScope: "guest",
      commandName: "create-order",
      key: input.idempotencyKey,
      request: input,
    })?.result;
  }

  async createOrder(input: {
    readonly idempotencyKey: string;
    readonly totals: OrderRecord["totals"];
    readonly quote: OrderRecord["quote"];
    readonly productionCanary: boolean;
  }): Promise<OrderRecord> {
    return this.#idempotency.execute(
      {
        actorScope: "guest",
        commandName: "create-order",
        key: input.idempotencyKey,
        request: input,
      },
      () => {
        this.#deleteExpiredOrders();
        if (this.#orders.size >= this.#maximumOrders) {
          throw new CommerceDomainError(
            "DEMO_CAPACITY_REACHED",
            "The bounded Sandbox order store is full; no replay key was evicted.",
            503,
          );
        }
        const sequence = ++this.#orderSequence;
        const now = this.#now();
        const order = Object.freeze({
          id: `demo-order-id-${String(sequence).padStart(6, "0")}`,
          publicId: `DEMO-${String(sequence).padStart(6, "0")}`,
          merchantTradeNo: `D${String(sequence).padStart(19, "0")}`,
          status: "awaiting_payment" as const,
          totals: input.totals,
          quote: input.quote,
          createdAt: new Date(now).toISOString(),
          productionCanary: input.productionCanary,
        });
        this.#orders.set(
          order.publicId,
          Object.freeze({ order, expiresAt: now + this.#stateTtlMs }),
        );
        return order;
      },
    ).result;
  }

  async findOrderByPublicId(publicId: string) {
    this.#deleteExpiredOrders();
    return this.#orders.get(publicId)?.order;
  }

  async applyInventoryOperation(
    input: Parameters<CommerceRepository["applyInventoryOperation"]>[0],
  ) {
    return this.#inventory.apply(input);
  }

  async getInventoryBalance(skuId: string) {
    return this.#inventory.getBalance(skuId);
  }

  #deleteExpiredOrders(): void {
    const now = this.#now();
    for (const [publicId, record] of this.#orders) {
      if (now >= record.expiresAt) this.#orders.delete(publicId);
    }
  }
}

export class MockOperationsRepository implements OperationsRepository {
  readonly auditEvents: AuditEvent[] = [];
  readonly outbox = new Map<string, Readonly<Record<string, unknown>>>();
  readonly inbox = new Set<string>();

  async appendAuditEvent(event: AuditEvent): Promise<void> {
    this.auditEvents.push(Object.freeze({ ...event }));
  }

  async enqueueOutbox(input: {
    readonly operationKey: string;
    readonly jobType: string;
    readonly aggregateId: string;
    readonly payload: Readonly<Record<string, unknown>>;
  }): Promise<void> {
    if (!this.outbox.has(input.operationKey)) {
      this.outbox.set(input.operationKey, Object.freeze({ ...input }));
    }
  }

  async storeProviderInbox(input: {
    readonly provider: string;
    readonly eventType: string;
    readonly fingerprint: string;
    readonly verified: boolean;
    readonly redactedPayload: Readonly<Record<string, unknown>>;
  }): Promise<{ readonly duplicate: boolean }> {
    const key = `${input.provider}:${input.eventType}:${input.fingerprint}`;
    const duplicate = this.inbox.has(key);
    this.inbox.add(key);
    return { duplicate };
  }
}
