import { createHash } from "node:crypto";
import { z } from "zod";

import { getAdminAuthClient } from "./auth";
import { AdminRepositoryError } from "./errors";
import type {
  AdminDashboard,
  AdminMediaLink,
  AdminMediaLinkInput,
  AdminMediaTransition,
  AdminMediaTransitionInput,
  AdminMutationContext,
  AdminOrderProjection,
  AdminPriceInput,
  AdminPriceVersion,
  AdminProductDraft,
  AdminProductInput,
  AdminReadinessCheck,
  AdminRepository,
  AdminVariant,
  AdminVariantInput,
  InventoryMovementReason,
  InventorySummary,
  OperationalRow,
} from "./types";

interface RpcErrorLike {
  readonly code?: string;
  readonly message?: string;
  readonly details?: string;
  readonly hint?: string;
}

interface RpcResult {
  readonly data: unknown;
  readonly error: RpcErrorLike | null;
}

interface RpcClient {
  rpc(name: string, args?: Readonly<Record<string, unknown>>): Promise<RpcResult>;
}

const identifierSchema = z.string().trim().min(1);
const timestampSchema = z.string().datetime({ offset: true });
const nullableTimestampSchema = timestampSchema.nullable();
const nonNegativeIntegerSchema = z.number().int().nonnegative().safe();
const positiveIntegerSchema = z.number().int().positive().safe();
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const productStatusSchema = z.enum([
  "draft",
  "review",
  "ready",
  "published",
  "archived",
]);
const audienceSchema = z.enum(["men", "women", "unisex"]);
const mediaStatusSchema = z.enum([
  "draft",
  "review",
  "live-approved",
  "revocation-pending",
  "revoked",
]);
const orderStatusSchema = z.enum([
  "awaiting_payment",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "return_requested",
  "refunded",
]);
const paymentStatusSchema = z.enum(["pending", "paid", "refunded", "failed"]);
const fulfillmentStatusSchema = z.enum([
  "unfulfilled",
  "picking",
  "shipped",
  "delivered",
]);
const mediaPathSchema = z.string().regex(
  /^\/media\/[a-f0-9]{64}\/(800|1200|1600)\.(webp|avif)$/,
);
const optionAxisSchema = z.strictObject({
  key: identifierSchema,
  label: identifierSchema,
  values: z.array(z.strictObject({
    value: identifierSchema,
    label: identifierSchema,
  })),
});
const inventoryBalanceSchema = z.strictObject({
  rowVersion: positiveIntegerSchema,
  onHand: nonNegativeIntegerSchema,
  reserved: nonNegativeIntegerSchema,
  safetyStock: nonNegativeIntegerSchema,
  sellable: nonNegativeIntegerSchema,
  updatedAt: timestampSchema,
});
const priceSchema = z.strictObject({
  id: identifierSchema,
  version: positiveIntegerSchema,
  grossTwd: nonNegativeIntegerSchema,
  taxIncluded: z.literal(true),
  status: z.enum(["sandbox-draft", "approved", "retired"]),
  validFrom: nullableTimestampSchema,
  validUntil: nullableTimestampSchema,
  createdAt: timestampSchema,
});
const variantSchema = z.strictObject({
  id: identifierSchema,
  publicId: identifierSchema,
  rowVersion: positiveIntegerSchema,
  skuCode: identifierSchema,
  options: z.record(identifierSchema, z.string()),
  weightGrams: positiveIntegerSchema.nullable(),
  packageDimensionsMm: z.strictObject({
    length: positiveIntegerSchema,
    width: positiveIntegerSchema,
    height: positiveIntegerSchema,
  }).nullable(),
  factsStatus: z.enum(["requires-approval", "approved"]),
  enabled: z.boolean(),
  archivedAt: nullableTimestampSchema,
  inventory: inventoryBalanceSchema.nullable(),
  prices: z.array(priceSchema),
});
const mediaSchema = z.strictObject({
  id: identifierSchema,
  rowVersion: positiveIntegerSchema,
  assetId: identifierSchema,
  sha256: sha256Schema,
  assetRowVersion: positiveIntegerSchema,
  assetStatus: mediaStatusSchema,
  role: z.enum(["main", "detail", "gallery"]),
  sortOrder: positiveIntegerSchema,
  alt: z.string(),
  focalX: z.number().min(0).max(1),
  focalY: z.number().min(0).max(1),
  picturedSkuId: identifierSchema.nullable(),
  publicPath: mediaPathSchema,
  manifest: z.record(z.string(), z.unknown()),
});
const readinessSchema = z.strictObject({
  code: identifierSchema,
  state: z.enum(["pending", "passed", "failed"]),
  evidenceReference: z.string().nullable(),
  approvedBy: identifierSchema.nullable(),
  approvedAt: nullableTimestampSchema,
});
const publicationSchema = z.strictObject({
  id: identifierSchema,
  version: positiveIntegerSchema,
  contentSha256: sha256Schema,
  releaseBatchId: identifierSchema.nullable(),
  supersedesId: identifierSchema.nullable(),
  publishedBy: identifierSchema,
  publishedAt: timestampSchema,
  active: z.boolean(),
});
const productDocumentSchema = z.strictObject({
  id: identifierSchema,
  productCode: identifierSchema,
  rowVersion: positiveIntegerSchema,
  launchPosition: positiveIntegerSchema,
  slug: identifierSchema,
  slugLockedAt: nullableTimestampSchema,
  nameEn: identifierSchema,
  nameZh: identifierSchema,
  subtitleEn: z.string(),
  subtitleZh: z.string(),
  kind: identifierSchema,
  categoryCode: identifierSchema,
  chapterCode: identifierSchema,
  audience: audienceSchema,
  description: z.string(),
  story: z.string(),
  sizing: z.string(),
  care: z.string(),
  materialConcepts: z.array(identifierSchema),
  optionAxes: z.array(optionAxisSchema),
  launchGateCodes: z.array(identifierSchema),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  status: productStatusSchema,
  sandboxPriceNotice: z.boolean(),
  publishedAt: nullableTimestampSchema,
  archivedAt: nullableTimestampSchema,
  activePublicationId: identifierSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  relatedProductIds: z.array(identifierSchema),
  variants: z.array(variantSchema),
  media: z.array(mediaSchema),
  readiness: z.array(readinessSchema),
  publications: z.array(publicationSchema),
});
const directProductMutationSchema = productDocumentSchema.extend({
  replayed: z.boolean(),
});
const catalogItemSchema = z.strictObject({
  id: identifierSchema,
  productCode: identifierSchema,
  slug: identifierSchema,
  nameEn: identifierSchema,
  nameZh: identifierSchema,
  status: productStatusSchema,
  rowVersion: positiveIntegerSchema,
  launchPosition: positiveIntegerSchema,
  categoryCode: identifierSchema,
  chapterCode: identifierSchema,
  updatedAt: timestampSchema,
  publishedAt: nullableTimestampSchema,
});
const catalogListSchema = z.strictObject({
  items: z.array(catalogItemSchema),
  total: nonNegativeIntegerSchema,
  limit: positiveIntegerSchema.max(200),
  offset: nonNegativeIntegerSchema,
});
const inventoryListItemSchema = z.strictObject({
  variantId: identifierSchema,
  publicId: identifierSchema,
  skuCode: identifierSchema,
  productId: identifierSchema,
  productCode: identifierSchema,
  nameEn: identifierSchema,
  nameZh: identifierSchema,
  rowVersion: positiveIntegerSchema,
  onHand: nonNegativeIntegerSchema,
  reserved: nonNegativeIntegerSchema,
  safetyStock: nonNegativeIntegerSchema,
  sellable: nonNegativeIntegerSchema,
  updatedAt: timestampSchema,
});
const inventoryListSchema = z.strictObject({
  items: z.array(inventoryListItemSchema),
  total: nonNegativeIntegerSchema,
  limit: positiveIntegerSchema.max(200),
  offset: nonNegativeIntegerSchema,
});
const inventoryCommandSchema = z.strictObject({
  movementId: identifierSchema,
  variantId: identifierSchema,
  rowVersion: positiveIntegerSchema,
  onHand: nonNegativeIntegerSchema,
  reserved: nonNegativeIntegerSchema,
  safetyStock: nonNegativeIntegerSchema,
  sellable: nonNegativeIntegerSchema,
  updatedAt: timestampSchema,
  replayed: z.boolean(),
});
const orderSchema = z.strictObject({
  id: identifierSchema,
  publicId: identifierSchema.optional(),
  orderNumber: identifierSchema.optional(),
  customerName: z.string().optional(),
  customerEmailMasked: z.string().optional(),
  merchantTradeNo: identifierSchema.optional(),
  status: orderStatusSchema,
  paymentStatus: paymentStatusSchema,
  fulfillmentStatus: fulfillmentStatusSchema,
  totalTwd: nonNegativeIntegerSchema.optional(),
  totalGrossTwd: nonNegativeIntegerSchema.optional(),
  grandTotalTwd: nonNegativeIntegerSchema.optional(),
  itemCount: nonNegativeIntegerSchema,
  paymentAtRisk: z.boolean().optional(),
  productionCanary: z.boolean().optional(),
  rowVersion: positiveIntegerSchema.optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema.optional(),
}).superRefine((value, context) => {
  if (!value.orderNumber && !value.publicId) {
    context.addIssue({
      code: "custom",
      path: ["orderNumber"],
      message: "orderNumber or publicId is required",
    });
  }
  if (
    value.totalTwd === undefined
    && value.totalGrossTwd === undefined
    && value.grandTotalTwd === undefined
  ) {
    context.addIssue({
      code: "custom",
      path: ["totalTwd"],
      message: "a total amount is required",
    });
  }
});
const ordersListSchema = z.strictObject({
  items: z.array(orderSchema),
  total: nonNegativeIntegerSchema,
  limit: positiveIntegerSchema.max(200),
  offset: nonNegativeIntegerSchema,
});
const dashboardProductSchema = z.strictObject({
  id: identifierSchema,
  productCode: identifierSchema,
  slug: identifierSchema,
  nameEn: identifierSchema,
  nameZh: identifierSchema,
  categoryCode: identifierSchema,
  chapterCode: identifierSchema,
  audience: audienceSchema,
  kind: identifierSchema,
  description: z.string(),
  story: z.string(),
  sizing: z.string(),
  care: z.string(),
  materialConcepts: z.array(identifierSchema),
  optionAxes: z.array(optionAxisSchema),
  launchGateCodes: z.array(identifierSchema),
  status: productStatusSchema,
  rowVersion: positiveIntegerSchema,
  updatedAt: timestampSchema,
  publishedAt: nullableTimestampSchema,
  variants: z.array(z.never()).max(0),
  media: z.array(z.never()).max(0),
  readiness: z.array(z.never()).max(0),
});
const dashboardSchema = z.strictObject({
  productCount: nonNegativeIntegerSchema,
  publishedProductCount: nonNegativeIntegerSchema,
  draftProductCount: nonNegativeIntegerSchema,
  lowStockSkuCount: nonNegativeIntegerSchema,
  orderCount: nonNegativeIntegerSchema,
  openOrderCount: nonNegativeIntegerSchema,
  revenueTwd: nonNegativeIntegerSchema,
  pendingReadinessCount: nonNegativeIntegerSchema,
  recentOrders: z.array(orderSchema),
  recentProducts: z.array(dashboardProductSchema),
});
const mediaTransitionSchema = z.strictObject({
  mediaAssetId: identifierSchema,
  sha256: sha256Schema,
  status: mediaStatusSchema,
  rowVersion: positiveIntegerSchema,
  backupAcknowledgedAt: nullableTimestampSchema,
  mediaSafetyRevision: nonNegativeIntegerSchema,
  replayed: z.boolean(),
});
const publishMutationSchema = z.strictObject({
  publicationId: identifierSchema,
  publicationVersion: positiveIntegerSchema,
  contentSha256: sha256Schema,
  catalogRevision: nonNegativeIntegerSchema,
  product: productDocumentSchema,
  replayed: z.boolean(),
});
const archiveMutationSchema = z.strictObject({
  catalogRevision: nonNegativeIntegerSchema,
  product: productDocumentSchema,
  replayed: z.boolean(),
});
const priceMutationSchema = z.strictObject({
  id: identifierSchema,
  variantId: identifierSchema,
  version: positiveIntegerSchema,
  product: productDocumentSchema,
  replayed: z.boolean(),
});

