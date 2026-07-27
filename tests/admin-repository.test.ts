import { afterEach, describe, expect, it } from "vitest";

import { AdminRepositoryError, getAdminRepository } from "@/lib/admin/repository";
import {
  getAdminMediaTransitionSpec,
  listAdminMediaTransitions,
} from "@/lib/admin/media-review";
import {
  mapRpcAdminProduct,
  mapRpcCatalogList,
  mapRpcDashboard,
  mapRpcInventory,
  mapRpcMediaTransition,
  mapRpcOrder,
} from "@/lib/admin/rpc-repository";
import { isProductionStaffInviteEnvironment } from "@/lib/admin/staff";
import type { AdminIdentity, AdminProductInput } from "@/lib/admin/types";
import {
  adminMediaLinkInputSchema,
  adminProductInputSchema,
  adminVariantInputSchema,
  inventoryMovementSchema,
} from "@/lib/admin/validation";

const originalMode = process.env.LIGNEE_MODE;
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

afterEach(() => {
  if (originalMode === undefined) delete process.env.LIGNEE_MODE;
  else process.env.LIGNEE_MODE = originalMode;
  if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalSupabaseUrl;
  if (originalSupabaseKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
  else process.env.SUPABASE_PUBLISHABLE_KEY = originalSupabaseKey;
});

const actor: AdminIdentity = {
  userId: "test-owner",
  email: "owner@example.com",
  displayName: "Test Owner",
  role: "owner",
  demo: true,
};

const input: AdminProductInput = {
  slug: "admin-test-estate-coat",
  name: "Admin Test Estate Coat",
  subtitle: "後台測試莊園外套",
  category: "apparel",
  audience: "unisex",
  collectionId: "first-light-in-the-field",
  kind: "outerwear",
  description: "用來驗證商品後台草稿與發布流程的隔離資料。",
  story: "此內容只存在於 Vitest 執行程序中的 Demo repository。",
  sizing: "測試尺寸資料。",
  care: "測試照護資料。",
  materialConcepts: ["wool-direction"],
  optionAxes: [{
    key: "size",
    label: "尺寸",
    values: [{ value: "one-size", label: "One Size" }],
  }],
  launchGateCodes: ["physical-sample", "legal-trademark"],
  relatedProductIds: [],
  seoTitle: "後台測試莊園外套｜LIGNÉE",
  seoDescription: "驗證 LIGNÉE 商品後台。",
};

describe("admin demo repository", () => {
  it("seeds the current catalog and order projections", async () => {
    process.env.LIGNEE_MODE = "demo";
    const repository = getAdminRepository();
    const [products, orders, dashboard] = await Promise.all([
      repository.listProducts(),
      repository.listOrders(),
      repository.getDashboard(),
    ]);
    expect(repository.mode).toBe("demo");
    expect(products.length).toBeGreaterThanOrEqual(50);
    expect(orders.length).toBeGreaterThan(0);
    expect(dashboard.productCount).toBe(products.length);
  });

  it("creates, version-checks, publishes and archives without hard delete", async () => {
    process.env.LIGNEE_MODE = "demo";
    const repository = getAdminRepository();
    const created = await repository.createProduct(input, {
      actor,
      idempotencyKey: "admin-test-create-0001",
    });
    expect(created.productCode).toMatch(/^LIG-\d{6}$/);
    expect(created.status).toBe("draft");
    await expect(repository.createProduct(input, {
      actor,
      idempotencyKey: "admin-test-create-0001",
    })).resolves.toEqual(created);

    const updated = await repository.updateProduct(created.id, {
      ...input,
      subtitle: "後台測試莊園大衣",
    }, {
      actor,
      expectedVersion: created.version,
      idempotencyKey: "admin-test-update-0001",
    });
    expect(updated.version).toBe(created.version + 1);

    await expect(repository.updateProduct(created.id, input, {
      actor,
      expectedVersion: created.version,
      idempotencyKey: "admin-test-update-stale",
    })).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });

    let publishable = await repository.upsertVariant(created.id, {
      publicId: `${created.productCode.toLowerCase()}-one-size`,
      options: { size: "One Size" },
      weightGrams: 850,
      packageDimensionsMm: { length: 500, width: 360, height: 120 },
      factsStatus: "approved",
      enabled: true,
    }, {
      actor,
      expectedVersion: updated.version,
      idempotencyKey: "admin-test-variant-0001",
    });
    const variant = publishable.variants[0];
    expect(variant).toBeDefined();
    if (!variant) return;

    publishable = await repository.addPrice({
      variantId: variant.id,
      expectedVariantVersion: variant.rowVersion,
      grossTwd: 26800,
      status: "approved",
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: null,
    }, {
      actor,
      expectedVersion: publishable.version,
      idempotencyKey: "admin-test-price-0001",
    });
    const inventory = (await repository.listInventory(variant.skuCode))
      .find((item) => item.skuId === variant.id);
    expect(inventory).toBeDefined();
    if (!inventory) return;
    await repository.adjustInventory(variant.id, 4, "receiving", {
      actor,
      expectedVersion: inventory.version,
      idempotencyKey: "admin-test-stock-0001",
    });

    publishable = await repository.linkMedia(created.id, {
      assetId: "11111111-1111-1111-1111-111111111111",
      role: "main",
      sortOrder: 1,
      alt: "後台測試莊園大衣正面",
      focalX: 0.5,
      focalY: 0.4,
      picturedSkuId: variant.publicId,
      publicPath: `/media/${"a".repeat(64)}/1200.webp`,
    }, {
      actor,
      expectedVersion: publishable.version,
      idempotencyKey: "admin-test-media-0001",
    });
    const linkedMedia = publishable.media[0];
    expect(linkedMedia).toBeDefined();
    if (!linkedMedia) return;
    await repository.transitionMedia({
      assetId: linkedMedia.assetId,
      expectedAssetVersion: linkedMedia.assetRowVersion,
      toStatus: "review",
      backupAcknowledged: false,
      reason: null,
    }, {
      actor,
      idempotencyKey: "admin-test-media-review-0001",
    });
    const reviewed = await repository.getProduct(created.id);
    const reviewedMedia = reviewed?.media[0];
    expect(reviewedMedia?.assetStatus).toBe("review");
    if (!reviewedMedia) return;
    await repository.transitionMedia({
      assetId: reviewedMedia.assetId,
      expectedAssetVersion: reviewedMedia.assetRowVersion,
      toStatus: "live-approved",
      backupAcknowledged: true,
      reason: null,
    }, {
      actor,
      idempotencyKey: "admin-test-media-approve-0001",
    });
    publishable = await repository.getProduct(created.id) ?? publishable;
    for (const check of publishable.readiness) {
      publishable = await repository.setReadiness(
        created.id,
        check.code,
        "passed",
        `test://${check.code}`,
        {
          actor,
          expectedVersion: publishable.version,
          idempotencyKey: `admin-test-ready-${check.code}`,
        },
      );
    }

    const published = await repository.publishProduct(created.id, {
      actor,
      expectedVersion: publishable.version,
      idempotencyKey: "admin-test-publish-0001",
    });
    expect(published.status).toBe("published");
    expect(published.publishedAt).toBeTruthy();

    const archived = await repository.archiveProduct(created.id, {
      actor,
      expectedVersion: published.version,
      idempotencyKey: "admin-test-archive-0001",
    });
    expect(archived.status).toBe("archived");
    expect(await repository.getProduct(created.id)).toEqual(archived);
  });

  it("records inventory as a versioned movement", async () => {
    process.env.LIGNEE_MODE = "demo";
    const repository = getAdminRepository();
    const [item] = await repository.listInventory();
    expect(item).toBeDefined();
    if (!item) return;
    const updated = await repository.adjustInventory(item.skuId, 5, "receiving", {
      actor,
      expectedVersion: item.version,
      idempotencyKey: "admin-test-inventory-0001",
    });
    expect(updated.onHand).toBe(item.onHand + 5);
    expect(updated.version).toBe(item.version + 1);
  });

  it("runs the media asset state machine with asset-level optimistic locking", async () => {
    process.env.LIGNEE_MODE = "demo";
    const repository = getAdminRepository();
    const product = (await repository.listProducts()).find(
      (item) => item.media.some((link) => link.assetStatus === "review"),
    );
    const original = product?.media.find((link) => link.assetStatus === "review");
    expect(original).toBeDefined();
    if (!product || !original) return;

    const draft = await repository.transitionMedia({
      assetId: original.assetId,
      expectedAssetVersion: original.assetRowVersion,
      toStatus: "draft",
      backupAcknowledged: false,
      reason: "需要重新調整裁切焦點",
    }, {
      actor,
      idempotencyKey: "admin-test-media-state-draft",
    });
    expect(draft).toMatchObject({
      status: "draft",
      rowVersion: original.assetRowVersion + 1,
    });
    await expect(repository.transitionMedia({
      assetId: original.assetId,
      expectedAssetVersion: original.assetRowVersion,
      toStatus: "draft",
      backupAcknowledged: false,
      reason: "需要重新調整裁切焦點",
    }, {
      actor,
      idempotencyKey: "admin-test-media-state-draft",
    })).resolves.toMatchObject({
      status: "draft",
      rowVersion: draft.rowVersion,
      replayed: true,
    });

    await expect(repository.transitionMedia({
      assetId: original.assetId,
      expectedAssetVersion: original.assetRowVersion,
      toStatus: "review",
      backupAcknowledged: false,
      reason: null,
    }, {
      actor,
      idempotencyKey: "admin-test-media-state-stale",
    })).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });

    const review = await repository.transitionMedia({
      assetId: original.assetId,
      expectedAssetVersion: draft.rowVersion,
      toStatus: "review",
      backupAcknowledged: false,
      reason: null,
    }, {
      actor,
      idempotencyKey: "admin-test-media-state-review",
    });
    await expect(repository.transitionMedia({
      assetId: original.assetId,
      expectedAssetVersion: review.rowVersion,
      toStatus: "live-approved",
      backupAcknowledged: false,
      reason: null,
    }, {
      actor,
      idempotencyKey: "admin-test-media-state-no-backup",
    })).rejects.toMatchObject({ code: "MEDIA_BACKUP_ACK_REQUIRED" });

    const live = await repository.transitionMedia({
      assetId: original.assetId,
      expectedAssetVersion: review.rowVersion,
      toStatus: "live-approved",
      backupAcknowledged: true,
      reason: null,
    }, {
      actor,
      idempotencyKey: "admin-test-media-state-live",
    });
    const pending = await repository.transitionMedia({
      assetId: original.assetId,
      expectedAssetVersion: live.rowVersion,
      toStatus: "revocation-pending",
      backupAcknowledged: false,
      reason: "授權範圍需要再次確認",
    }, {
      actor,
      idempotencyKey: "admin-test-media-state-pending",
    });
    const restored = await repository.transitionMedia({
      assetId: original.assetId,
      expectedAssetVersion: pending.rowVersion,
      toStatus: "live-approved",
      backupAcknowledged: false,
      reason: "授權文件已完成重新確認",
    }, {
      actor,
      idempotencyKey: "admin-test-media-state-restore",
    });
    expect(restored.status).toBe("live-approved");
    expect(
      (await repository.getProduct(product.id))?.media.find(
        (link) => link.assetId === original.assetId,
      ),
    ).toMatchObject({
      assetStatus: "live-approved",
      assetRowVersion: restored.rowVersion,
    });
  });

  it("fails closed when production RPC bindings are unavailable", async () => {
    process.env.LIGNEE_MODE = "production-disabled";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    const repository = getAdminRepository();
    expect(repository.mode).toBe("rpc-unavailable");
    await expect(repository.listProducts()).rejects.toBeInstanceOf(AdminRepositoryError);
    await expect(repository.listProducts()).rejects.toMatchObject({
      code: "ADMIN_RPC_UNAVAILABLE",
      status: 503,
    });
  });

  it("selects the request-scoped RPC adapter only when both Auth bindings exist", () => {
    process.env.LIGNEE_MODE = "production-disabled";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_only";
    expect(getAdminRepository().mode).toBe("rpc");
  });
});

