import { createHash } from "node:crypto";

import {
  createCatalogSnapshotIndex,
  type PublicCatalogSnapshot,
} from "@/lib/catalog-runtime";

import { getCatalogRepository } from "./container";
import { CommerceDomainError } from "./errors";
import {
  createOrderTotalsSnapshot,
  type OrderLineSnapshot,
  type OrderTotalsSnapshot,
} from "./money";

export interface QuoteRequestLine {
  readonly skuId: string;
  readonly quantity: number;
  readonly lastSeenPriceVersion?: string;
  readonly lastSeenUnitPriceTwd?: number;
}

export interface CurrentQuoteLine {
  readonly skuId: string;
  readonly quantity: number;
  readonly priceVersion: string;
  readonly unitGrossTwd: number;
  readonly lineGrossTwd: number;
  readonly lineNetTwd: number;
  readonly lineTaxTwd: number;
  readonly invoiceLineKey: string;
  readonly units: OrderLineSnapshot["units"];
  readonly priceChanged: boolean;
  readonly product: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
    readonly subtitle: string;
    readonly availability: "sandbox";
  };
}

export interface CurrentQuote {
  readonly currency: "TWD";
  readonly taxIncluded: true;
  readonly digestSchemaRevision: string;
  readonly financialRevisions: QuoteFinancialRevisions;
  readonly quoteDigest: string;
  readonly lines: readonly CurrentQuoteLine[];
  readonly totals: OrderTotalsSnapshot;
  readonly commerce: {
    readonly mode: "sandbox";
    readonly livePaymentAvailable: false;
  };
}

export interface QuoteFinancialRevisions {
  readonly taxRulesRevision: string;
  readonly shippingRulesRevision: string;
  readonly pricingCatalogRevision: string;
  readonly catalogSafetyRevision: string;
  readonly legalRevision: string;
}

export const QUOTE_DIGEST_SCHEMA_REVISION = "lignee-financial-quote-v2";

export const DEFAULT_QUOTE_FINANCIAL_REVISIONS = Object.freeze({
  taxRulesRevision: "tw-tax-included-5pct-largest-remainder-v1",
  shippingRulesRevision: "tw-main-island-250-free-at-12000-v1",
  pricingCatalogRevision: "sandbox-catalog-2026-07-24-v1",
  catalogSafetyRevision: "sandbox-review-safety-v1",
  legalRevision: "tw-draft-legal-gate-v1",
} satisfies QuoteFinancialRevisions);

export interface QuoteDigestContext {
  readonly digestSchemaRevision: string;
  readonly currency: string;
  readonly taxIncluded: boolean;
  readonly financialRevisions: QuoteFinancialRevisions;
}

export const DEFAULT_QUOTE_DIGEST_CONTEXT = Object.freeze({
  digestSchemaRevision: QUOTE_DIGEST_SCHEMA_REVISION,
  currency: "TWD",
  taxIncluded: true,
  financialRevisions: DEFAULT_QUOTE_FINANCIAL_REVISIONS,
} satisfies QuoteDigestContext);

const financialRevisionsForSnapshot = (
  snapshot: PublicCatalogSnapshot,
  financialRevisions?: QuoteFinancialRevisions,
): QuoteFinancialRevisions =>
  financialRevisions ?? {
    ...DEFAULT_QUOTE_FINANCIAL_REVISIONS,
    pricingCatalogRevision: `publication-${snapshot.revision}`,
  };

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

export const createFinancialQuoteDigest = (
  totals: OrderTotalsSnapshot,
  context: QuoteDigestContext,
): string => {
  const immutableSnapshot = {
    digestSchemaRevision: context.digestSchemaRevision,
    currency: context.currency,
    taxIncluded: context.taxIncluded,
    financialRevisions: context.financialRevisions,
    taxRatePercent: totals.taxRatePercent,
    lines: totals.lines.map((line) => ({
      skuId: line.skuId,
      quantity: line.quantity,
      priceVersion: line.priceVersion,
      unitGrossTwd: line.unitGrossTwd,
      grossTwd: line.grossTwd,
      netTwd: line.netTwd,
      taxTwd: line.taxTwd,
      invoiceLineKey: line.invoiceLineKey,
      units: line.units.map((unit) => ({
        skuId: unit.skuId,
        unitOrdinal: unit.unitOrdinal,
        grossTwd: unit.grossTwd,
        netTwd: unit.netTwd,
        taxTwd: unit.taxTwd,
        invoiceLineKey: unit.invoiceLineKey,
      })),
    })),
    totals: {
      merchandiseGrossTwd: totals.merchandiseGrossTwd,
      shipping: totals.shipping,
      grossTwd: totals.grossTwd,
      netTwd: totals.netTwd,
      taxTwd: totals.taxTwd,
    },
  };
  return createHash("sha256")
    .update(canonicalJson(immutableSnapshot))
    .digest("hex");
};