function invalidRpcResponse(code: string): never {
  throw new AdminRepositoryError(
    code,
    "後台資料服務回傳了無法驗證的資料。",
    502,
  );
}

function parseRpcResponse<T>(
  schema: z.ZodType<T>,
  value: unknown,
  code: string,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) invalidRpcResponse(code);
  return parsed.data;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function requestHash(operation: string, payload: unknown): string {
  return createHash("sha256")
    .update(stableJson({ operation, payload }))
    .digest("hex");
}

const rpcErrorMessages: Readonly<Record<string, string>> = {
  ROW_VERSION_CONFLICT: "資料已被另一個工作階段更新，請重新整理後再試。",
  IDEMPOTENCY_KEY_CONFLICT: "此操作識別碼已用於不同內容，請重新整理後再試。",
  IDEMPOTENCY_COMMAND_IN_PROGRESS: "相同操作仍在處理中，請稍候再重新整理。",
  INVENTORY_OPERATION_CONFLICT: "這筆庫存 movement 已存在。",
  PRODUCT_NOT_FOUND: "找不到商品。",
  VARIANT_NOT_FOUND: "找不到 SKU。",
  MEDIA_ASSET_NOT_FOUND: "找不到媒體資產。",
  PRODUCT_MEDIA_LINK_NOT_FOUND: "找不到商品圖片連結。",
  PICTURED_SKU_NOT_FOUND: "畫面中 SKU 不屬於此商品。",
  UNKNOWN_SKU: "找不到 SKU。",
  PUBLISHED_SLUG_LOCKED: "商品發布後不可變更網址代稱。",
  PRODUCT_READINESS_INCOMPLETE: "商品 readiness 尚未全部通過。",
  NO_ENABLED_VARIANTS: "商品至少需要一個已啟用的 SKU。",
  ACTIVE_APPROVED_PRICE_REQUIRED: "每個啟用 SKU 都需要有效的核准價格。",
  SELLABLE_INVENTORY_REQUIRED: "每個啟用 SKU 都需要可售庫存。",
  APPROVED_MAIN_MEDIA_REQUIRED: "商品需要完成備份確認的核准主圖。",
  INVALID_MEDIA_STATE_TRANSITION: "圖片狀態已改變，請重新整理後再操作。",
  MEDIA_BACKUP_ACK_REQUIRED: "核准圖片前必須確認私有原圖與衍生圖已完成備份。",
  VARIANT_FACTS_UNAPPROVED: "SKU 商品事實尚未核准。",
  APPROVED_PRICE_REQUIRES_VALID_FROM: "核准價格必須設定生效時間。",
  MEDIA_PATH_SHA_MISMATCH: "公開圖片路徑與媒體內容雜湊不一致。",
  RECENT_TOTP_REQUIRED: "此高風險操作需要最近 10 分鐘內完成 TOTP。",
  ADMIN_AAL2_REQUIRED: "此操作需要 AAL2 雙重驗證。",
  ADMIN_ROLE_FORBIDDEN: "你的角色無權執行此操作。",
  ADMIN_MEMBERSHIP_INACTIVE: "此管理員 membership 未啟用。",
};