describe("admin input validation", () => {
  it("accepts a complete product and rejects unsafe slugs", () => {
    expect(adminProductInputSchema.parse(input)).toEqual(input);
    expect(() => adminProductInputSchema.parse({ ...input, slug: "../escape" })).toThrow();
  });

  it("requires a non-zero, integral inventory movement", () => {
    expect(inventoryMovementSchema.parse({
      skuId: "sku-1",
      delta: "4",
      reason: "receiving",
      expectedVersion: "1",
    }).delta).toBe(4);
    expect(() => inventoryMovementSchema.parse({
      skuId: "sku-1",
      delta: "0",
      reason: "receiving",
      expectedVersion: "1",
    })).toThrow();
  });

  it("validates SKU facts and same-origin media paths", () => {
    expect(adminVariantInputSchema.parse({
      publicId: "lig-000051-one-size",
      options: { size: "One Size" },
      weightGrams: 650,
      packageDimensionsMm: { length: 400, width: 300, height: 100 },
      factsStatus: "requires-approval",
      enabled: false,
    }).options).toEqual({ size: "One Size" });
    expect(adminMediaLinkInputSchema.parse({
      assetId: "11111111-1111-1111-1111-111111111111",
      role: "main",
      sortOrder: 1,
      alt: "商品主圖",
      focalX: 0.5,
      focalY: 0.5,
      picturedSkuId: null,
      publicPath: `/media/${"a".repeat(64)}/1200.webp`,
    }).role).toBe("main");
    expect(() => adminMediaLinkInputSchema.parse({
      assetId: "11111111-1111-1111-1111-111111111111",
      role: "main",
      sortOrder: 1,
      alt: "不安全路徑",
      focalX: 0.5,
      focalY: 0.5,
      picturedSkuId: null,
      publicPath: "https://third-party.example/image.jpg",
    })).toThrow();
  });

  it("never enables privileged invitations in Preview or demo", () => {
    const bindings = {
      NODE_ENV: "production",
      LIGNEE_MODE: "production-disabled",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_only",
      SUPABASE_SECRET_KEY: ["sb", "secret", "test", "only", "abcdefghijklmnop"].join("_"),
    };
    expect(isProductionStaffInviteEnvironment({
      ...bindings,
      VERCEL_ENV: "preview",
    })).toBe(false);
    expect(isProductionStaffInviteEnvironment({
      ...bindings,
      VERCEL_ENV: "production",
      LIGNEE_MODE: "demo",
    })).toBe(false);
    expect(isProductionStaffInviteEnvironment({
      ...bindings,
      VERCEL_ENV: "production",
    })).toBe(true);
  });
});

