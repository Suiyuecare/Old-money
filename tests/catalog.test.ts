import { describe, expect, it } from "vitest";

import {
  assertCatalogConsistency,
  catalogIsValid,
  catalogStats,
  catalogValidationErrors,
  categories,
  collections,
  excludedProductIds,
  findSkuForOptions,
  formatTwd,
  getEffectiveSkuPrice,
  getApparelByAudience,
  getProductById,
  getProductPriceRange,
  getProductsByCategory,
  getProductsByCollection,
  getRelatedProducts,
  getSkuById,
  getSkusForProduct,
  normalizeCatalogSearchText,
  products,
  searchProducts,
  skus,
  validateCatalog,
  type CategoryId,
  type CollectionId,
  type Product,
  type ProductOptionKey,
} from "@/lib/catalog";

const lockedAssortment = [
  ["field-house-polo", "apparel", "first-light-in-the-field", 7_800],
  ["alder-oxford-shirt", "apparel", "first-light-in-the-field", 8_800],
  ["conservatory-knit", "apparel", "the-conservatory-hour", 9_800],
  ["bracken-riding-blazer", "apparel", "first-light-in-the-field", 28_800],
  ["long-lawn-trousers", "apparel", "the-conservatory-hour", 13_800],
  ["keeper-bermuda-shorts", "apparel", "first-light-in-the-field", 8_800],
  ["walled-garden-dress", "apparel", "the-conservatory-hour", 24_800],
  ["hawthorn-trench", "apparel", "first-light-in-the-field", 28_800],
  ["moorland-wax-jacket", "apparel", "first-light-in-the-field", 24_800],
  ["north-hall-overcoat", "apparel", "after-rain-the-library", 36_800],
  ["morning-room-cardigan", "apparel", "the-conservatory-hour", 12_800],
  ["orchard-roll-neck", "apparel", "first-light-in-the-field", 11_800],
  ["estate-silk-blouse", "apparel", "the-conservatory-hour", 9_800],
  ["cedar-pleated-skirt", "apparel", "the-conservatory-hour", 12_800],
  ["paddock-waistcoat", "apparel", "first-light-in-the-field", 13_800],
  ["garden-shirt-dress", "apparel", "the-conservatory-hour", 22_800],
  ["bridle-line-belt", "accessories", "first-light-in-the-field", 6_800],
  ["glasshouse-tote", "accessories", "the-conservatory-hour", 16_800],
  ["estate-dispatch-briefcase", "accessories", "after-rain-the-library", 32_000],
  ["south-lawn-sunglasses", "accessories", "first-light-in-the-field", 9_800],
  ["long-table-tie", "accessories", "dinner-at-the-long-table", 7_200],
  ["bridle-loafers", "accessories", "first-light-in-the-field", 14_800],
  ["keeper-riding-boots", "accessories", "first-light-in-the-field", 18_800],
  ["house-colours-silk-scarf", "accessories", "the-conservatory-hour", 6_800],
  ["ash-walking-umbrella", "accessories", "after-rain-the-library", 8_800],
  ["signet-cufflinks", "accessories", "dinner-at-the-long-table", 6_800],
  ["hearth-number-four-candle", "home", "dinner-at-the-long-table", 3_200],
  ["wet-cedar-diffuser", "home", "after-rain-the-library", 4_800],
  ["stable-door-throw", "home", "first-light-in-the-field", 12_800],
  ["breakfast-room-mug", "home", "dinner-at-the-long-table", 2_200],
  ["library-service-tray", "home", "after-rain-the-library", 7_600],
  ["manor-table-linen", "home", "dinner-at-the-long-table", 8_800],
  ["long-hall-candlesticks", "home", "dinner-at-the-long-table", 12_800],
  ["drawing-room-cushion", "home", "dinner-at-the-long-table", 6_800],
  ["library-bookends", "home", "after-rain-the-library", 7_600],
  ["estate-ledger-notebook", "stationery", "after-rain-the-library", 5_800],
  ["correspondence-pen", "stationery", "after-rain-the-library", 3_800],
  ["valet-desk-tray", "stationery", "after-rain-the-library", 6_800],
  ["house-correspondence-cards", "stationery", "after-rain-the-library", 2_200],
  ["brass-letter-opener", "stationery", "after-rain-the-library", 3_800],
  ["ash-tone-tennis-racquet", "tennis", "the-private-court", 18_800],
  ["baseline-tennis-dress", "tennis", "the-private-court", 9_800],
  ["pavilion-pleated-skirt", "tennis", "the-private-court", 7_800],
  ["match-point-cable-vest", "tennis", "the-private-court", 8_800],
  ["house-championship-tennis-balls", "tennis", "the-private-court", 2_800],
  ["bridle-leather-racquet-cover", "tennis", "the-private-court", 9_800],
  ["clubhouse-tailored-shorts", "tennis", "the-private-court", 7_800],
  ["centre-court-performance-polo", "tennis", "the-private-court", 7_800],
  ["centre-line-court-shoes", "tennis", "the-private-court", 12_800],
  ["clubhouse-racquet-tote", "tennis", "the-private-court", 16_800],
] as const satisfies readonly [
  string,
  CategoryId,
  CollectionId,
  number,
][];