function rpcError(error: RpcErrorLike): AdminRepositoryError {
  const source = [error.message, error.details, error.hint, error.code].filter(Boolean).join(" ");
  const marker = Object.keys(rpcErrorMessages).find((candidate) => source.includes(candidate));
  if (!marker) {
    return new AdminRepositoryError(
      "ADMIN_RPC_FAILED",
      "後台資料服務目前無法完成操作。",
      error.code === "PGRST202" ? 503 : 502,
    );
  }
  const conflict = new Set([
    "ROW_VERSION_CONFLICT",
    "IDEMPOTENCY_KEY_CONFLICT",
    "IDEMPOTENCY_COMMAND_IN_PROGRESS",
    "INVENTORY_OPERATION_CONFLICT",
    "PUBLISHED_SLUG_LOCKED",
    "INVALID_MEDIA_STATE_TRANSITION",
  ]);
  const notFound = new Set([
    "PRODUCT_NOT_FOUND",
    "VARIANT_NOT_FOUND",
    "UNKNOWN_SKU",
    "MEDIA_ASSET_NOT_FOUND",
    "PRODUCT_MEDIA_LINK_NOT_FOUND",
    "PICTURED_SKU_NOT_FOUND",
  ]);
  const forbidden = marker.startsWith("ADMIN_") || marker === "RECENT_TOTP_REQUIRED";
  return new AdminRepositoryError(
    marker,
    rpcErrorMessages[marker] ?? "後台操作失敗。",
    conflict.has(marker) ? 409 : notFound.has(marker) ? 404 : forbidden ? 403 : 422,
  );
}

