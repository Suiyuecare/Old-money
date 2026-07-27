import { describe, expect, it, vi } from "vitest";

import {
  parseEstateNo01CatalogDocument,
} from "@/lib/catalog-schema";
import {
  products as estateProducts,
  skus as estateSkus,
} from "@/lib/catalog";
import {
  CompareCatalogRepository,
  StaticCatalogRepository,
  SupabaseCatalogRepository,
  adminOrderProjectionSchema,
  adminProductDraftSchema,
  createCatalogContentDigest,
  createCatalogRepositoryFromEnvironment,
  createCatalogSnapshotIndex,
  createEstateNo01Snapshot,
  inventorySummarySchema,
  parsePublicCatalogSnapshot,
  productPublicationSchema,
  resolveCatalogSource,
} from "@/lib/catalog-runtime";

const createFiftyFirstProductSnapshot = () => {
  const fixture = createEstateNo01Snapshot();
  const firstProduct = fixture.products[0]!;
  const firstSku = fixture.skus.find(
    (sku) => sku.productId === firstProduct.id,
  )!;
  const productId = "estate-number-fifty-one";
  const skuId = `${productId}-s-estate-olive`;
  const product = {
    ...firstProduct,
    id: productId,
    productCode: "LIG-000051",
    launchPosition: 51,
    slug: productId,
    name: "Estate Number Fifty One",
    subtitle: "莊園第五十一號",
    kind: "riding-helmet",
    category: "equestrian",
    collectionId: "winter-at-alderwick",
    priceStatus: "approved" as const,
    launchStatus: "published" as const,
    purchasableInDemo: false,
    purchasableInProduction: true,
    image: {
      ...firstProduct.image,
      assetId: `${productId}-main`,
      path: `/images/products/${productId}.webp`,
      detailPath: `/images/product-details/${productId}-detail.webp`,
      picturedSkuId: skuId,
      approvalStatus: "approved" as const,
    },
  };
  const sku = {
    ...firstSku,
    id: skuId,
    skuCode: "LIG-000051-01",
    productId,
    priceTwd: 12_800,
    priceVersion: "price-000051-v1",
    displayStatus: "available" as const,
    representativeAssetId: product.image.assetId,
    factsStatus: "approved" as const,
    weightGrams: 420,
    packageDimensionsMm: { length: 320, width: 240, height: 60 },
    enabledInProduction: true,
  };
  return parsePublicCatalogSnapshot({
    ...fixture,
    revision: 2,
    generatedAt: "2026-07-27T00:00:00.000Z",
    products: [...fixture.products, product],
    skus: [...fixture.skus, sku],
    categories: [
      ...fixture.categories,
      {
        code: "equestrian",
        nameEn: "Equestrian",
        nameZh: "馬術",
        description: "為馬房、田野與騎乘日常準備的當代系列。",
        routeSegment: "equestrian",
        sortOrder: fixture.categories.length + 1,
      },
    ],
    chapters: [
      ...fixture.chapters,
      {
        code: "winter-at-alderwick",
        titleEn: "Winter at Alderwick",
        titleZh: "莊園冬日",
        description: "在冬季田野與屋內爐火之間延續的一章。",
        routeSegment: "winter-at-alderwick",
        sortOrder: fixture.chapters.length + 1,
      },
    ],
  });
};

