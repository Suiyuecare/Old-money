import type {
  PublicCatalogSnapshot,
  PublishedMedia,
  PublishedProduct,
  PublishedSKU,
} from "./contracts";

export interface CatalogProductSelection {
  readonly category?: PublishedProduct["category"];
  readonly audience?: PublishedProduct["audience"];
  readonly collectionId?: PublishedProduct["collectionId"];
  readonly includeUnisexForAudience?: boolean;
}

export interface CatalogPriceRange {
  readonly min: number;
  readonly max: number;
  readonly isRange: boolean;
}

export interface CatalogSnapshotIndex {
  getProductById(id: string): PublishedProduct | undefined;
  getProductBySlug(slug: string): PublishedProduct | undefined;
  getSkuById(id: string): PublishedSKU | undefined;
  getSkusForProduct(productId: string): readonly PublishedSKU[];
  selectProducts(
    selection?: CatalogProductSelection,
  ): readonly PublishedProduct[];
  getRelatedProducts(productId: string): readonly PublishedProduct[];
  getMediaForProduct(productId: string): readonly PublishedMedia[];
  getEffectiveSkuPrice(skuOrId: PublishedSKU | string): number | undefined;
  getProductPriceRange(productId: string): CatalogPriceRange | undefined;
  findSkuForOptions(
    productId: string,
    options: Readonly<Record<string, string | undefined>>,
  ): PublishedSKU | undefined;
}

/**
 * Builds request-local selectors over one immutable publication snapshot.
 * No selector reaches back to a repository, so a render cannot mix revisions.
 */
export function createCatalogSnapshotIndex(
  snapshot: PublicCatalogSnapshot,
): CatalogSnapshotIndex {
  const productById = new Map(
    snapshot.products.map((product) => [product.id, product] as const),
  );
  const productBySlug = new Map(
    snapshot.products.map((product) => [product.slug, product] as const),
  );
  const skuById = new Map(
    snapshot.skus.map((sku) => [sku.id, sku] as const),
  );
  const skusByProductId = new Map<string, PublishedSKU[]>();
  const mediaByProductId = new Map<string, PublishedMedia[]>();
  for (const product of snapshot.products) {
    skusByProductId.set(product.id, []);
    mediaByProductId.set(product.id, []);
  }
  for (const sku of snapshot.skus) {
    skusByProductId.get(sku.productId)?.push(sku);
  }
  for (const media of snapshot.media) {
    mediaByProductId.get(media.productId)?.push(media);
  }
  for (const media of mediaByProductId.values()) {
    media.sort((left, right) =>
      left.role.localeCompare(right.role) ||
      left.sortOrder - right.sortOrder,
    );
  }

  const getEffectiveSkuPrice = (
    skuOrId: PublishedSKU | string,
  ): number | undefined => {
    const sku =
      typeof skuOrId === "string" ? skuById.get(skuOrId) : skuOrId;
    if (!sku) return undefined;
    return sku.priceTwd ?? productById.get(sku.productId)?.basePriceTwd;
  };

  return Object.freeze({
    getProductById: (id: string) => productById.get(id),
    getProductBySlug: (slug: string) => productBySlug.get(slug),
    getSkuById: (id: string) => skuById.get(id),
    getSkusForProduct: (productId: string) =>
      skusByProductId.get(productId) ?? [],
    selectProducts: (selection: CatalogProductSelection = {}) =>
      snapshot.products.filter(
        (product) =>
          (selection.category === undefined ||
            product.category === selection.category) &&
          (selection.collectionId === undefined ||
            product.collectionId === selection.collectionId) &&
          (selection.audience === undefined ||
            product.audience === selection.audience ||
            (selection.includeUnisexForAudience === true &&
              selection.audience !== "unisex" &&
              product.audience === "unisex")),
      ),
    getRelatedProducts: (productId: string) => {
      const product = productById.get(productId);
      if (!product) return [];
      return product.relatedProductIds.flatMap((relatedProductId) => {
        const related = productById.get(relatedProductId);
        return related ? [related] : [];
      });
    },
    getMediaForProduct: (productId: string) =>
      mediaByProductId.get(productId) ?? [],
    getEffectiveSkuPrice,
    getProductPriceRange: (
      productId: string,
    ): CatalogPriceRange | undefined => {
      const prices = (skusByProductId.get(productId) ?? [])
        .map(getEffectiveSkuPrice)
        .filter((price): price is number => price !== undefined);
      if (prices.length === 0) return undefined;
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      return Object.freeze({ min, max, isRange: min !== max });
    },
    findSkuForOptions: (
      productId: string,
      selected: Readonly<Record<string, string | undefined>>,
    ) => {
      const product = productById.get(productId);
      if (!product) return undefined;
      const requiredKeys = product.optionAxes.map((axis) => axis.key);
      if (
        Object.keys(selected).length !== requiredKeys.length ||
        requiredKeys.some((key) => typeof selected[key] !== "string")
      ) {
        return undefined;
      }
      return (skusByProductId.get(productId) ?? []).find((sku) =>
        requiredKeys.every((key) => sku.options[key] === selected[key]),
      );
    },
  });
}