export async function createCurrentQuote(
  requestedLines: readonly QuoteRequestLine[],
  financialRevisions?: QuoteFinancialRevisions,
): Promise<CurrentQuote> {
  const snapshot = await getCatalogRepository().readSnapshot();
  const catalog = createCatalogSnapshotIndex(snapshot);
  const effectiveFinancialRevisions = financialRevisionsForSnapshot(
    snapshot,
    financialRevisions,
  );
  const requestedBySku = new Map(
    requestedLines.map((line) => [line.skuId, line] as const),
  );
  const pricedLines = [...requestedLines]
    .sort((left, right) => left.skuId.localeCompare(right.skuId))
    .map((line) => {
      const sku = catalog.getSkuById(line.skuId);
      const product = sku
        ? catalog.getProductById(sku.productId)
        : undefined;
      const unitGrossTwd = sku
        ? catalog.getEffectiveSkuPrice(sku)
        : undefined;
      if (!sku || !product || unitGrossTwd === undefined) {
        throw new CommerceDomainError(
          "SKU_UNAVAILABLE",
          "A requested SKU is unknown or unavailable.",
          409,
        );
      }
      return {
        skuId: sku.id,
        quantity: line.quantity,
        priceVersion: sku.priceVersion,
        unitGrossTwd,
        product,
      };
    });
  const totals = createOrderTotalsSnapshot(pricedLines);
  const lines = totals.lines.map((snapshot): CurrentQuoteLine => {
    const pricedLine = pricedLines.find((line) => line.skuId === snapshot.skuId);
    const requestedLine = requestedBySku.get(snapshot.skuId);
    if (!pricedLine || !requestedLine) {
      throw new CommerceDomainError(
        "INVALID_PRICE_SNAPSHOT",
        "The canonical quote could not be assembled.",
      );
    }
    return Object.freeze({
      skuId: snapshot.skuId,
      quantity: snapshot.quantity,
      priceVersion: snapshot.priceVersion,
      unitGrossTwd: snapshot.unitGrossTwd,
      lineGrossTwd: snapshot.grossTwd,
      lineNetTwd: snapshot.netTwd,
      lineTaxTwd: snapshot.taxTwd,
      invoiceLineKey: snapshot.invoiceLineKey,
      units: snapshot.units,
      priceChanged:
        requestedLine.lastSeenPriceVersion !== undefined &&
        (requestedLine.lastSeenPriceVersion !== snapshot.priceVersion ||
          requestedLine.lastSeenUnitPriceTwd !== snapshot.unitGrossTwd),
      product: Object.freeze({
        id: pricedLine.product.id,
        slug: pricedLine.product.slug,
        name: pricedLine.product.name,
        subtitle: pricedLine.product.subtitle,
        availability: "sandbox" as const,
      }),
    });
  });
  return Object.freeze({
    currency: "TWD" as const,
    taxIncluded: true as const,
    digestSchemaRevision: QUOTE_DIGEST_SCHEMA_REVISION,
    financialRevisions: Object.freeze({ ...effectiveFinancialRevisions }),
    quoteDigest: createFinancialQuoteDigest(totals, {
      ...DEFAULT_QUOTE_DIGEST_CONTEXT,
      financialRevisions: effectiveFinancialRevisions,
    }),
    lines: Object.freeze(lines),
    totals,
    commerce: Object.freeze({
      mode: "sandbox" as const,
      livePaymentAvailable: false as const,
    }),
  });
}
