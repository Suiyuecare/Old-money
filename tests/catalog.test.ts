import { describe, expect, it } from "vitest";

import {
  assertCatalogConsistency,
  catalogIsValid,
  catalogStats,
  catalogValidationErrors,
  categories,
  collections,
  findSkuForOptions,
  formatTwd,
  getCategoryById,
  getCollectionById,
  getEffectiveSkuPrice,
  getProductById,
  getProductBySlug,
  getProductPriceRange,
  getProductsByAudience,
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
  type Product,
  type ProductOptionKey,
} from "@/lib/catalog";

const expectedProductIds = [
  "field-house-polo",
  "alder-oxford-shirt",
  "conservatory-knit",
  "bracken-riding-blazer",
  "long-lawn-trousers",
  "keeper-bermuda-shorts",
  "walled-garden-dress",
  "bridle-line-belt",
  "rain-ledger-watch",
  "glasshouse-tote",
  "estate-dispatch-briefcase",
  "south-lawn-sunglasses",
  "long-table-tie",
  "evening-sheer-tights",
  "dewdrop-earrings",
  "hearth-number-four-candle",
  "wet-cedar-diffuser",
  "guest-wing-bed-linen",
  "stable-door-throw",
  "breakfast-room-mug",
  "long-table-glasses",
  "library-service-tray",
  "conservatory-stem-vase",
  "estate-ledger-notebook",
  "correspondence-pen",
  "valet-desk-tray",
  "estate-almanac",
] as const;

const expectedCategoryCounts: Record<CategoryId, number> = {
  apparel: 7,
  accessories: 8,
  home: 8,
  stationery: 4,
};

const categoryPriceBounds: Record<CategoryId, readonly [number, number]> = {
  apparel: [6_800, 32_000],
  accessories: [4_800, 120_000],
  home: [1_800, 16_000],
  stationery: [1_200, 9_800],
};

const optionSignature = (product: Product, options: Record<string, string | undefined>) =>
  product.optionAxes.map((axis) => `${axis.key}:${options[axis.key] ?? ""}`).join("|");

const cartesianOptions = (
  product: Product,
  axisIndex = 0,
  selected: Partial<Record<ProductOptionKey, string>> = {},
): ReadonlyArray<Readonly<Partial<Record<ProductOptionKey, string>>>> => {
  const axis = product.optionAxes[axisIndex];
  if (!axis) return [{ ...selected }];

  return axis.values.flatMap((optionValue) =>
    cartesianOptions(product, axisIndex + 1, {
      ...selected,
      [axis.key]: optionValue.value,
    }),
  );
};