const categoryCounts: Record<CategoryId, number> = {
  apparel: 16,
  accessories: 10,
  home: 9,
  stationery: 5,
  tennis: 10,
};

const chapterCounts: Record<CollectionId, number> = {
  "first-light-in-the-field": 13,
  "the-conservatory-hour": 9,
  "after-rain-the-library": 11,
  "dinner-at-the-long-table": 7,
  "the-private-court": 10,
};

const optionSignature = (
  product: Product,
  options: Readonly<Partial<Record<ProductOptionKey, string>>>,
) => product.optionAxes.map((axis) => `${axis.key}:${options[axis.key] ?? ""}`).join("|");

describe("locked Estate No. 01 assortment", () => {
  it("contains exactly the approved 50 products in stable order", () => {
    expect(products).toHaveLength(50);
    expect(categories).toHaveLength(5);
    expect(collections).toHaveLength(5);
    expect(
      products.map(({ id, category, collectionId, basePriceTwd }) => [
        id,
        category,
        collectionId,
        basePriceTwd,
      ]),
    ).toEqual(lockedAssortment);
    expect(products.map(({ productCode }) => productCode)).toEqual(
      Array.from({ length: 50 }, (_, index) =>
        `LIG-ENO1-${String(index + 1).padStart(3, "0")}`,
      ),
    );
  });

  it("keeps the exact category and editorial-chapter splits", () => {
    for (const category of categories) {
      expect(getProductsByCategory(category.id)).toHaveLength(categoryCounts[category.id]);
    }
    for (const collection of collections) {
      expect(getProductsByCollection(collection.id)).toHaveLength(
        chapterCounts[collection.id],
      );
    }
    expect(catalogStats.productCountsByCategory).toEqual(categoryCounts);
  });

  it("splits apparel into men and women edits while sharing unisex pieces", () => {
    const mensApparel = getApparelByAudience("men");
    const womensApparel = getApparelByAudience("women");

    expect(mensApparel).toHaveLength(10);
    expect(womensApparel).toHaveLength(12);
    expect(mensApparel.every((product) => product.category === "apparel")).toBe(true);
    expect(womensApparel.every((product) => product.category === "apparel")).toBe(true);
    expect(mensApparel.some((product) => product.audience === "women")).toBe(false);
    expect(womensApparel.some((product) => product.audience === "men")).toBe(false);
    expect(
      mensApparel
        .filter((product) => product.audience === "unisex")
        .map((product) => product.id),
    ).toEqual(
      womensApparel
        .filter((product) => product.audience === "unisex")
        .map((product) => product.id),
    );
  });

  it("keeps every deliberately excluded legacy item out", () => {
    expect(excludedProductIds).toHaveLength(10);
    for (const productId of excludedProductIds) {
      expect(getProductById(productId)).toBeUndefined();
      expect(products.some((product) => product.id === productId)).toBe(false);
    }
  });

  it("passes all built-in consistency guards", () => {
    expect(validateCatalog()).toEqual([]);
    expect(catalogValidationErrors).toEqual([]);
    expect(catalogIsValid).toBe(true);
    expect(assertCatalogConsistency()).toBe(true);
  });
});

