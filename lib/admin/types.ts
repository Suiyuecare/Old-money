export type AdminRole = "owner" | "merchandiser" | "fulfillment" | "support";

export type AdminAccessStatus =
  | "authorized"
  | "anonymous"
  | "mfa-enrollment-required"
  | "mfa-challenge-required"
  | "membership-required"
  | "unconfigured";

export interface AdminIdentity {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: AdminRole;
  readonly demo: boolean;
}

export interface AdminAccess {
  readonly status: AdminAccessStatus;
  readonly identity: AdminIdentity | null;
  readonly reason: string | null;
}

export type AdminProductStatus = "draft" | "review" | "ready" | "published" | "archived";
export type AdminAudience = "men" | "women" | "unisex";
export type AdminMediaAssetStatus =
  | "draft"
  | "review"
  | "live-approved"
  | "revocation-pending"
  | "revoked";

export interface AdminProductDraft {
  readonly id: string;
  readonly productCode: string;
  readonly slug: string;
  readonly name: string;
  readonly subtitle: string;
  readonly category: string;
  readonly audience: AdminAudience;
  readonly collectionId: string;
  readonly kind: string;
  readonly description: string;
  readonly story: string;
  readonly sizing: string;
  readonly care: string;
  readonly materialConcepts: readonly string[];
  readonly optionAxes: readonly AdminOptionAxis[];
  readonly launchGateCodes: readonly string[];
  readonly relatedProductIds: readonly string[];
  readonly seoTitle: string;
  readonly seoDescription: string;
  readonly basePriceTwd: number;
  readonly imagePath: string | null;
  readonly status: AdminProductStatus;
  readonly version: number;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
  readonly skuCount: number;
  readonly variants: readonly AdminVariant[];
  readonly media: readonly AdminMediaLink[];
  readonly readiness: readonly AdminReadinessCheck[];
}

export interface AdminOptionAxis {
  readonly key: string;
  readonly label: string;
  readonly values: readonly {
    readonly value: string;
    readonly label: string;
  }[];
}

export interface AdminPriceVersion {
  readonly id: string;
  readonly version: number;
  readonly grossTwd: number;
  readonly status: "sandbox-draft" | "approved";
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly createdAt: string;
}

export interface AdminVariant {
  readonly id: string;
  readonly publicId: string;
  readonly rowVersion: number;
  readonly skuCode: string;
  readonly options: Readonly<Record<string, string>>;
  readonly weightGrams: number | null;
  readonly packageDimensionsMm: {
    readonly length: number;
    readonly width: number;
    readonly height: number;
  } | null;
  readonly factsStatus: "requires-approval" | "approved";
  readonly enabled: boolean;
  readonly archivedAt: string | null;
  readonly inventory: InventorySummary | null;
  readonly prices: readonly AdminPriceVersion[];
}

export interface AdminMediaLink {
  readonly id: string;
  readonly rowVersion: number;
  readonly assetId: string;
  readonly assetRowVersion: number;
  readonly sha256: string;
  readonly assetStatus: AdminMediaAssetStatus;
  readonly role: "main" | "detail" | "gallery";
  readonly sortOrder: number;
  readonly alt: string;
  readonly focalX: number;
  readonly focalY: number;
  readonly picturedSkuId: string | null;
  readonly publicPath: string;
}

export interface AdminMediaTransitionInput {
  readonly assetId: string;
  readonly expectedAssetVersion: number;
  readonly toStatus: AdminMediaAssetStatus;
  readonly backupAcknowledged: boolean;
  readonly reason: string | null;
}

export interface AdminMediaTransition {
  readonly assetId: string;
  readonly sha256: string;
  readonly status: AdminMediaAssetStatus;
  readonly rowVersion: number;
  readonly backupAcknowledgedAt: string | null;
  readonly mediaSafetyRevision: number;
  readonly replayed: boolean;
}

export interface AdminReadinessCheck {
  readonly code: string;
  readonly state: "pending" | "passed" | "failed";
  readonly evidenceReference: string | null;
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
}

export interface AdminVariantInput {
  readonly variantId?: string;
  readonly expectedVariantVersion?: number;
  readonly publicId: string;
  readonly skuCode?: string;
  readonly options: Readonly<Record<string, string>>;
  readonly weightGrams: number | null;
  readonly packageDimensionsMm: {
    readonly length: number;
    readonly width: number;
    readonly height: number;
  } | null;
  readonly factsStatus: "requires-approval" | "approved";
  readonly enabled: boolean;
}

export interface AdminPriceInput {
  readonly variantId: string;
  readonly expectedVariantVersion: number;
  readonly grossTwd: number;
  readonly status: "sandbox-draft" | "approved";
  readonly validFrom: string | null;
  readonly validUntil: string | null;
}