describe("admin media review policy", () => {
  it("exposes only valid role-aware transitions and marks high-risk actions", () => {
    expect(
      listAdminMediaTransitions("review", "merchandiser")
        .map((transition) => transition.toStatus),
    ).toEqual(["draft"]);
    expect(
      listAdminMediaTransitions("review", "owner")
        .map((transition) => transition.toStatus),
    ).toEqual(["draft", "live-approved"]);
    expect(
      getAdminMediaTransitionSpec("review", "live-approved"),
    ).toMatchObject({
      requiresRecentAal2: true,
      requiresBackupAcknowledgement: true,
    });
    expect(
      getAdminMediaTransitionSpec("revocation-pending", "revoked"),
    ).toMatchObject({
      requiresRecentAal2: true,
      requiresReason: true,
      destructive: true,
    });
    expect(getAdminMediaTransitionSpec("revoked", "review")).toBeNull();
  });
});

describe("admin RPC document mapping", () => {
  const productDocument = {
    id: "11111111-1111-1111-1111-111111111111",
    productCode: "LIG-000051",
    rowVersion: 4,
    launchPosition: 51,
    slug: "estate-field-coat",
    slugLockedAt: null,
    nameEn: "Estate Field Coat",
    nameZh: "莊園田野大衣",
    subtitleEn: "Estate Field Coat",
    subtitleZh: "莊園田野大衣",
    kind: "outerwear",
    categoryCode: "apparel",
    chapterCode: "first-light-in-the-field",
    audience: "unisex",
    description: "description",
    story: "story",
    sizing: "sizing",
    care: "care",
    materialConcepts: ["wool-direction"],
    optionAxes: [{
      key: "size",
      label: "尺寸",
      values: [{ value: "m", label: "M" }],
    }],
    launchGateCodes: ["physical-sample"],
    seoTitle: null,
    seoDescription: null,
    status: "review",
    sandboxPriceNotice: true,
    publishedAt: null,
    archivedAt: null,
    activePublicationId: null,
    createdAt: "2026-07-26T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    relatedProductIds: ["field-house-polo"],
    variants: [{
      id: "33333333-3333-3333-3333-333333333333",
      publicId: "estate-field-coat-m",
      rowVersion: 2,
      skuCode: "LIG-000051-01",
      options: { size: "M" },
      weightGrams: 850,
      packageDimensionsMm: { length: 500, width: 360, height: 120 },
      factsStatus: "approved",
      enabled: true,
      archivedAt: null,
      inventory: {
        rowVersion: 3,
        onHand: 9,
        reserved: 2,
        safetyStock: 1,
        sellable: 6,
        updatedAt: "2026-07-27T00:00:00.000Z",
      },
      prices: [{
        id: "44444444-4444-4444-4444-444444444444",
        version: 1,
        grossTwd: 26800,
        taxIncluded: true,
        status: "sandbox-draft",
        validFrom: null,
        validUntil: null,
        createdAt: "2026-07-27T00:00:00.000Z",
      }],
    }],
    media: [{
      id: "55555555-5555-5555-5555-555555555555",
      rowVersion: 2,
      assetId: "22222222-2222-2222-2222-222222222222",
      assetRowVersion: 7,
      sha256: "a".repeat(64),
      assetStatus: "revocation-pending",
      role: "main",
      sortOrder: 1,
      alt: "莊園田野大衣主圖",
      focalX: 0.5,
      focalY: 0.5,
      picturedSkuId: null,
      publicPath: `/media/${"a".repeat(64)}/1200.webp`,
      manifest: {},
    }],
    readiness: [],
    publications: [],
  } as const;

  it("maps product, inventory and masked order projections", () => {
    const product = mapRpcAdminProduct(productDocument);
    expect(product).toMatchObject({
      productCode: "LIG-000051",
      status: "review",
      version: 4,
      basePriceTwd: 26800,
      skuCount: 1,
      imagePath: `/media/${"a".repeat(64)}/1200.webp`,
    });
    expect(product.variants).toHaveLength(1);
    expect(product.media).toHaveLength(1);
    expect(product.media[0]).toMatchObject({
      assetRowVersion: 7,
      assetStatus: "revocation-pending",
    });
    expect(product.readiness).toEqual([]);

    expect(mapRpcInventory({
      variantId: "sku-1",
      publicId: "estate-field-coat-m",
      skuCode: "LIG-000051-01",
      productId: "11111111-1111-1111-1111-111111111111",
      productCode: "LIG-000051",
      nameEn: "Estate Field Coat",
      nameZh: "莊園田野大衣",
      onHand: 9,
      reserved: 2,
      safetyStock: 1,
      sellable: 6,
      rowVersion: 3,
      updatedAt: "2026-07-27T00:00:00.000Z",
    })).toMatchObject({ skuId: "sku-1", available: 6, version: 3 });

    expect(mapRpcOrder({
      id: "order-1",
      orderNumber: "LIG-20260727-1005",
      customerName: "測試顧客",
      customerEmailMasked: "t***@example.com",
      status: "paid",
      paymentStatus: "paid",
      fulfillmentStatus: "unfulfilled",
      grandTotalTwd: 26800,
      itemCount: 1,
      createdAt: "2026-07-27T00:00:00.000Z",
    })).toMatchObject({
      orderNumber: "LIG-20260727-1005",
      customerEmailMasked: "t***@example.com",
      totalTwd: 26800,
    });
  });

  it("rejects malformed product and catalog documents instead of inventing defaults", () => {
    expect(() => mapRpcAdminProduct({
      ...productDocument,
      status: "unknown",
    })).toThrow(expect.objectContaining({
      code: "ADMIN_RPC_INVALID_PRODUCT_RESPONSE",
      status: 502,
    }));
    expect(() => mapRpcAdminProduct({
      ...productDocument,
      id: "",
    })).toThrow(expect.objectContaining({
      code: "ADMIN_RPC_INVALID_PRODUCT_RESPONSE",
      status: 502,
    }));
    expect(() => mapRpcAdminProduct({
      ...productDocument,
      updatedAt: "not-a-date",
    })).toThrow(expect.objectContaining({
      code: "ADMIN_RPC_INVALID_PRODUCT_RESPONSE",
      status: 502,
    }));
    expect(() => mapRpcCatalogList({
      items: [{
        id: "11111111-1111-1111-1111-111111111111",
        productCode: "LIG-000051",
        slug: "estate-field-coat",
        nameEn: "Estate Field Coat",
        nameZh: "莊園田野大衣",
        status: "review",
        rowVersion: 4,
        launchPosition: 51,
        categoryCode: "apparel",
        chapterCode: "first-light-in-the-field",
        updatedAt: "yesterday",
        publishedAt: null,
      }],
      total: 1,
      limit: 200,
      offset: 0,
    })).toThrow(expect.objectContaining({
      code: "ADMIN_RPC_INVALID_CATALOG_RESPONSE",
      status: 502,
    }));
  });

  it("rejects malformed dashboard, inventory, order and media transition responses", () => {
    expect(() => mapRpcDashboard({
      productCount: 1,
      publishedProductCount: 0,
      draftProductCount: 1,
      lowStockSkuCount: 0,
      orderCount: 0,
      openOrderCount: 0,
      revenueTwd: 0,
      pendingReadinessCount: 1,
      recentOrders: [],
      recentProducts: [],
      unexpected: true,
    })).toThrow(expect.objectContaining({
      code: "ADMIN_RPC_INVALID_DASHBOARD_RESPONSE",
      status: 502,
    }));
    expect(() => mapRpcInventory({
      variantId: "",
      publicId: "estate-field-coat-m",
      skuCode: "LIG-000051-01",
      productId: "11111111-1111-1111-1111-111111111111",
      productCode: "LIG-000051",
      nameEn: "Estate Field Coat",
      nameZh: "莊園田野大衣",
      onHand: 9,
      reserved: 2,
      safetyStock: 1,
      sellable: 6,
      rowVersion: 3,
      updatedAt: "2026-07-27T00:00:00.000Z",
    })).toThrow(expect.objectContaining({
      code: "ADMIN_RPC_INVALID_INVENTORY_RESPONSE",
      status: 502,
    }));
    expect(() => mapRpcOrder({
      id: "order-1",
      publicId: "LIG-20260727-1005",
      status: "invented-status",
      paymentStatus: "paid",
      fulfillmentStatus: "unfulfilled",
      totalTwd: 26800,
      itemCount: 1,
      createdAt: "2026-07-27T00:00:00.000Z",
    })).toThrow(expect.objectContaining({
      code: "ADMIN_RPC_INVALID_ORDER_RESPONSE",
      status: 502,
    }));
    expect(() => mapRpcMediaTransition({
      mediaAssetId: "22222222-2222-2222-2222-222222222222",
      sha256: "a".repeat(64),
      status: "invented-status",
      rowVersion: 2,
      backupAcknowledgedAt: null,
      mediaSafetyRevision: 1,
      replayed: false,
    })).toThrow(expect.objectContaining({
      code: "ADMIN_RPC_INVALID_MEDIA_TRANSITION_RESPONSE",
      status: 502,
    }));
  });
});
