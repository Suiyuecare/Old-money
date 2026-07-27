import { randomUUID } from "node:crypto";

import { categoryMetadata, collections, products, skus } from "@/lib/catalog";
import { getCommerceEnvironment } from "@/lib/commerce/config";

import { AdminRepositoryError } from "./errors";
import { getAdminMediaTransitionSpec } from "./media-review";
import { createRpcAdminRepository } from "./rpc-repository";
import type {
  AdminDashboard,
  AdminMediaLinkInput,
  AdminMediaTransition,
  AdminMediaTransitionInput,
  AdminMutationContext,
  AdminOrderProjection,
  AdminPriceInput,
  AdminProductDraft,
  AdminProductInput,
  AdminReadinessCheck,
  AdminRepository,
  AdminVariantInput,
  InventoryMovementReason,
  InventorySummary,
  OperationalRow,
} from "./types";

export { AdminRepositoryError } from "./errors";

interface DemoState {
  readonly products: Map<string, AdminProductDraft>;
  readonly inventory: Map<string, InventorySummary>;
  readonly idempotency: Map<string, string>;
  readonly orders: readonly AdminOrderProjection[];
}

const demoStateKey = Symbol.for("lignee.admin.demo-state");
type DemoGlobal = typeof globalThis & { [demoStateKey]?: DemoState };

const now = () => new Date().toISOString();
const readinessCodes = [
  "physical_sample",
  "supplier",
  "cost_margin_tax_price",
  "materials_origin_manufacture",
  "measurements_capacity_weight",
  "care_warning",
  "sku",
  "packaging",
  "sellable_inventory",
  "accurate_photography",
  "shipping_returns",
  "warranty_care_repair",
  "legal",
  "trademark",
] as const;

function createSeedOrders(): readonly AdminOrderProjection[] {
  return [
    {
      id: "demo-order-id-000001",
      orderNumber: "LIG-20260727-1001",
      customerName: "陳女士",
      customerEmailMasked: "c***@example.com",
      status: "processing",
      paymentStatus: "paid",
      fulfillmentStatus: "picking",
      totalTwd: 9800,
      itemCount: 1,
      createdAt: "2026-07-27T01:45:00.000Z",
    },
    {
      id: "demo-order-id-000002",
      orderNumber: "LIG-20260727-1002",
      customerName: "林先生",
      customerEmailMasked: "l***@example.com",
      status: "awaiting_payment",
      paymentStatus: "pending",
      fulfillmentStatus: "unfulfilled",
      totalTwd: 18600,
      itemCount: 1,
      createdAt: "2026-07-26T08:20:00.000Z",
    },
    {
      id: "demo-order-id-000003",
      orderNumber: "LIG-20260727-1003",
      customerName: "王女士",
      customerEmailMasked: "w***@example.com",
      status: "delivered",
      paymentStatus: "paid",
      fulfillmentStatus: "delivered",
      totalTwd: 26400,
      itemCount: 2,
      createdAt: "2026-07-25T03:10:00.000Z",
    },
  ];
}