describe("versioned catalog contracts", () => {
  it("accepts an empty first publication without inventing fallback products", () => {
    const snapshot = parsePublicCatalogSnapshot({
      schemaVersion: 1,
      revision: "0",
      generatedAt: "2026-07-27T00:00:00.000Z",
      products: [],
      skus: [],
    });

    expect(snapshot.products).toEqual([]);
    expect(snapshot.skus).toEqual([]);
  });

  it("keeps Estate No. 01 as an exact 50/189 fixture", () => {
    const snapshot = createEstateNo01Snapshot();

    expect(snapshot.products).toHaveLength(50);
    expect(snapshot.skus).toHaveLength(189);
    expect(snapshot.products.every(
      (product) => !("launchGateCodes" in product),
    )).toBe(true);
    expect(snapshot.products.map(({ id }) => id)).toEqual(
      createEstateNo01Snapshot().products.map(({ id }) => id),
    );
    expect(snapshot.skus.map(({ id }) => id)).toEqual(
      createEstateNo01Snapshot().skus.map(({ id }) => id),
    );
    expect(() =>
      parseEstateNo01CatalogDocument({
        products: estateProducts,
        skus: estateSkus,
      }),
    ).not.toThrow();
  });

  it("accepts a published 51st product without weakening the launch fixture", () => {
    const snapshot = createFiftyFirstProductSnapshot();

    expect(snapshot.revision).toBe("2");
    expect(snapshot.products).toHaveLength(51);
    expect(snapshot.skus).toHaveLength(190);
    expect(snapshot.products.at(-1)?.productCode).toBe("LIG-000051");
    expect(() =>
      parseEstateNo01CatalogDocument({
        products: snapshot.products,
        skus: snapshot.skus,
      }),
    ).toThrow();
  });

  it("creates a stable content digest independent of metadata and row order", () => {
    const snapshot = createEstateNo01Snapshot();
    const reordered = parsePublicCatalogSnapshot({
      ...snapshot,
      revision: "999",
      generatedAt: "2026-07-27T12:00:00.000Z",
      products: [...snapshot.products].reverse(),
      skus: [...snapshot.skus].reverse(),
    });
    const changed = parsePublicCatalogSnapshot({
      ...snapshot,
      products: snapshot.products.map((product, index) =>
        index === 0 ? { ...product, name: `${product.name} Revised` } : product,
      ),
    });

    expect(createCatalogContentDigest(reordered)).toBe(
      createCatalogContentDigest(snapshot),
    );
    expect(createCatalogContentDigest(changed)).not.toBe(
      createCatalogContentDigest(snapshot),
    );
  });

  it("validates the versioned admin projections at their Zod boundary", () => {
    const snapshot = createFiftyFirstProductSnapshot();
    const product = snapshot.products.at(-1)!;
    const productSkus = snapshot.skus.filter(
      (sku) => sku.productId === product.id,
    );
    const actorId = "45e6f448-d7c9-4a5d-b85a-f2ad3ed21ff9";
    const publicationId = "93f3e766-1b84-41b2-a297-9aa0d0088e95";

    expect(
      adminProductDraftSchema.parse({
        ...product,
        launchGateCodes: ["physical-sample"],
        schemaVersion: 1,
        rowVersion: 0,
        workflowStatus: "approved",
        updatedAt: "2026-07-27T12:00:00.000Z",
        updatedBy: actorId,
      }).productCode,
    ).toBe("LIG-000051");
    expect(
      productPublicationSchema.parse({
        schemaVersion: 1,
        id: publicationId,
        productId: product.id,
        publicationRevision: 1,
        status: "published",
        product,
        skus: productSkus,
        publishedAt: "2026-07-27T12:00:00.000Z",
        publishedBy: actorId,
      }).id,
    ).toBe(publicationId);
    expect(
      inventorySummarySchema.safeParse({
        schemaVersion: 1,
        skuId: productSkus[0]!.id,
        onHand: 10,
        reserved: 2,
        safetyStock: 1,
        available: 8,
        rowVersion: 1,
        updatedAt: "2026-07-27T12:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      adminOrderProjectionSchema.parse({
        schemaVersion: 1,
        id: "7b5eb984-d80d-40f3-9193-1f7993c938c4",
        publicId: "LIG-20260727-0001",
        merchantTradeNo: null,
        status: "awaiting_payment",
        customerEmailMasked: "a***@example.com",
        currency: "TWD",
        totals: {
          merchandiseGrossTwd: 12_800,
          shippingGrossTwd: 0,
          grossTwd: 12_800,
          netTwd: 12_190,
          taxTwd: 610,
        },
        paymentStatus: "pending",
        invoiceStatus: "not_requested",
        fulfillmentStatus: "unfulfilled",
        rowVersion: 0,
        createdAt: "2026-07-27T12:00:00.000Z",
        updatedAt: "2026-07-27T12:00:00.000Z",
      }).publicId,
    ).toBe("LIG-20260727-0001");
  });
});