export interface AdminMediaLinkInput {
  readonly linkId?: string;
  readonly expectedLinkVersion?: number;
  readonly assetId: string;
  readonly role: "main" | "detail" | "gallery";
  readonly sortOrder: number;
  readonly alt: string;
  readonly focalX: number;
  readonly focalY: number;
  readonly picturedSkuId: string | null;
  readonly publicPath: string;
}

export interface AdminProductInput {
  readonly slug: string;
  readonly name: string;
  readonly subtitle: string;
  readonly category: string;
  readonly audience: AdminAudience;
  readonly collectionId: string;
  readonly kind: string;
  readonly description: string;
  readonly story: string;
  readonly sizing: string;
  readonly care: string;
  readonly materialConcepts: readonly string[];
  readonly optionAxes: readonly AdminOptionAxis[];
  readonly launchGateCodes: readonly string[];
  readonly relatedProductIds: readonly string[];
  readonly seoTitle: string;
  readonly seoDescription: string;
}

export interface InventorySummary {
  readonly skuId: string;
  readonly skuCode: string;
  readonly productId: string;
  readonly productName: string;
  readonly optionLabel: string;
  readonly onHand: number;
  readonly reserved: number;
  readonly safetyStock: number;
  readonly available: number;
  readonly version: number;
  readonly updatedAt: string;
}

export type InventoryMovementReason =
  | "receiving"
  | "cycle-count"
  | "safety-stock"
  | "return-inspection";

export interface AdminOrderProjection {
  readonly id: string;
  readonly orderNumber: string;
  readonly customerName: string;
  readonly customerEmailMasked: string;
  readonly status:
    | "awaiting_payment"
    | "paid"
    | "processing"
    | "shipped"
    | "delivered"
    | "return_requested"
    | "refunded";
  readonly paymentStatus: "pending" | "paid" | "refunded" | "failed";
  readonly fulfillmentStatus: "unfulfilled" | "picking" | "shipped" | "delivered";
  readonly totalTwd: number;
  readonly itemCount: number;
  readonly createdAt: string;
}

export interface AdminDashboard {
  readonly productCount: number;
  readonly publishedProductCount: number;
  readonly draftProductCount: number;
  readonly lowStockSkuCount: number;
  readonly orderCount: number;
  readonly openOrderCount: number;
  readonly revenueTwd: number;
  readonly pendingReadinessCount: number;
  readonly recentOrders: readonly AdminOrderProjection[];
  readonly recentProducts: readonly AdminProductDraft[];
}

export interface OperationalRow {
  readonly id: string;
  readonly primary: string;
  readonly secondary: string;
  readonly status: string;
  readonly updatedAt: string;
}

export interface AdminMutationContext {
  readonly actor: AdminIdentity;
  readonly idempotencyKey: string;
  readonly expectedVersion?: number;
}

export interface AdminRepository {
  readonly mode: "demo" | "rpc" | "rpc-unavailable";
  getDashboard(): Promise<AdminDashboard>;
  listProducts(query?: string): Promise<readonly AdminProductDraft[]>;
  getProduct(id: string): Promise<AdminProductDraft | null>;
  createProduct(input: AdminProductInput, context: AdminMutationContext): Promise<AdminProductDraft>;
  updateProduct(
    id: string,
    input: AdminProductInput,
    context: AdminMutationContext,
  ): Promise<AdminProductDraft>;
  publishProduct(id: string, context: AdminMutationContext): Promise<AdminProductDraft>;
  archiveProduct(id: string, context: AdminMutationContext): Promise<AdminProductDraft>;
  upsertVariant(
    productId: string,
    input: AdminVariantInput,
    context: AdminMutationContext,
  ): Promise<AdminProductDraft>;
  addPrice(
    input: AdminPriceInput,
    context: AdminMutationContext,
  ): Promise<AdminProductDraft>;
  setReadiness(
    productId: string,
    code: string,
    state: AdminReadinessCheck["state"],
    evidenceReference: string | null,
    context: AdminMutationContext,
  ): Promise<AdminProductDraft>;
  linkMedia(
    productId: string,
    input: AdminMediaLinkInput,
    context: AdminMutationContext,
  ): Promise<AdminProductDraft>;
  transitionMedia(
    input: AdminMediaTransitionInput,
    context: AdminMutationContext,
  ): Promise<AdminMediaTransition>;
  listInventory(query?: string): Promise<readonly InventorySummary[]>;
  adjustInventory(
    skuId: string,
    delta: number,
    reason: InventoryMovementReason,
    context: AdminMutationContext,
  ): Promise<InventorySummary>;
  listOrders(): Promise<readonly AdminOrderProjection[]>;
  listOperationalRows(section: string): Promise<readonly OperationalRow[]>;
}

export interface AdminActionState<T = undefined> {
  readonly status: "idle" | "success" | "error";
  readonly message: string;
  readonly code?: string;
  readonly data?: T;
  readonly fieldErrors?: Readonly<Record<string, string>>;
}