function createDemoState(): DemoState {
  const productMap = new Map<string, AdminProductDraft>();
  for (const product of products) {
    const published = product.launchPosition <= 8;
    const productSkus = skus.filter((sku) => sku.productId === product.id);
    productMap.set(product.id, {
      id: product.id,
      productCode: product.productCode,
      slug: product.slug,
      name: product.name,
      subtitle: product.subtitle,
      category: product.category,
      audience: product.audience,
      collectionId: product.collectionId,
      kind: product.kind,
      description: product.description,
      story: product.story,
      sizing: product.sizing,
      care: product.care,
      materialConcepts: product.materialConcepts,
      optionAxes: product.optionAxes,
      launchGateCodes: product.launchGateCodes,
      relatedProductIds: product.relatedProductIds,
      seoTitle: `${product.name}｜LIGNÉE`,
      seoDescription: product.description,
      basePriceTwd: product.basePriceTwd,
      imagePath: product.image.path,
      status: published ? "published" : "ready",
      version: 1,
      updatedAt: "2026-07-27T00:00:00.000Z",
      publishedAt: published ? "2026-07-24T00:00:00.000Z" : null,
      skuCount: productSkus.length,
      variants: productSkus.map((sku) => ({
        id: sku.id,
        publicId: sku.id,
        rowVersion: 1,
        skuCode: sku.skuCode,
        options: Object.fromEntries(
          Object.entries(sku.options).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        ),
        weightGrams: null,
        packageDimensionsMm: null,
        factsStatus: published ? "approved" : "requires-approval",
        enabled: published,
        archivedAt: null,
        inventory: null,
        prices: [{
          id: `${sku.id}-price-1`,
          version: 1,
          grossTwd: sku.priceTwd ?? product.basePriceTwd,
          status: published ? "approved" : "sandbox-draft",
          validFrom: published ? "2026-07-24T00:00:00.000Z" : null,
          validUntil: null,
          createdAt: "2026-07-24T00:00:00.000Z",
        }],
      })),
      media: [{
        id: `${product.id}-main-link`,
        rowVersion: 1,
        assetId: product.image.assetId,
        assetRowVersion: 1,
        sha256: "",
        assetStatus: published ? "live-approved" : "review",
        role: "main",
        sortOrder: 1,
        alt: product.image.alt,
        focalX: 0.5,
        focalY: 0.5,
        picturedSkuId: product.image.picturedSkuId,
        publicPath: product.image.path,
      }],
      readiness: readinessCodes.map((code) => ({
        code,
        state: published ? "passed" : "pending",
        evidenceReference: published ? "demo://estate-no-01" : null,
        approvedBy: published ? "demo-owner" : null,
        approvedAt: published ? "2026-07-24T00:00:00.000Z" : null,
      })),
    });
  }

  const inventoryMap = new Map<string, InventorySummary>();
  for (const [index, sku] of skus.entries()) {
    const product = productMap.get(sku.productId);
    const onHand = index % 9;
    const reserved = Math.min(index % 3, onHand);
    const safetyStock = 2;
    inventoryMap.set(sku.id, {
      skuId: sku.id,
      skuCode: sku.skuCode,
      productId: sku.productId,
      productName: product?.name ?? sku.productId,
      optionLabel: Object.values(sku.options).join(" · ") || "單一規格",
      onHand,
      reserved,
      safetyStock,
      available: Math.max(0, onHand - reserved - safetyStock),
      version: 1,
      updatedAt: "2026-07-27T00:00:00.000Z",
    });
  }

  return {
    products: productMap,
    inventory: inventoryMap,
    idempotency: new Map(),
    orders: createSeedOrders(),
  };
}

function getDemoState(): DemoState {
  const globalObject = globalThis as DemoGlobal;
  globalObject[demoStateKey] ??= createDemoState();
  return globalObject[demoStateKey];
}

function isIdempotentReplay(
  state: DemoState,
  context: AdminMutationContext,
  fingerprint: string,
): boolean {
  const existing = state.idempotency.get(context.idempotencyKey);
  if (existing && existing !== fingerprint) {
    throw new AdminRepositoryError(
      "IDEMPOTENCY_CONFLICT",
      "這組操作識別碼已用於不同內容，請重新整理後再試。",
      409,
    );
  }
  return existing === fingerprint;
}

function recordIdempotency(
  state: DemoState,
  context: AdminMutationContext,
  fingerprint: string,
): void {
  state.idempotency.set(context.idempotencyKey, fingerprint);
}

function assertVersion(current: number, expected?: number) {
  if (expected !== undefined && current !== expected) {
    throw new AdminRepositoryError(
      "VERSION_CONFLICT",
      "商品已被另一個工作階段更新，請重新整理後再編輯。",
      409,
    );
  }
}

function nextProductCode(state: DemoState): string {
  const highest = [...state.products.values()].reduce((maximum, product) => {
    const match = product.productCode.match(/(\d+)$/);
    return Math.max(maximum, match ? Number(match[1]) : 0);
  }, 50);
  return `LIG-${String(highest + 1).padStart(6, "0")}`;
}

class DemoAdminRepository implements AdminRepository {
  readonly mode = "demo" as const;

  async getDashboard(): Promise<AdminDashboard> {
    const state = getDemoState();
    const productList = [...state.products.values()];
    const inventoryList = [...state.inventory.values()];
    const orders = state.orders;
    return {
      productCount: productList.length,
      publishedProductCount: productList.filter((product) => product.status === "published").length,
      draftProductCount: productList.filter((product) => product.status !== "published").length,
      lowStockSkuCount: inventoryList.filter((item) => item.available <= 1).length,
      orderCount: orders.length,
      openOrderCount: orders.filter((order) =>
        ["awaiting_payment", "paid", "processing"].includes(order.status),
      ).length,
      revenueTwd: orders
        .filter((order) => order.paymentStatus === "paid")
        .reduce((sum, order) => sum + order.totalTwd, 0),
      pendingReadinessCount: productList.filter((product) => product.status !== "published").length,
      recentOrders: orders.slice(0, 4),
      recentProducts: productList.slice(-5).reverse(),
    };
  }