async function callRpc(
  functionName: string,
  args: Readonly<Record<string, unknown>> = {},
): Promise<unknown> {
  const client = await getAdminAuthClient();
  const rpcClient = client.schema("api") as unknown as RpcClient;
  const { data, error } = await rpcClient.rpc(functionName, args);
  if (error) throw rpcError(error);
  return data;
}

type ProductDocument = z.infer<typeof productDocumentSchema>;
type ProductVariantDocument = z.infer<typeof variantSchema>;
type ProductMediaDocument = z.infer<typeof mediaSchema>;
type ProductReadinessDocument = z.infer<typeof readinessSchema>;
type CatalogItemDocument = z.infer<typeof catalogItemSchema>;
type DashboardProductDocument = z.infer<typeof dashboardProductSchema>;
type InventoryListItemDocument = z.infer<typeof inventoryListItemSchema>;
type OrderDocument = z.infer<typeof orderSchema>;

function priceFromVariants(variants: readonly ProductVariantDocument[]): number {
  const prices = variants
    .flatMap((variant) => variant.prices)
    .filter((price) => price.status !== "retired")
    .sort((left, right) => right.version - left.version);
  return prices[0]?.grossTwd ?? 0;
}

function mapRpcPrice(
  item: z.infer<typeof priceSchema>,
): AdminPriceVersion {
  if (item.status === "retired") {
    invalidRpcResponse("ADMIN_RPC_INVALID_PRODUCT_RESPONSE");
  }
  return {
    id: item.id,
    version: item.version,
    grossTwd: item.grossTwd,
    status: item.status,
    validFrom: item.validFrom,
    validUntil: item.validUntil,
    createdAt: item.createdAt,
  };
}

function mapRpcVariant(
  item: ProductVariantDocument,
  product: Pick<AdminProductDraft, "id" | "name">,
): AdminVariant {
  const optionLabel = Object.values(item.options).join(" · ") || "單一規格";
  const inventory = item.inventory
    ? {
        skuId: item.id,
        skuCode: item.skuCode,
        productId: product.id,
        productName: product.name,
        optionLabel,
        onHand: item.inventory.onHand,
        reserved: item.inventory.reserved,
        safetyStock: item.inventory.safetyStock,
        available: item.inventory.sellable,
        version: item.inventory.rowVersion,
        updatedAt: item.inventory.updatedAt,
      }
    : null;
  return {
    id: item.id,
    publicId: item.publicId,
    rowVersion: item.rowVersion,
    skuCode: item.skuCode,
    options: item.options,
    weightGrams: item.weightGrams,
    packageDimensionsMm: item.packageDimensionsMm,
    factsStatus: item.factsStatus,
    enabled: item.enabled,
    archivedAt: item.archivedAt,
    inventory,
    prices: item.prices
      .filter((price) => price.status !== "retired")
      .map(mapRpcPrice),
  };
}