describe("catalog shape and stable identity", () => {
  it("keeps the launch assortment at exactly 27 products and 155 SKUs", () => {
    expect(products).toHaveLength(27);
    expect(skus).toHaveLength(155);
    expect(categories).toHaveLength(4);
    expect(collections).toHaveLength(4);
    expect(catalogStats).toEqual({
      productCount: 27,
      skuCount: 155,
      productCountsByCategory: expectedCategoryCounts,
    });
  });

  it("keeps the exact launch product IDs, slugs, and their stable order", () => {
    expect(products.map((product) => product.id)).toEqual(expectedProductIds);
    expect(products.map((product) => product.slug)).toEqual(expectedProductIds);

    expect(new Set(products.map((product) => product.id)).size).toBe(products.length);
    expect(new Set(products.map((product) => product.slug)).size).toBe(products.length);
    expect(new Set(skus.map((sku) => sku.id)).size).toBe(skus.length);

    for (const product of products) {
      expect(product.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(product.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(getProductById(product.id)).toBe(product);
      expect(getProductBySlug(product.slug)).toBe(product);
    }
  });

  it("has the exact category totals and resolvable category/collection indexes", () => {
    for (const category of categories) {
      expect(getCategoryById(category.id)).toBe(category);
      expect(getProductsByCategory(category.id)).toHaveLength(
        expectedCategoryCounts[category.id],
      );
    }

    for (const collection of collections) {
      expect(getCollectionById(collection.id)).toBe(collection);
      expect(getProductsByCollection(collection.id)).not.toHaveLength(0);
    }

    expect(getProductsByAudience("men")).not.toHaveLength(0);
    expect(getProductsByAudience("women")).not.toHaveLength(0);
    expect(getProductsByAudience("unisex")).not.toHaveLength(0);
    expect(getProductById("missing-product")).toBeUndefined();
    expect(getProductBySlug("missing-product")).toBeUndefined();
    expect(getCategoryById("missing-category")).toBeUndefined();
    expect(getCollectionById("missing-collection")).toBeUndefined();
  });

  it("passes every built-in consistency guard without an error", () => {
    expect(validateCatalog()).toEqual([]);
    expect(catalogValidationErrors).toEqual([]);
    expect(catalogIsValid).toBe(true);
    expect(assertCatalogConsistency()).toBe(true);
  });
});

describe("SKU option, lookup, and asset relations", () => {
  it("resolves every SKU in both directions with exactly the declared option axes", () => {
    for (const sku of skus) {
      const product = getProductById(sku.productId);
      expect(product, `missing product for ${sku.id}`).toBeDefined();
      if (!product) continue;

      expect(getSkuById(sku.id)).toBe(sku);
      expect(getSkusForProduct(product.id)).toContain(sku);
      expect(findSkuForOptions(product.id, sku.options)).toBe(sku);
      expect(Object.keys(sku.options).sort()).toEqual(
        product.optionAxes.map((axis) => axis.key).sort(),
      );

      for (const axis of product.optionAxes) {
        expect(axis.values.map((value) => value.value)).toContain(sku.options[axis.key]);
      }

      expect(sku.displayStatus).toBe("preview");
      expect(sku.representativeAssetId).toBe(product.image.assetId);
    }

    expect(getSkuById("missing-sku")).toBeUndefined();
    expect(getSkusForProduct("missing-product")).toEqual([]);
  });

  it("represents every selectable Cartesian option combination exactly once", () => {
    for (const product of products) {
      const expectedCombinations = cartesianOptions(product);
      const productSkus = getSkusForProduct(product.id);
      const signatures = productSkus.map((sku) => optionSignature(product, sku.options));

      expect(productSkus, product.id).toHaveLength(expectedCombinations.length);
      expect(new Set(signatures).size, product.id).toBe(signatures.length);

      for (const options of expectedCombinations) {
        const resolved = findSkuForOptions(product.id, options);
        expect(resolved, `${product.id}: ${JSON.stringify(options)}`).toBeDefined();
        expect(resolved?.productId).toBe(product.id);
      }
    }
  });

  it("never resolves partial, extraneous, invalid, or cross-product selections", () => {
    for (const product of products) {
      const firstSku = getSkusForProduct(product.id)[0];
      expect(firstSku).toBeDefined();
      if (!firstSku) continue;

      const firstAxis = product.optionAxes[0];
      const partial = { ...firstSku.options };
      delete partial[firstAxis.key];

      expect(findSkuForOptions(product.id, partial)).toBeUndefined();
      expect(
        findSkuForOptions(product.id, {
          ...firstSku.options,
          [firstAxis.key]: "not-a-real-option",
        }),
      ).toBeUndefined();
      expect(
        findSkuForOptions(product.id, {
          ...firstSku.options,
          unexpected: "value",
        } as typeof firstSku.options),
      ).toBeUndefined();
    }

    expect(findSkuForOptions("missing-product", {})).toBeUndefined();
  });

  it("links each pictured SKU to its own product and canonical representative asset", () => {
    for (const product of products) {
      const picturedSku = getSkuById(product.image.picturedSkuId);
      expect(picturedSku, product.id).toBeDefined();
      expect(picturedSku?.productId).toBe(product.id);
      expect(picturedSku?.representativeAssetId).toBe(product.image.assetId);
      expect(getSkusForProduct(product.id)).toContain(picturedSku);
    }
  });
});

describe("prices", () => {
  it("uses safe integer TWD prices and reports exact effective ranges", () => {
    for (const product of products) {
      expect(Number.isSafeInteger(product.basePriceTwd), product.id).toBe(true);
      expect(product.basePriceTwd).toBeGreaterThan(0);

      const effectivePrices = getSkusForProduct(product.id).map((sku) => {
        const price = getEffectiveSkuPrice(sku);
        expect(Number.isSafeInteger(price), sku.id).toBe(true);
        expect(price).toBeGreaterThan(0);
        expect(getEffectiveSkuPrice(sku.id)).toBe(price);

        const [minimum, maximum] = categoryPriceBounds[product.category];
        expect(price).toBeGreaterThanOrEqual(minimum);
        expect(price).toBeLessThanOrEqual(maximum);
        return price as number;
      });

      const expectedMin = Math.min(...effectivePrices);
      const expectedMax = Math.max(...effectivePrices);
      expect(getProductPriceRange(product.id)).toEqual({
        min: expectedMin,
        max: expectedMax,
        isRange: expectedMin !== expectedMax,
      });
    }

    expect(getEffectiveSkuPrice("missing-sku")).toBeUndefined();
    expect(getProductPriceRange("missing-product")).toBeUndefined();
  });

  it("keeps representative fixed and variable price contracts", () => {
    expect(getProductPriceRange("field-house-polo")).toEqual({
      min: 7_800,
      max: 7_800,
      isRange: false,
    });
    expect(getProductPriceRange("rain-ledger-watch")).toEqual({
      min: 58_000,
      max: 64_000,
      isRange: true,
    });
    expect(getProductPriceRange("guest-wing-bed-linen")).toEqual({
      min: 12_800,
      max: 16_000,
      isRange: true,
    });
    expect(getProductPriceRange("estate-almanac")).toEqual({
      min: 2_800,
      max: 3_200,
      isRange: true,
    });
  });

  it("formats TWD with the expected prefix and thousands separators", () => {
    expect(formatTwd(0)).toBe("NT$0");
    expect(formatTwd(2_800)).toBe("NT$2,800");
    expect(formatTwd(58_000)).toBe("NT$58,000");
    expect(formatTwd(120_000)).toBe("NT$120,000");
  });
});

describe("Estate Almanac formats", () => {
  it("combines journal and monthly planner variants under one product", () => {
    const almanac = getProductById("estate-almanac");
    expect(almanac?.kind).toBe("journal-planner");

    const formatAxis = almanac?.optionAxes.find((axis) => axis.key === "format");
    expect(formatAxis?.values).toEqual([
      { value: "journal", label: "日誌" },
      { value: "monthly", label: "月計畫" },
    ]);
    expect(getSkusForProduct("estate-almanac")).toHaveLength(4);

    expect(
      findSkuForOptions("estate-almanac", { format: "journal", color: "ivory" })?.id,
    ).toBe("estate-almanac-journal-ivory");
    expect(
      findSkuForOptions("estate-almanac", { format: "monthly", color: "olive" })?.id,
    ).toBe("estate-almanac-monthly-olive");
    expect(getEffectiveSkuPrice("estate-almanac-journal-ivory")).toBe(3_200);
    expect(getEffectiveSkuPrice("estate-almanac-monthly-ivory")).toBe(2_800);
  });
});

describe("catalog search", () => {
  it("normalizes whitespace, case, composed accents, and decomposed accents", () => {
    expect(normalizeCatalogSearchText("  LIGNÉE   Café  ")).toBe("lignee cafe");
    expect(normalizeCatalogSearchText("LIGNE\u0301E")).toBe("lignee");
    expect(normalizeCatalogSearchText("  AFTER   RAIN  ")).toBe("after rain");
  });

  it("searches diacritic-insensitively across English, Chinese, and multiple tokens", () => {
    expect(searchProducts("OXFÓRD").map((product) => product.id)).toContain(
      "alder-oxford-shirt",
    );
    expect(searchProducts("Conservatóry Knit").map((product) => product.id)).toEqual([
      "conservatory-knit",
    ]);
    expect(searchProducts("藏書室 木").map((product) => product.id)).toContain(
      "library-service-tray",
    );
    expect(searchProducts("珍珠").map((product) => product.id)).toContain("dewdrop-earrings");
    expect(searchProducts("not present in catalog")).toEqual([]);
  });

  it("returns the complete stable assortment for a blank query", () => {
    expect(searchProducts("")).toEqual(products);
    expect(searchProducts("   ")).toEqual(products);
  });
});

describe("related products and images", () => {
  it("returns only direct, ordered related products and never the source product", () => {
    for (const product of products) {
      const related = getRelatedProducts(product.id);
      expect(related.map((candidate) => candidate.id)).toEqual(product.relatedProductIds);
      expect(related).not.toContain(product);
      expect(new Set(related.map((candidate) => candidate.id)).size).toBe(related.length);
    }

    expect(getRelatedProducts("missing-product")).toEqual([]);
    expect(getRelatedProducts("field-house-polo").map((product) => product.id)).toEqual([
      "keeper-bermuda-shorts",
      "bridle-line-belt",
      "south-lawn-sunglasses",
    ]);
  });

  it("keeps unique canonical image paths and representative paths stable", () => {
    expect(new Set(products.map((product) => product.image.path)).size).toBe(products.length);
    expect(new Set(products.map((product) => product.image.assetId)).size).toBe(products.length);

    for (const product of products) {
      expect(product.image.path).toBe(`/images/products/${product.id}.webp`);
      expect(product.image.assetId).toBe(`${product.id}-main`);
      expect(product.image.alt.trim().length).toBeGreaterThan(0);
    }

    expect(getProductById("field-house-polo")?.image.path).toBe(
      "/images/products/field-house-polo.webp",
    );
    expect(getProductById("rain-ledger-watch")?.image.path).toBe(
      "/images/products/rain-ledger-watch.webp",
    );
    expect(getProductById("conservatory-stem-vase")?.image.path).toBe(
      "/images/products/conservatory-stem-vase.webp",
    );
    expect(getProductById("estate-almanac")?.image.path).toBe(
      "/images/products/estate-almanac.webp",
    );
  });
});
