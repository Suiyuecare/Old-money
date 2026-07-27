import type {
  PublicCatalogSnapshot,
  PublishedProduct,
  PublishedSKU,
} from "@/lib/catalog-runtime";

import type { InventoryBalance, InventoryOperationResult } from "./inventory";
import type { OrderTotalsSnapshot } from "./money";
import type { QuoteFinancialRevisions } from "./quote";

export interface CatalogRepository {
  /**
   * Transitional mocks may omit the snapshot method; all repositories returned
   * by getCatalogRepository implement the complete versioned contract.
   */
  readSnapshot?(): Promise<PublicCatalogSnapshot>;
  listPublished(): Promise<readonly PublishedProduct[]>;
  findPublishedProductBySlug(
    slug: string,
  ): Promise<PublishedProduct | undefined>;
  findCurrentSku(skuId: string): Promise<PublishedSKU | undefined>;
}

export interface CheckoutDraft {
  readonly id: string;
  readonly emailVerified: boolean;
  readonly expiresAt: string;
  readonly safetyRevision: number;
}

export interface OrderRecord {
  readonly id: string;
  readonly publicId: string;
  readonly merchantTradeNo: string;
  readonly status: "awaiting_payment" | "paid" | "processing" | "shipped" | "delivered" | "closed";
  readonly totals: OrderTotalsSnapshot;
  readonly quote: {
    readonly digest: string;
    readonly digestSchemaRevision: string;
    readonly financialRevisions: QuoteFinancialRevisions;
  };
  readonly createdAt: string;
  readonly productionCanary: boolean;
}

export interface CommerceRepository {
  findCheckoutDraftCommandReplay(input: {
    readonly idempotencyKey: string;
    readonly safetyRevision: number;
  }): Promise<CheckoutDraft | undefined>;
  createCheckoutDraft(input: {
    readonly idempotencyKey: string;
    readonly safetyRevision: number;
  }): Promise<CheckoutDraft>;
  findOrderCommandReplay(input: {
    readonly idempotencyKey: string;
    readonly totals: OrderTotalsSnapshot;
    readonly quote: OrderRecord["quote"];
    readonly productionCanary: boolean;
  }): Promise<OrderRecord | undefined>;
  createOrder(input: {
    readonly idempotencyKey: string;
    readonly totals: OrderTotalsSnapshot;
    readonly quote: OrderRecord["quote"];
    readonly productionCanary: boolean;
  }): Promise<OrderRecord>;
  findOrderByPublicId(publicId: string): Promise<OrderRecord | undefined>;
  applyInventoryOperation(input: {
    readonly operationKey: string;
    readonly skuId: string;
    readonly kind:
      | "receive"
      | "reserve"
      | "release"
      | "sale"
      | "cancel_restock"
      | "return_sellable"
      | "return_damaged";
    readonly quantity: number;
    readonly orderId?: string;
    readonly reservationId?: string;
  }): Promise<InventoryOperationResult>;
  getInventoryBalance(skuId: string): Promise<InventoryBalance | undefined>;
}

export interface AuditEvent {
  readonly id: string;
  readonly actorScope: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly changedFields: readonly string[];
  readonly requestId: string;
  readonly occurredAt: string;
}

export interface OperationsRepository {
  appendAuditEvent(event: AuditEvent): Promise<void>;
  enqueueOutbox(input: {
    readonly operationKey: string;
    readonly jobType: string;
    readonly aggregateId: string;
    readonly payload: Readonly<Record<string, unknown>>;
  }): Promise<void>;
  storeProviderInbox(input: {
    readonly provider: string;
    readonly eventType: string;
    readonly fingerprint: string;
    readonly verified: boolean;
    readonly redactedPayload: Readonly<Record<string, unknown>>;
  }): Promise<{ readonly duplicate: boolean }>;
}