  async listProducts(query = ""): Promise<readonly AdminProductDraft[]> {
    const normalized = query.trim().toLocaleLowerCase("zh-Hant");
    return [...getDemoState().products.values()]
      .filter((product) =>
        !normalized ||
        [product.name, product.subtitle, product.productCode, product.slug]
          .join(" ")
          .toLocaleLowerCase("zh-Hant")
          .includes(normalized),
      )
      .sort((left, right) => left.productCode.localeCompare(right.productCode));
  }

  async getProduct(id: string): Promise<AdminProductDraft | null> {
    return getDemoState().products.get(id) ?? null;
  }

  async createProduct(
    input: AdminProductInput,
    context: AdminMutationContext,
  ): Promise<AdminProductDraft> {
    const state = getDemoState();
    const fingerprint = JSON.stringify(["create", input]);
    const replay = isIdempotentReplay(state, context, fingerprint);
    const existing = state.products.get(input.slug);
    if (replay && existing) return existing;
    if ([...state.products.values()].some((product) => product.slug === input.slug)) {
      throw new AdminRepositoryError("SLUG_CONFLICT", "此網址代稱已被使用。", 409);
    }
    const id = input.slug;
    const product: AdminProductDraft = {
      ...input,
      id,
      productCode: nextProductCode(state),
      imagePath: null,
      status: "draft",
      basePriceTwd: 0,
      version: 1,
      updatedAt: now(),
      publishedAt: null,
      skuCount: 0,
      variants: [],
      media: [],
      readiness: readinessCodes.map((code) => ({
        code,
        state: "pending",
        evidenceReference: null,
        approvedBy: null,
        approvedAt: null,
      })),
    };
    recordIdempotency(state, context, fingerprint);
    state.products.set(product.id, product);
    return product;
  }

  async updateProduct(
    id: string,
    input: AdminProductInput,
    context: AdminMutationContext,
  ): Promise<AdminProductDraft> {
    const state = getDemoState();
    const current = state.products.get(id);
    if (!current) throw new AdminRepositoryError("NOT_FOUND", "找不到商品。", 404);
    const fingerprint = JSON.stringify(["update", id, input, context.expectedVersion]);
    const replay = isIdempotentReplay(
      state,
      context,
      fingerprint,
    );
    if (replay) return current;
    assertVersion(current.version, context.expectedVersion);
    if (current.status === "published" && current.slug !== input.slug) {
      throw new AdminRepositoryError("SLUG_LOCKED", "商品發布後不可變更網址代稱。", 409);
    }
    const updated: AdminProductDraft = {
      ...current,
      ...input,
      version: current.version + 1,
      updatedAt: now(),
    };
    recordIdempotency(state, context, fingerprint);
    state.products.set(id, updated);
    return updated;
  }

