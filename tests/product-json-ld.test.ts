import { describe, expect, it } from "vitest";

import {
  createCatalogSnapshotIndex,
  createEstateNo01Snapshot,
  createPublishedProductJsonLd,
} from "@/lib/catalog-runtime";

function productWithAtLeastTwoSkus() {
  const snapshot = createEstateNo01Snapshot();
  const product = snapshot.products.find(
    (candidate) =>
      snapshot.skus.filter((sku) => sku.productId === candidate.id).length >= 2,
  );
  if (!product) throw new Error("Expected a multi-SKU catalog fixture.");
  const skus = snapshot.skus.filter((sku) => sku.productId === product.id);
  return { snapshot, product, skus };
}

describe("published product structured data", () => {
  it("uses the published SKU price and production availability for a single Offer", () => {
    const { snapshot, product, skus } = productWithAtLeastTwoSkus();
    const skuPrice = product.basePriceTwd + 1_234;
    const publishedSku = {
      ...skus[0]!,
      priceTwd: skuPrice,
      displayStatus: "available" as const,
      enabledInProduction: true,
    };
    const catalog = createCatalogSnapshotIndex({
      ...snapshot,
      skus: [
        ...snapshot.skus.filter((sku) => sku.productId !== product.id),
        publishedSku,
      ],
    });

    expect(createPublishedProductJsonLd(product, catalog).offers).toEqual({
      "@type": "Offer",
      priceCurrency: "TWD",
      price: skuPrice,
      availability: "https://schema.org/InStock",
      url: `https://estatelignee.com/product/${product.slug}`,
    });
  });

  it("uses the SKU range for AggregateOffer and requires both production enablement and availability", () => {
    const { snapshot, product, skus } = productWithAtLeastTwoSkus();
    const lowPrice = product.basePriceTwd + 2_000;
    const highPrice = product.basePriceTwd + 6_000;
    const publishedSkus = [
      {
        ...skus[0]!,
        priceTwd: lowPrice,
        displayStatus: "available" as const,
        enabledInProduction: false,
      },
      {
        ...skus[1]!,
        priceTwd: highPrice,
        displayStatus: "unavailable" as const,
        enabledInProduction: true,
      },
    ];
    const catalog = createCatalogSnapshotIndex({
      ...snapshot,
      skus: [
        ...snapshot.skus.filter((sku) => sku.productId !== product.id),
        ...publishedSkus,
      ],
    });

    expect(createPublishedProductJsonLd(product, catalog).offers).toEqual({
      "@type": "AggregateOffer",
      priceCurrency: "TWD",
      lowPrice,
      highPrice,
      offerCount: 2,
      availability: "https://schema.org/OutOfStock",
      url: `https://estatelignee.com/product/${product.slug}`,
    });
  });
});