describe("SKU identity, selectable options, and launch facts", () => {
  it("generates every Cartesian option combination once", () => {
    for (const product of products) {
      const productSkus = getSkusForProduct(product.id);
      const expectedCount = product.optionAxes.reduce(
        (count, axis) => count * axis.values.length,
        1,
      );
      const signatures = productSkus.map((sku) => optionSignature(product, sku.options));

      expect(productSkus, product.id).toHaveLength(expectedCount);
      expect(new Set(signatures), product.id).toHaveLength(expectedCount);
      for (const sku of productSkus) {
        expect(getSkuById(sku.id)).toBe(sku);
        expect(findSkuForOptions(product.id, sku.options)).toBe(sku);
        expect(sku.priceVersion).toBe("sandbox-2026-07-24-v1");
        expect(sku.factsStatus).toBe("requires-approval");
        expect(sku.enabledInProduction).toBe(false);
        expect(sku.weightGrams).toBeNull();
        expect(sku.packageDimensionsMm).toBeNull();
      }
    }
    expect(new Set(skus.map(({ id }) => id))).toHaveLength(skus.length);
  });

  it("never enables demo merchandise for production", () => {
    for (const product of products) {
      expect(product.purchasableInDemo).toBe(true);
      expect(product.purchasableInProduction).toBe(false);
      expect(product.priceStatus).toBe("sandbox-draft");
      expect(product.taxIncluded).toBe(true);
      expect(product.launchGateCodes).toContain("legal-trademark");
      expect(product.image.approvalStatus).toBe("requires-approval");
    }
  });
});

describe("server-authoritative catalog behavior", () => {
  it("uses positive integer TWD amounts and immutable current ranges", () => {
    for (const product of products) {
      const prices = getSkusForProduct(product.id).map((sku) =>
        getEffectiveSkuPrice(sku),
      );
      expect(prices.every((price) => Number.isSafeInteger(price) && (price ?? 0) > 0)).toBe(
        true,
      );
      expect(getProductPriceRange(product.id)).toEqual({
        min: Math.min(...(prices as number[])),
        max: Math.max(...(prices as number[])),
        isRange: new Set(prices).size > 1,
      });
    }
    expect(formatTwd(18_800)).toBe("NT$18,800");
  });

  it("normalizes and searches English and Chinese copy", () => {
    expect(normalizeCatalogSearchText("  LIGNÉE   Café  ")).toBe("lignee cafe");
    expect(searchProducts("OXFÓRD").map(({ id }) => id)).toContain(
      "alder-oxford-shirt",
    );
    expect(searchProducts("網球拍").map(({ id }) => id)).toContain(
      "ash-tone-tennis-racquet",
    );
    expect(searchProducts("not present in catalog")).toEqual([]);
    expect(searchProducts("")).toEqual(products);
  });

  it("keeps direct related-product and image relationships resolvable", () => {
    for (const product of products) {
      expect(getRelatedProducts(product.id).map(({ id }) => id)).toEqual(
        product.relatedProductIds,
      );
      expect(product.image.path).toBe(`/images/products/${product.id}.webp`);
      expect(product.image.detailPath).toBe(
        `/images/product-details/${product.id}-detail.webp`,
      );
      expect(getSkuById(product.image.picturedSkuId)?.productId).toBe(product.id);
    }
  });
});