  async publishProduct(
    id: string,
    context: AdminMutationContext,
  ): Promise<AdminProductDraft> {
    const state = getDemoState();
    const current = state.products.get(id);
    if (!current) throw new AdminRepositoryError("NOT_FOUND", "找不到商品。", 404);
    const fingerprint = JSON.stringify(["publish", id, context.expectedVersion]);
    const replay = isIdempotentReplay(
      state,
      context,
      fingerprint,
    );
    if (replay) return current;
    assertVersion(current.version, context.expectedVersion);
    if (current.readiness.some((item) => item.state !== "passed")) {
      throw new AdminRepositoryError(
        "PRODUCT_READINESS_INCOMPLETE",
        "商品 readiness 尚未全部通過。",
        422,
      );
    }
    const enabledVariants = current.variants.filter(
      (variant) => variant.enabled && !variant.archivedAt,
    );
    if (!enabledVariants.length) {
      throw new AdminRepositoryError(
        "NO_ENABLED_VARIANTS",
        "商品至少需要一個已啟用的 SKU。",
        422,
      );
    }
    if (enabledVariants.some((variant) => variant.factsStatus !== "approved")) {
      throw new AdminRepositoryError(
        "VARIANT_FACTS_UNAPPROVED",
        "SKU 商品事實尚未核准。",
        422,
      );
    }
    const timestamp = Date.now();
    const hasActivePrice = (variant: (typeof enabledVariants)[number]) =>
      variant.prices.some((price) =>
        price.status === "approved"
        && Boolean(price.validFrom)
        && new Date(price.validFrom ?? 0).getTime() <= timestamp
        && (!price.validUntil || new Date(price.validUntil).getTime() > timestamp),
      );
    if (enabledVariants.some((variant) => !hasActivePrice(variant))) {
      throw new AdminRepositoryError(
        "ACTIVE_APPROVED_PRICE_REQUIRED",
        "每個啟用 SKU 都需要有效的核准價格。",
        422,
      );
    }
    if (
      enabledVariants.some((variant) => (state.inventory.get(variant.id)?.available ?? 0) < 1)
    ) {
      throw new AdminRepositoryError(
        "SELLABLE_INVENTORY_REQUIRED",
        "每個啟用 SKU 都需要可售庫存。",
        422,
      );
    }
    if (!current.media.some((media) => media.role === "main" && media.assetStatus === "live-approved")) {
      throw new AdminRepositoryError(
        "APPROVED_MAIN_MEDIA_REQUIRED",
        "商品需要完成核准的主圖。",
        422,
      );
    }
    const published: AdminProductDraft = {
      ...current,
      status: "published",
      publishedAt: now(),
      updatedAt: now(),
      version: current.version + 1,
    };
    recordIdempotency(state, context, fingerprint);
    state.products.set(id, published);
    return published;
  }

  async archiveProduct(
    id: string,
    context: AdminMutationContext,
  ): Promise<AdminProductDraft> {
    const state = getDemoState();
    const current = state.products.get(id);
    if (!current) throw new AdminRepositoryError("NOT_FOUND", "找不到商品。", 404);
    const fingerprint = JSON.stringify(["archive", id, context.expectedVersion]);
    const replay = isIdempotentReplay(
      state,
      context,
      fingerprint,
    );
    if (replay) return current;
    assertVersion(current.version, context.expectedVersion);
    const archived = {
      ...current,
      status: "archived" as const,
      updatedAt: now(),
      version: current.version + 1,
    };
    recordIdempotency(state, context, fingerprint);
    state.products.set(id, archived);
    return archived;
  }

  async upsertVariant(
    productId: string,
    input: AdminVariantInput,
    context: AdminMutationContext,
  ): Promise<AdminProductDraft> {
    const state = getDemoState();
    const current = state.products.get(productId);
    if (!current) throw new AdminRepositoryError("NOT_FOUND", "找不到商品。", 404);
    const fingerprint = JSON.stringify([
      "variant.upsert",
      productId,
      input,
      context.expectedVersion,
    ]);
    if (isIdempotentReplay(state, context, fingerprint)) return current;
    assertVersion(current.version, context.expectedVersion);

    const existingIndex = input.variantId
      ? current.variants.findIndex((variant) => variant.id === input.variantId)
      : -1;
    const existing = existingIndex >= 0 ? current.variants[existingIndex] : null;
    if (input.variantId && !existing) {
      throw new AdminRepositoryError("VARIANT_NOT_FOUND", "找不到 SKU。", 404);
    }
    if (existing) assertVersion(existing.rowVersion, input.expectedVariantVersion);
    if (
      [...state.products.values()].some((product) =>
        product.variants.some((variant) =>
          variant.publicId === input.publicId && variant.id !== existing?.id,
        ),
      )
    ) {
      throw new AdminRepositoryError("VARIANT_PUBLIC_ID_CONFLICT", "SKU public ID 已被使用。", 409);
    }

    const id = existing?.id ?? randomUUID();
    const skuCode = existing?.skuCode
      ?? input.skuCode
      ?? `${current.productCode}-${String(current.variants.length + 1).padStart(2, "0")}`;
    const previousInventory = state.inventory.get(id) ?? null;
    const optionLabel = Object.values(input.options).join(" · ") || "單一規格";
    const inventory: InventorySummary = previousInventory
      ? {
          ...previousInventory,
          productName: current.name,
          optionLabel,
          updatedAt: now(),
        }
      : {
          skuId: id,
          skuCode,
          productId,
          productName: current.name,
          optionLabel,
          onHand: 0,
          reserved: 0,
          safetyStock: 0,
          available: 0,
          version: 1,
          updatedAt: now(),
        };
    state.inventory.set(id, inventory);

    const variant = {
      id,
      publicId: input.publicId,
      rowVersion: (existing?.rowVersion ?? 0) + 1,
      skuCode,
      options: input.options,
      weightGrams: input.weightGrams,
      packageDimensionsMm: input.packageDimensionsMm,
      factsStatus: input.factsStatus,
      enabled: input.enabled,
      archivedAt: existing?.archivedAt ?? null,
      inventory,
      prices: existing?.prices ?? [],
    } as const;
    const variants = [...current.variants];
    if (existingIndex >= 0) variants[existingIndex] = variant;
    else variants.push(variant);
    const updated: AdminProductDraft = {
      ...current,
      variants,
      skuCount: variants.length,
      version: current.version + 1,
      updatedAt: now(),
    };
    recordIdempotency(state, context, fingerprint);
    state.products.set(productId, updated);
    return updated;
  }