describe("catalog repository source modes", () => {
  it("defaults to static locally and database in production", () => {
    expect(resolveCatalogSource({ NODE_ENV: "test" })).toBe("static");
    expect(
      resolveCatalogSource({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
      }),
    ).toBe("database");
    expect(
      resolveCatalogSource({
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
      }),
    ).toBe("static");
  });

  it("forbids serving the static fixture in production", () => {
    expect(() =>
      resolveCatalogSource({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        LIGNEE_CATALOG_SOURCE: "static",
      }),
    ).toThrowError(
      expect.objectContaining({ code: "STATIC_CATALOG_FORBIDDEN" }),
    );
  });

  it("serves a database snapshot only after compare parity succeeds", async () => {
    const staticSnapshot = createEstateNo01Snapshot();
    const databaseSnapshot = parsePublicCatalogSnapshot({
      ...staticSnapshot,
      revision: "27",
      generatedAt: "2026-07-27T14:00:00.000Z",
    });
    const repository = new CompareCatalogRepository({
      staticRepository: new StaticCatalogRepository(staticSnapshot),
      databaseRepository: new SupabaseCatalogRepository(async () =>
        databaseSnapshot
      ),
    });

    await expect(repository.readSnapshot()).resolves.toStrictEqual(
      databaseSnapshot,
    );
    await expect(repository.readSnapshot()).resolves.toMatchObject({
      revision: "27",
    });
  });

  it("fails closed when compare content differs", async () => {
    const staticSnapshot = createEstateNo01Snapshot();
    const databaseSnapshot = parsePublicCatalogSnapshot({
      ...staticSnapshot,
      products: staticSnapshot.products.map((product, index) =>
        index === 0 ? { ...product, basePriceTwd: 99_999 } : product,
      ),
    });
    const repository = new CompareCatalogRepository({
      staticRepository: new StaticCatalogRepository(staticSnapshot),
      databaseRepository: new SupabaseCatalogRepository(async () =>
        databaseSnapshot
      ),
    });

    await expect(repository.listPublished()).rejects.toMatchObject({
      code: "CATALOG_PARITY_MISMATCH",
    });
  });

  it("never constructs or serves a static fallback in database mode", async () => {
    const staticFactory = vi.fn(() => new StaticCatalogRepository());
    const repository = createCatalogRepositoryFromEnvironment(
      {
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        LIGNEE_CATALOG_SOURCE: "database",
      },
      {
        staticRepositoryFactory: staticFactory,
        databaseLoader: async () => {
          throw new Error("database offline");
        },
      },
    );

    expect(staticFactory).not.toHaveBeenCalled();
    await expect(repository.listPublished()).rejects.toMatchObject({
      code: "CATALOG_DATABASE_UNAVAILABLE",
    });
    expect(staticFactory).not.toHaveBeenCalled();
  });

  it("constructs database mode lazily and fails closed without bindings", async () => {
    const repository = createCatalogRepositoryFromEnvironment({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      LIGNEE_CATALOG_SOURCE: "database",
    });

    await expect(repository.readSnapshot()).rejects.toEqual(
      expect.objectContaining({
        code: "CATALOG_BINDING_UNAVAILABLE",
      }),
    );
  });
});

describe("snapshot-local catalog selectors", () => {
  it("indexes products and SKUs without reading another revision", () => {
    const snapshot = createEstateNo01Snapshot();
    const index = createCatalogSnapshotIndex(snapshot);
    const product = snapshot.products[0]!;
    const sku = snapshot.skus.find(
      (candidate) => candidate.productId === product.id,
    )!;

    expect(index.getProductById(product.id)).toBe(product);
    expect(index.getProductBySlug(product.slug)).toBe(product);
    expect(index.getSkuById(sku.id)).toBe(sku);
    expect(index.getSkusForProduct(product.id).map(({ id }) => id)).toEqual(
      snapshot.skus
        .filter((candidate) => candidate.productId === product.id)
        .map(({ id }) => id),
    );
    expect(index.findSkuForOptions(product.id, sku.options)).toBe(sku);
    expect(
      index.findSkuForOptions(product.id, {
        ...sku.options,
        invented: "unsafe",
      }),
    ).toBeUndefined();
  });

  it("selects category, audience, collection and related products", () => {
    const snapshot = createEstateNo01Snapshot();
    const index = createCatalogSnapshotIndex(snapshot);
    const product = snapshot.products[0]!;

    expect(index.selectProducts({ category: "tennis" })).toHaveLength(10);
    expect(
      index
        .selectProducts({
          category: "apparel",
          audience: "men",
          includeUnisexForAudience: true,
        })
        .every(
          (candidate) =>
            candidate.audience === "men" ||
            candidate.audience === "unisex",
        ),
    ).toBe(true);
    expect(
      index.selectProducts({
        collectionId: "the-private-court",
      }),
    ).toHaveLength(10);
    expect(index.getRelatedProducts(product.id).map(({ id }) => id)).toEqual(
      product.relatedProductIds,
    );
  });

  it("derives effective prices and product ranges from the same snapshot", () => {
    const snapshot = createEstateNo01Snapshot();
    const index = createCatalogSnapshotIndex(snapshot);
    const product = snapshot.products[0]!;
    const sku = index.getSkusForProduct(product.id)[0]!;

    expect(index.getEffectiveSkuPrice(sku)).toBe(product.basePriceTwd);
    expect(index.getEffectiveSkuPrice(sku.id)).toBe(product.basePriceTwd);
    expect(index.getProductPriceRange(product.id)).toEqual({
      min: product.basePriceTwd,
      max: product.basePriceTwd,
      isRange: false,
    });
  });
});