function mapRpcMedia(item: ProductMediaDocument): AdminMediaLink {
  return {
    id: item.id,
    rowVersion: item.rowVersion,
    assetId: item.assetId,
    assetRowVersion: item.assetRowVersion,
    sha256: item.sha256,
    assetStatus: item.assetStatus,
    role: item.role,
    sortOrder: item.sortOrder,
    alt: item.alt,
    focalX: item.focalX,
    focalY: item.focalY,
    picturedSkuId: item.picturedSkuId,
    publicPath: item.publicPath,
  };
}

export function mapRpcMediaTransition(value: unknown): AdminMediaTransition {
  const item = parseRpcResponse(
    mediaTransitionSchema,
    value,
    "ADMIN_RPC_INVALID_MEDIA_TRANSITION_RESPONSE",
  );
  return {
    assetId: item.mediaAssetId,
    sha256: item.sha256,
    status: item.status,
    rowVersion: item.rowVersion,
    backupAcknowledgedAt: item.backupAcknowledgedAt,
    mediaSafetyRevision: item.mediaSafetyRevision,
    replayed: item.replayed,
  };
}

function mapRpcReadiness(
  item: ProductReadinessDocument,
): AdminReadinessCheck {
  return {
    code: item.code,
    state: item.state,
    evidenceReference: item.evidenceReference,
    approvedBy: item.approvedBy,
    approvedAt: item.approvedAt,
  };
}

function mapParsedProduct(item: ProductDocument): AdminProductDraft {
  const basicProduct = {
    id: item.id,
    productCode: item.productCode,
    slug: item.slug,
    name: item.nameEn,
    subtitle: item.nameZh,
    category: item.categoryCode,
    audience: item.audience,
    collectionId: item.chapterCode,
    kind: item.kind,
    description: item.description,
    story: item.story,
    sizing: item.sizing,
    care: item.care,
    materialConcepts: item.materialConcepts,
    optionAxes: item.optionAxes,
    launchGateCodes: item.launchGateCodes,
    relatedProductIds: item.relatedProductIds,
    seoTitle: item.seoTitle ?? `${item.nameEn}｜LIGNÉE`,
    seoDescription: item.seoDescription ?? item.description,
    basePriceTwd: priceFromVariants(item.variants),
    imagePath: item.media.find((asset) => asset.role === "main")?.publicPath ?? null,
    status: item.status,
    version: item.rowVersion,
    updatedAt: item.updatedAt,
    publishedAt: item.publishedAt,
    skuCount: item.variants.length,
  };
  return {
    ...basicProduct,
    variants: item.variants.map((variant) =>
      mapRpcVariant(variant, { id: basicProduct.id, name: basicProduct.name }),
    ),
    media: item.media.map(mapRpcMedia),
    readiness: item.readiness.map(mapRpcReadiness),
  };
}

export function mapRpcAdminProduct(value: unknown): AdminProductDraft {
  return mapParsedProduct(parseRpcResponse(
    productDocumentSchema,
    value,
    "ADMIN_RPC_INVALID_PRODUCT_RESPONSE",
  ));
}

function mapDirectProductMutation(value: unknown): AdminProductDraft {
  return mapParsedProduct(parseRpcResponse(
    directProductMutationSchema,
    value,
    "ADMIN_RPC_INVALID_PRODUCT_MUTATION_RESPONSE",
  ));
}

function mapCatalogItem(item: CatalogItemDocument): AdminProductDraft {
  return {
    id: item.id,
    productCode: item.productCode,
    slug: item.slug,
    name: item.nameEn,
    subtitle: item.nameZh,
    category: item.categoryCode,
    audience: "unisex",
    collectionId: item.chapterCode,
    kind: "unspecified",
    description: "",
    story: "",
    sizing: "",
    care: "",
    materialConcepts: [],
    optionAxes: [],
    launchGateCodes: [],
    relatedProductIds: [],
    seoTitle: `${item.nameEn}｜LIGNÉE`,
    seoDescription: item.nameZh,
    basePriceTwd: 0,
    imagePath: null,
    status: item.status,
    version: item.rowVersion,
    updatedAt: item.updatedAt,
    publishedAt: item.publishedAt,
    skuCount: 0,
    variants: [],
    media: [],
    readiness: [],
  };
}

function mapDashboardProduct(
  item: DashboardProductDocument,
): AdminProductDraft {
  return {
    id: item.id,
    productCode: item.productCode,
    slug: item.slug,
    name: item.nameEn,
    subtitle: item.nameZh,
    category: item.categoryCode,
    audience: item.audience,
    collectionId: item.chapterCode,
    kind: item.kind,
    description: item.description,
    story: item.story,
    sizing: item.sizing,
    care: item.care,
    materialConcepts: item.materialConcepts,
    optionAxes: item.optionAxes,
    launchGateCodes: item.launchGateCodes,
    relatedProductIds: [],
    seoTitle: `${item.nameEn}｜LIGNÉE`,
    seoDescription: item.description,
    basePriceTwd: 0,
    imagePath: null,
    status: item.status,
    version: item.rowVersion,
    updatedAt: item.updatedAt,
    publishedAt: item.publishedAt,
    skuCount: 0,
    variants: [],
    media: [],
    readiness: [],
  };
}