  async addPrice(
    input: AdminPriceInput,
    context: AdminMutationContext,
  ): Promise<AdminProductDraft> {
    const state = getDemoState();
    const product = [...state.products.values()].find((candidate) =>
      candidate.variants.some((variant) => variant.id === input.variantId),
    );
    if (!product) throw new AdminRepositoryError("VARIANT_NOT_FOUND", "找不到 SKU。", 404);
    const fingerprint = JSON.stringify(["price.add", input, context.expectedVersion]);
    if (isIdempotentReplay(state, context, fingerprint)) return product;
    assertVersion(product.version, context.expectedVersion);
    const variant = product.variants.find((candidate) => candidate.id === input.variantId);
    if (!variant) throw new AdminRepositoryError("VARIANT_NOT_FOUND", "找不到 SKU。", 404);
    assertVersion(variant.rowVersion, input.expectedVariantVersion);
    if (input.status === "approved" && !input.validFrom) {
      throw new AdminRepositoryError(
        "APPROVED_PRICE_START_REQUIRED",
        "核准價格必須設定生效時間。",
        422,
      );
    }
    if (
      input.validFrom
      && input.validUntil
      && new Date(input.validUntil).getTime() <= new Date(input.validFrom).getTime()
    ) {
      throw new AdminRepositoryError("INVALID_PRICE_WINDOW", "價格結束時間必須晚於開始時間。", 422);
    }
    const price = {
      id: randomUUID(),
      version: variant.prices.reduce((maximum, item) => Math.max(maximum, item.version), 0) + 1,
      grossTwd: input.grossTwd,
      status: input.status,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      createdAt: now(),
    } as const;
    const updatedVariant = {
      ...variant,
      rowVersion: variant.rowVersion + 1,
      prices: [...variant.prices, price],
    };
    const variants = product.variants.map((candidate) =>
      candidate.id === variant.id ? updatedVariant : candidate,
    );
    const updated: AdminProductDraft = {
      ...product,
      variants,
      basePriceTwd: input.grossTwd,
      version: product.version + 1,
      updatedAt: now(),
    };
    recordIdempotency(state, context, fingerprint);
    state.products.set(product.id, updated);
    return updated;
  }

  async setReadiness(
    productId: string,
    code: string,
    readinessState: AdminReadinessCheck["state"],
    evidenceReference: string | null,
    context: AdminMutationContext,
  ): Promise<AdminProductDraft> {
    const state = getDemoState();
    const current = state.products.get(productId);
    if (!current) throw new AdminRepositoryError("NOT_FOUND", "找不到商品。", 404);
    const fingerprint = JSON.stringify([
      "readiness.set",
      productId,
      code,
      readinessState,
      evidenceReference,
      context.expectedVersion,
    ]);
    if (isIdempotentReplay(state, context, fingerprint)) return current;
    assertVersion(current.version, context.expectedVersion);
    if (!current.readiness.some((item) => item.code === code)) {
      throw new AdminRepositoryError("READINESS_CODE_UNKNOWN", "找不到發布檢查項目。", 404);
    }
    const updated: AdminProductDraft = {
      ...current,
      readiness: current.readiness.map((item) =>
        item.code === code
          ? {
              ...item,
              state: readinessState,
              evidenceReference,
              approvedBy: readinessState === "passed" ? context.actor.userId : null,
              approvedAt: readinessState === "passed" ? now() : null,
            }
          : item,
      ),
      version: current.version + 1,
      updatedAt: now(),
    };
    recordIdempotency(state, context, fingerprint);
    state.products.set(productId, updated);
    return updated;
  }