export function mapRpcCatalogList(value: unknown): readonly AdminProductDraft[] {
  const document = parseRpcResponse(
    catalogListSchema,
    value,
    "ADMIN_RPC_INVALID_CATALOG_RESPONSE",
  );
  return document.items.map(mapCatalogItem);
}

export function mapRpcInventory(value: unknown): InventorySummary {
  const item = parseRpcResponse(
    inventoryListItemSchema,
    value,
    "ADMIN_RPC_INVALID_INVENTORY_RESPONSE",
  );
  return {
    skuId: item.variantId,
    skuCode: item.skuCode,
    productId: item.productId,
    productName: item.nameZh,
    optionLabel: "單一規格",
    onHand: item.onHand,
    reserved: item.reserved,
    safetyStock: item.safetyStock,
    available: item.sellable,
    version: item.rowVersion,
    updatedAt: item.updatedAt,
  };
}

export function mapRpcOrder(value: unknown): AdminOrderProjection {
  const item = parseRpcResponse(
    orderSchema,
    value,
    "ADMIN_RPC_INVALID_ORDER_RESPONSE",
  );
  return {
    id: item.id,
    orderNumber: item.orderNumber ?? item.publicId as string,
    customerName: item.customerName ?? "訪客",
    customerEmailMasked: item.customerEmailMasked ?? "—",
    status: item.status,
    paymentStatus: item.paymentStatus,
    fulfillmentStatus: item.fulfillmentStatus,
    totalTwd: item.totalTwd ?? item.totalGrossTwd ?? item.grandTotalTwd as number,
    itemCount: item.itemCount,
    createdAt: item.createdAt,
  };
}

export function mapRpcDashboard(value: unknown): AdminDashboard {
  const item = parseRpcResponse(
    dashboardSchema,
    value,
    "ADMIN_RPC_INVALID_DASHBOARD_RESPONSE",
  );
  return {
    productCount: item.productCount,
    publishedProductCount: item.publishedProductCount,
    draftProductCount: item.draftProductCount,
    lowStockSkuCount: item.lowStockSkuCount,
    orderCount: item.orderCount,
    openOrderCount: item.openOrderCount,
    revenueTwd: item.revenueTwd,
    pendingReadinessCount: item.pendingReadinessCount,
    recentOrders: item.recentOrders.map((order) => mapParsedOrder(order)),
    recentProducts: item.recentProducts.map(mapDashboardProduct),
  };
}

function mapParsedOrder(item: OrderDocument): AdminOrderProjection {
  return {
    id: item.id,
    orderNumber: item.orderNumber ?? item.publicId as string,
    customerName: item.customerName ?? "訪客",
    customerEmailMasked: item.customerEmailMasked ?? "—",
    status: item.status,
    paymentStatus: item.paymentStatus,
    fulfillmentStatus: item.fulfillmentStatus,
    totalTwd: item.totalTwd ?? item.totalGrossTwd ?? item.grandTotalTwd as number,
    itemCount: item.itemCount,
    createdAt: item.createdAt,
  };
}

function mapRpcInventoryList(value: unknown): readonly InventorySummary[] {
  const document = parseRpcResponse(
    inventoryListSchema,
    value,
    "ADMIN_RPC_INVALID_INVENTORY_LIST_RESPONSE",
  );
  return document.items.map((item) => mapParsedInventory(item));
}

function mapParsedInventory(item: InventoryListItemDocument): InventorySummary {
  return {
    skuId: item.variantId,
    skuCode: item.skuCode,
    productId: item.productId,
    productName: item.nameZh,
    optionLabel: "單一規格",
    onHand: item.onHand,
    reserved: item.reserved,
    safetyStock: item.safetyStock,
    available: item.sellable,
    version: item.rowVersion,
    updatedAt: item.updatedAt,
  };
}

function mapRpcOrdersList(value: unknown): readonly AdminOrderProjection[] {
  const document = parseRpcResponse(
    ordersListSchema,
    value,
    "ADMIN_RPC_INVALID_ORDERS_LIST_RESPONSE",
  );
  return document.items.map(mapParsedOrder);
}

function productPayload(input: AdminProductInput): Readonly<Record<string, unknown>> {
  return {
    slug: input.slug,
    nameEn: input.name,
    nameZh: input.subtitle,
    subtitleEn: input.name,
    subtitleZh: input.subtitle,
    categoryCode: input.category,
    chapterCode: input.collectionId,
    audience: input.audience,
    kind: input.kind,
    description: input.description,
    story: input.story,
    sizing: input.sizing,
    care: input.care,
    materialConcepts: input.materialConcepts,
    optionAxes: input.optionAxes,
    launchGateCodes: input.launchGateCodes,
    relatedProductIds: input.relatedProductIds,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
  };
}

class RpcAdminRepository implements AdminRepository {
  readonly mode = "rpc" as const;

  async getDashboard(): Promise<AdminDashboard> {
    return mapRpcDashboard(await callRpc("admin_dashboard"));
  }

  async listProducts(query = ""): Promise<readonly AdminProductDraft[]> {
    const data = await callRpc("admin_catalog_list", {
      p_search: query || null,
      p_status: null,
      p_limit: 200,
      p_offset: 0,
    });
    return mapRpcCatalogList(data);
  }

  async getProduct(id: string): Promise<AdminProductDraft | null> {
    try {
      return mapRpcAdminProduct(await callRpc("admin_product_get", { p_product_id: id }));
    } catch (error) {
      if (error instanceof AdminRepositoryError && error.status === 404) return null;
      throw error;
    }
  }

  async createProduct(
    input: AdminProductInput,
    context: AdminMutationContext,
  ): Promise<AdminProductDraft> {
    const payload = productPayload(input);
    return mapDirectProductMutation(await callRpc("admin_product_create", {
      p_idempotency_key: context.idempotencyKey,
      p_request_hash: requestHash("product.create", payload),
      p_payload: payload,
    }));
  }

  async updateProduct(
    id: string,
    input: AdminProductInput,
    context: AdminMutationContext,
  ): Promise<AdminProductDraft> {
    const payload = productPayload(input);
    return mapDirectProductMutation(await callRpc("admin_product_save", {
      p_product_id: id,
      p_expected_version: context.expectedVersion,
      p_idempotency_key: context.idempotencyKey,
      p_request_hash: requestHash("product.save", { id, expectedVersion: context.expectedVersion, payload }),
      p_payload: payload,
    }));
  }

  async publishProduct(
    id: string,
    context: AdminMutationContext,
  ): Promise<AdminProductDraft> {
    const result = parseRpcResponse(
      publishMutationSchema,
      await callRpc("admin_product_publish", {
      p_product_id: id,
      p_expected_version: context.expectedVersion,
      p_idempotency_key: context.idempotencyKey,
      p_request_hash: requestHash("product.publish", { id, expectedVersion: context.expectedVersion }),
      p_release_batch_id: null,
      }),
      "ADMIN_RPC_INVALID_PRODUCT_PUBLISH_RESPONSE",
    );
    return mapParsedProduct(result.product);
  }

  async archiveProduct(
    id: string,
    context: AdminMutationContext,
  ): Promise<AdminProductDraft> {
    const result = parseRpcResponse(
      archiveMutationSchema,
      await callRpc("admin_product_archive", {
      p_product_id: id,
      p_expected_version: context.expectedVersion,
      p_idempotency_key: context.idempotencyKey,
      p_request_hash: requestHash("product.archive", { id, expectedVersion: context.expectedVersion }),
      }),
      "ADMIN_RPC_INVALID_PRODUCT_ARCHIVE_RESPONSE",
    );
    return mapParsedProduct(result.product);
  }

  async upsertVariant(
    productId: string,
    input: AdminVariantInput,
    context: AdminMutationContext,
  ): Promise<AdminProductDraft> {
    const payload = {
      publicId: input.publicId,
      skuCode: input.skuCode,
      options: input.options,
      weightGrams: input.weightGrams,
      packageDimensionsMm: input.packageDimensionsMm,
      factsStatus: input.factsStatus,
      enabled: input.enabled,
    };
    return mapDirectProductMutation(await callRpc("admin_variant_upsert", {
      p_product_id: productId,
      p_expected_product_version: context.expectedVersion,
      p_variant_id: input.variantId ?? null,
      p_expected_variant_version: input.expectedVariantVersion ?? null,
      p_idempotency_key: context.idempotencyKey,
      p_request_hash: requestHash("variant.upsert", {
        productId,
        expectedProductVersion: context.expectedVersion,
        variantId: input.variantId ?? null,
        expectedVariantVersion: input.expectedVariantVersion ?? null,
        payload,
      }),
      p_payload: payload,
    }));
  }

  async addPrice(
    input: AdminPriceInput,
    context: AdminMutationContext,
  ): Promise<AdminProductDraft> {
    const payload = {
      grossTwd: input.grossTwd,
      status: input.status,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
    };
    const result = parseRpcResponse(
      priceMutationSchema,
      await callRpc("admin_price_add", {
      p_variant_id: input.variantId,
      p_expected_variant_version: input.expectedVariantVersion,
      p_idempotency_key: context.idempotencyKey,
      p_request_hash: requestHash("price.add", {
        variantId: input.variantId,
        expectedVariantVersion: input.expectedVariantVersion,
        expectedProductVersion: context.expectedVersion,
        payload,
      }),
      p_payload: payload,
      }),
      "ADMIN_RPC_INVALID_PRICE_MUTATION_RESPONSE",
    );
    return mapParsedProduct(result.product);
  }