  async linkMedia(
    productId: string,
    input: AdminMediaLinkInput,
    context: AdminMutationContext,
  ): Promise<AdminProductDraft> {
    const state = getDemoState();
    const current = state.products.get(productId);
    if (!current) throw new AdminRepositoryError("NOT_FOUND", "找不到商品。", 404);
    const fingerprint = JSON.stringify([
      "media.link",
      productId,
      input,
      context.expectedVersion,
    ]);
    if (isIdempotentReplay(state, context, fingerprint)) return current;
    assertVersion(current.version, context.expectedVersion);
    const existingIndex = input.linkId
      ? current.media.findIndex((link) => link.id === input.linkId)
      : -1;
    const existing = existingIndex >= 0 ? current.media[existingIndex] : null;
    if (input.linkId && !existing) {
      throw new AdminRepositoryError("MEDIA_LINK_NOT_FOUND", "找不到商品圖片連結。", 404);
    }
    if (existing) assertVersion(existing.rowVersion, input.expectedLinkVersion);
    const sha = input.publicPath.match(/^\/media\/([a-f0-9]{64})\//)?.[1] ?? "";
    const knownAsset = [...state.products.values()]
      .flatMap((product) => product.media)
      .find((media) => media.assetId === input.assetId);
    const link = {
      id: existing?.id ?? randomUUID(),
      rowVersion: (existing?.rowVersion ?? 0) + 1,
      assetId: input.assetId,
      assetRowVersion: knownAsset?.assetRowVersion ?? 1,
      sha256: sha,
      assetStatus: knownAsset?.assetStatus ?? "draft" as const,
      role: input.role,
      sortOrder: input.sortOrder,
      alt: input.alt,
      focalX: input.focalX,
      focalY: input.focalY,
      picturedSkuId: input.picturedSkuId,
      publicPath: input.publicPath,
    };
    const media = [...current.media];
    if (existingIndex >= 0) media[existingIndex] = link;
    else media.push(link);
    media.sort((left, right) => left.sortOrder - right.sortOrder);
    const updated: AdminProductDraft = {
      ...current,
      media,
      imagePath: media.find((item) => item.role === "main")?.publicPath ?? current.imagePath,
      version: current.version + 1,
      updatedAt: now(),
    };
    recordIdempotency(state, context, fingerprint);
    state.products.set(productId, updated);
    return updated;
  }

  async transitionMedia(
    input: AdminMediaTransitionInput,
    context: AdminMutationContext,
  ): Promise<AdminMediaTransition> {
    const state = getDemoState();
    const fingerprint = JSON.stringify([
      "media.transition",
      input,
    ]);
    const currentLink = [...state.products.values()]
      .flatMap((product) => product.media)
      .find((link) => link.assetId === input.assetId);
    if (!currentLink) {
      throw new AdminRepositoryError(
        "MEDIA_ASSET_NOT_FOUND",
        "找不到媒體資產。",
        404,
      );
    }
    if (isIdempotentReplay(state, context, fingerprint)) {
      return {
        assetId: currentLink.assetId,
        sha256: currentLink.sha256,
        status: currentLink.assetStatus,
        rowVersion: currentLink.assetRowVersion,
        backupAcknowledgedAt: currentLink.assetStatus === "live-approved"
          ? now()
          : null,
        mediaSafetyRevision: 1,
        replayed: true,
      };
    }
    assertVersion(currentLink.assetRowVersion, input.expectedAssetVersion);
    const transition = getAdminMediaTransitionSpec(
      currentLink.assetStatus,
      input.toStatus,
    );
    if (!transition) {
      throw new AdminRepositoryError(
        "INVALID_MEDIA_STATE_TRANSITION",
        "圖片狀態已改變，請重新整理後再操作。",
        409,
      );
    }
    if (
      transition.requiresBackupAcknowledgement &&
      !input.backupAcknowledged
    ) {
      throw new AdminRepositoryError(
        "MEDIA_BACKUP_ACK_REQUIRED",
        "核准圖片前必須確認私有原圖與衍生圖已完成備份。",
        422,
      );
    }
    if (
      transition.requiresReason &&
      (!input.reason || input.reason.trim().length < 8)
    ) {
      throw new AdminRepositoryError(
        "MEDIA_REASON_REQUIRED",
        "請填寫至少 8 個字元的狀態變更原因。",
        422,
      );
    }

    const nextVersion = currentLink.assetRowVersion + 1;
    for (const [productId, product] of state.products) {
      if (!product.media.some((link) => link.assetId === input.assetId)) continue;
      state.products.set(productId, {
        ...product,
        media: product.media.map((link) =>
          link.assetId === input.assetId
            ? {
                ...link,
                assetStatus: input.toStatus,
                assetRowVersion: nextVersion,
              }
            : link,
        ),
        updatedAt: now(),
      });
    }
    recordIdempotency(state, context, fingerprint);
    return {
      assetId: input.assetId,
      sha256: currentLink.sha256,
      status: input.toStatus,
      rowVersion: nextVersion,
      backupAcknowledgedAt: input.toStatus === "live-approved" ? now() : null,
      mediaSafetyRevision: input.toStatus === "revocation-pending" ? 2 : 1,
      replayed: false,
    };
  }

  async listInventory(query = ""): Promise<readonly InventorySummary[]> {
    const normalized = query.trim().toLocaleLowerCase("zh-Hant");
    return [...getDemoState().inventory.values()]
      .filter((item) =>
        !normalized ||
        `${item.skuCode} ${item.productName} ${item.optionLabel}`
          .toLocaleLowerCase("zh-Hant")
          .includes(normalized),
      )
      .sort((left, right) => left.skuCode.localeCompare(right.skuCode));
  }

  async adjustInventory(
    skuId: string,
    delta: number,
    reason: InventoryMovementReason,
    context: AdminMutationContext,
  ): Promise<InventorySummary> {
    const state = getDemoState();
    const current = state.inventory.get(skuId);
    if (!current) throw new AdminRepositoryError("NOT_FOUND", "找不到 SKU。", 404);
    const fingerprint = JSON.stringify([
      "inventory",
      skuId,
      delta,
      reason,
      context.expectedVersion,
    ]);
    const replay = isIdempotentReplay(
      state,
      context,
      fingerprint,
    );
    if (replay) return current;
    assertVersion(current.version, context.expectedVersion);
    if (!Number.isInteger(delta) || current.onHand + delta < 0) {
      throw new AdminRepositoryError("INVALID_MOVEMENT", "庫存異動會使現貨低於零。", 422);
    }
    const updated: InventorySummary = {
      ...current,
      onHand: current.onHand + delta,
      available: Math.max(0, current.onHand + delta - current.reserved - current.safetyStock),
      version: current.version + 1,
      updatedAt: now(),
    };
    recordIdempotency(state, context, fingerprint);
    state.inventory.set(skuId, updated);
    const product = state.products.get(updated.productId);
    if (product) {
      state.products.set(product.id, {
        ...product,
        variants: product.variants.map((variant) =>
          variant.id === skuId ? { ...variant, inventory: updated } : variant,
        ),
      });
    }
    return updated;
  }

  async listOrders(): Promise<readonly AdminOrderProjection[]> {
    return getDemoState().orders;
  }

  async listOperationalRows(section: string): Promise<readonly OperationalRow[]> {
    const common: Record<string, readonly OperationalRow[]> = {
      categories: categoryMetadata.map((category) => ({
        id: category.id,
        primary: category.label,
        secondary: category.englishLabel,
        status: "啟用",
        updatedAt: "2026-07-27T00:00:00.000Z",
      })),
      collections: collections.map((collection) => ({
        id: collection.id,
        primary: collection.name,
        secondary: collection.subtitle,
        status: "Estate No. 01",
        updatedAt: "2026-07-27T00:00:00.000Z",
      })),
      fulfillment: [
        { id: "pick-1004", primary: "LIG-20260727-1004", secondary: "3 件商品 · 待揀貨", status: "揀貨中", updatedAt: "2026-07-27T02:10:00.000Z" },
      ],
      returns: [
        { id: "ret-1001", primary: "RET-20260724-01", secondary: "LIG-20260724-1001 · 等待驗收", status: "待驗收", updatedAt: "2026-07-27T02:00:00.000Z" },
      ],
      refunds: [
        { id: "refund-1001", primary: "RF-20260724-01", secondary: "NT$ 9,800 · 綠界 Sandbox", status: "已完成", updatedAt: "2026-07-27T02:30:00.000Z" },
      ],
      payments: [
        { id: "pay-1004", primary: "LIG-20260727-1004", secondary: "NT$ 32,600 · hosted card", status: "已付款", updatedAt: "2026-07-27T01:46:00.000Z" },
      ],
      invoices: [
        { id: "inv-1003", primary: "Sandbox 發票 QB00001003", secondary: "LIG-20260726-1003", status: "已開立", updatedAt: "2026-07-26T08:25:00.000Z" },
      ],
      support: [
        { id: "case-001", primary: "CASE-20260727-001", secondary: "尺寸諮詢 · c***@example.com", status: "待回覆", updatedAt: "2026-07-27T03:05:00.000Z" },
      ],
      appointments: [
        { id: "apt-001", primary: "私人鑑賞預約", secondary: "2026-07-30 14:30 · 台北", status: "待確認", updatedAt: "2026-07-27T01:00:00.000Z" },
      ],
      newsletter: [
        { id: "letter-001", primary: "Letters from the Estate · No. 01", secondary: "未排程", status: "草稿", updatedAt: "2026-07-27T00:20:00.000Z" },
      ],
      "provider-events": [
        { id: "evt-001", primary: "ecpay.payment.succeeded", secondary: "Sandbox · LIG-20260727-1004", status: "已驗簽", updatedAt: "2026-07-27T01:46:00.000Z" },
      ],
      "dead-letters": [],
      reconciliation: [
        { id: "rec-20260727", primary: "2026-07-27 日結", secondary: "4 筆訂單 · 差異 0", status: "一致", updatedAt: "2026-07-27T04:00:00.000Z" },
      ],
      staff: [
        { id: "demo-owner", primary: "Demo Owner", secondary: "owner · demo@estatelignee.com", status: "本機展示", updatedAt: "2026-07-27T00:00:00.000Z" },
      ],
      audit: [
        { id: "audit-001", primary: "catalog.demo.seeded", secondary: "Demo Owner · Estate No. 01", status: "成功", updatedAt: "2026-07-27T00:00:00.000Z" },
      ],
      settings: [
        { id: "runtime-commerce", primary: "commerce_live", secondary: "正式交易總開關", status: "關閉", updatedAt: "2026-07-27T00:00:00.000Z" },
        { id: "runtime-checkout", primary: "checkout_enabled", secondary: "公開結帳", status: "關閉", updatedAt: "2026-07-27T00:00:00.000Z" },
      ],
    };
    return common[section] ?? [];
  }
}

class UnavailableAdminRepository implements AdminRepository {
  readonly mode = "rpc-unavailable" as const;