  async setReadiness(
    productId: string,
    code: string,
    state: AdminReadinessCheck["state"],
    evidenceReference: string | null,
    context: AdminMutationContext,
  ): Promise<AdminProductDraft> {
    return mapDirectProductMutation(await callRpc("admin_readiness_set", {
      p_product_id: productId,
      p_expected_product_version: context.expectedVersion,
      p_idempotency_key: context.idempotencyKey,
      p_request_hash: requestHash("readiness.set", {
        productId,
        expectedProductVersion: context.expectedVersion,
        code,
        state,
        evidenceReference,
      }),
      p_check_code: code,
      p_state: state,
      p_evidence_reference: evidenceReference,
    }));
  }

  async linkMedia(
    productId: string,
    input: AdminMediaLinkInput,
    context: AdminMutationContext,
  ): Promise<AdminProductDraft> {
    const payload = {
      assetId: input.assetId,
      role: input.role,
      sortOrder: input.sortOrder,
      alt: input.alt,
      focalX: input.focalX,
      focalY: input.focalY,
      picturedSkuId: input.picturedSkuId,
      publicPath: input.publicPath,
    };
    return mapDirectProductMutation(await callRpc("admin_product_media_link", {
      p_product_id: productId,
      p_expected_product_version: context.expectedVersion,
      p_link_id: input.linkId ?? null,
      p_expected_link_version: input.expectedLinkVersion ?? null,
      p_idempotency_key: context.idempotencyKey,
      p_request_hash: requestHash("product.media.link", {
        productId,
        expectedProductVersion: context.expectedVersion,
        linkId: input.linkId ?? null,
        expectedLinkVersion: input.expectedLinkVersion ?? null,
        payload,
      }),
      p_payload: payload,
    }));
  }

  async transitionMedia(
    input: AdminMediaTransitionInput,
    context: AdminMutationContext,
  ): Promise<AdminMediaTransition> {
    const payload = {
      assetId: input.assetId,
      expectedAssetVersion: input.expectedAssetVersion,
      toStatus: input.toStatus,
      backupAcknowledged: input.backupAcknowledged,
      reason: input.reason,
    };
    return mapRpcMediaTransition(await callRpc("admin_media_transition", {
      p_asset_id: input.assetId,
      p_expected_version: input.expectedAssetVersion,
      p_idempotency_key: context.idempotencyKey,
      p_request_hash: requestHash("media.transition", payload),
      p_to_status: input.toStatus,
      p_backup_acknowledged: input.backupAcknowledged,
      p_reason: input.reason,
    }));
  }

  async listInventory(query = ""): Promise<readonly InventorySummary[]> {
    const data = await callRpc("admin_inventory_list", {
      p_search: query || null,
      p_limit: 200,
      p_offset: 0,
    });
    return mapRpcInventoryList(data);
  }

  async adjustInventory(
    skuId: string,
    delta: number,
    reason: InventoryMovementReason,
    context: AdminMutationContext,
  ): Promise<InventorySummary> {
    const existing = (await this.listInventory()).find((item) => item.skuId === skuId);
    if (!existing) {
      throw new AdminRepositoryError(
        "ADMIN_RPC_INVENTORY_CONTEXT_MISSING",
        "無法驗證這筆庫存異動所屬的商品與 SKU。",
        502,
      );
    }
    const kind: Readonly<Record<InventoryMovementReason, string>> = {
      receiving: "receive",
      "cycle-count": "adjustment",
      "safety-stock": "safety_stock",
      "return-inspection": "return_sellable",
    };
    const payload = {
      variantId: skuId,
      expectedVersion: context.expectedVersion,
      operationKey: context.idempotencyKey,
      kind: kind[reason],
      delta,
    };
    const result = parseRpcResponse(
      inventoryCommandSchema,
      await callRpc("admin_inventory_command", {
        p_variant_id: skuId,
        p_expected_version: context.expectedVersion,
        p_operation_key: context.idempotencyKey,
        p_request_hash: requestHash("inventory.command", payload),
        p_kind: kind[reason],
        p_delta: delta,
        p_order_id: null,
        p_reservation_id: null,
      }),
      "ADMIN_RPC_INVALID_INVENTORY_MUTATION_RESPONSE",
    );
    return {
      skuId: result.variantId,
      skuCode: existing.skuCode,
      productId: existing.productId,
      productName: existing.productName,
      optionLabel: existing.optionLabel,
      onHand: result.onHand,
      reserved: result.reserved,
      safetyStock: result.safetyStock,
      available: result.sellable,
      version: result.rowVersion,
      updatedAt: result.updatedAt,
    };
  }

  async listOrders(): Promise<readonly AdminOrderProjection[]> {
    const data = await callRpc("admin_orders_list", {
      p_status: null,
      p_limit: 100,
      p_offset: 0,
    });
    return mapRpcOrdersList(data);
  }

  async listOperationalRows(section: string): Promise<readonly OperationalRow[]> {
    void section;
    return [];
  }
}

export function createRpcAdminRepository(): AdminRepository {
  return new RpcAdminRepository();
}