  private unavailable(): never {
    throw new AdminRepositoryError(
      "ADMIN_RPC_UNAVAILABLE",
      "正式後台 RPC 尚未綁定；為保護資料，此操作已被拒絕。",
      503,
    );
  }

  async getDashboard(): Promise<AdminDashboard> { return this.unavailable(); }
  async listProducts(): Promise<readonly AdminProductDraft[]> { return this.unavailable(); }
  async getProduct(): Promise<AdminProductDraft | null> { return this.unavailable(); }
  async createProduct(): Promise<AdminProductDraft> { return this.unavailable(); }
  async updateProduct(): Promise<AdminProductDraft> { return this.unavailable(); }
  async publishProduct(): Promise<AdminProductDraft> { return this.unavailable(); }
  async archiveProduct(): Promise<AdminProductDraft> { return this.unavailable(); }
  async upsertVariant(): Promise<AdminProductDraft> { return this.unavailable(); }
  async addPrice(): Promise<AdminProductDraft> { return this.unavailable(); }
  async setReadiness(): Promise<AdminProductDraft> { return this.unavailable(); }
  async linkMedia(): Promise<AdminProductDraft> { return this.unavailable(); }
  async transitionMedia(): Promise<AdminMediaTransition> { return this.unavailable(); }
  async listInventory(): Promise<readonly InventorySummary[]> { return this.unavailable(); }
  async adjustInventory(): Promise<InventorySummary> { return this.unavailable(); }
  async listOrders(): Promise<readonly AdminOrderProjection[]> { return this.unavailable(); }
  async listOperationalRows(): Promise<readonly OperationalRow[]> { return this.unavailable(); }
}

const demoRepository = new DemoAdminRepository();
const unavailableRepository = new UnavailableAdminRepository();
const rpcRepository = createRpcAdminRepository();

export function getAdminRepository(): AdminRepository {
  if (getCommerceEnvironment().mode === "demo") return demoRepository;
  return process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY
    ? rpcRepository
    : unavailableRepository;
}
