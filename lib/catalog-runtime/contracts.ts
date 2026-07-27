import { z } from "zod";

import {
  productSchema,
  skuSchema,
} from "@/lib/catalog-schema";

export const PUBLIC_CATALOG_SCHEMA_VERSION = 1 as const;

const identifier = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const isoDateTime = z.string().datetime();
const nonNegativeInteger = z.number().int().nonnegative();
const positiveInteger = z.number().int().positive();
const revisionString = z.string().regex(/^(?:0|[1-9]\d*)$/);

type DeepReadonly<T> = T extends readonly (infer Entry)[]
  ? readonly DeepReadonly<Entry>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T;

export const publishedProductSchema = productSchema.omit({
  launchGateCodes: true,
});
export type PublishedProduct = DeepReadonly<
  z.infer<typeof publishedProductSchema>
>;

export const publishedSkuSchema = skuSchema;
export type PublishedSKU = DeepReadonly<z.infer<typeof publishedSkuSchema>>;

export const publishedMediaSchema = z.strictObject({
  productId: identifier,
  assetId: z.string().regex(/^[a-f0-9]{64}$/),
  path: z
    .string()
    .regex(/^\/media\/[a-f0-9]{64}\/(?:800|1200|1600)\.(?:webp|avif)$/),
  role: z.enum(["main", "detail", "gallery"]),
  sortOrder: positiveInteger,
  alt: z.string().trim().min(1).max(240),
  focalX: z.number().min(0).max(1),
  focalY: z.number().min(0).max(1),
  picturedSkuId: identifier.nullable(),
  approvalStatus: z.literal("approved"),
});
export type PublishedMedia = DeepReadonly<
  z.infer<typeof publishedMediaSchema>
>;

export const publishedCategorySchema = z.strictObject({
  code: identifier,
  nameEn: z.string().trim().min(1).max(120),
  nameZh: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(1_000),
  routeSegment: identifier,
  sortOrder: positiveInteger,
});
export type PublishedCategory = DeepReadonly<
  z.infer<typeof publishedCategorySchema>
>;

export const publishedChapterSchema = z.strictObject({
  code: identifier,
  titleEn: z.string().trim().min(1).max(160),
  titleZh: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(2_000),
  routeSegment: identifier,
  sortOrder: positiveInteger,
});
export type PublishedChapter = DeepReadonly<
  z.infer<typeof publishedChapterSchema>
>;

const publicCatalogSnapshotObjectSchema = z
  .strictObject({
    schemaVersion: z.literal(PUBLIC_CATALOG_SCHEMA_VERSION),
    revision: revisionString,
    generatedAt: isoDateTime,
    products: z.array(publishedProductSchema),
    skus: z.array(publishedSkuSchema),
    // Estate No. 01 predates the normalized gallery contract. Missing media
    // therefore means an empty set, while new publications carry immutable
    // approved main/detail/gallery records.
    media: z.array(publishedMediaSchema).default([]),
    categories: z.array(publishedCategorySchema).default([]),
    chapters: z.array(publishedChapterSchema).default([]),
  })
  .superRefine((snapshot, context) => {
    const productIds = new Set<string>();
    const categoryCodes = new Set(
      snapshot.categories.map((category) => category.code),
    );
    const chapterCodes = new Set(
      snapshot.chapters.map((chapter) => chapter.code),
    );
    const productCodes = new Set<string>();
    const slugs = new Set<string>();
    for (const [index, product] of snapshot.products.entries()) {
      for (const [value, seen, label] of [
        [product.id, productIds, "product id"],
        [product.productCode, productCodes, "product code"],
        [product.slug, slugs, "product slug"],
      ] as const) {
        if (seen.has(value)) {
          context.addIssue({
            code: "custom",
            path: ["products", index],
            message: `Duplicate ${label}: ${value}.`,
          });
        }
        seen.add(value);
      }
      if (
        snapshot.categories.length > 0 &&
        !categoryCodes.has(product.category)
      ) {
        context.addIssue({
          code: "custom",
          path: ["products", index, "category"],
          message: `Product references an unknown category: ${product.category}.`,
        });
      }
      if (
        snapshot.chapters.length > 0 &&
        !chapterCodes.has(product.collectionId)
      ) {
        context.addIssue({
          code: "custom",
          path: ["products", index, "collectionId"],
          message: `Product references an unknown chapter: ${product.collectionId}.`,
        });
      }
    }

    const skuIds = new Set<string>();
    const skuCodes = new Set<string>();
    const skuProductIds = new Map<string, string>();
    const productIdsWithSkus = new Set<string>();
    for (const [index, sku] of snapshot.skus.entries()) {
      if (skuIds.has(sku.id)) {
        context.addIssue({
          code: "custom",
          path: ["skus", index, "id"],
          message: `Duplicate SKU id: ${sku.id}.`,
        });
      }
      if (skuCodes.has(sku.skuCode)) {
        context.addIssue({
          code: "custom",
          path: ["skus", index, "skuCode"],
          message: `Duplicate SKU code: ${sku.skuCode}.`,
        });
      }
      if (!productIds.has(sku.productId)) {
        context.addIssue({
          code: "custom",
          path: ["skus", index, "productId"],
          message: `SKU ${sku.id} references an unknown product.`,
        });
      }
      skuIds.add(sku.id);
      skuCodes.add(sku.skuCode);
      skuProductIds.set(sku.id, sku.productId);
      productIdsWithSkus.add(sku.productId);
    }

    for (const [index, product] of snapshot.products.entries()) {
      if (
        skuProductIds.get(product.image.picturedSkuId) !== product.id
      ) {
        context.addIssue({
          code: "custom",
          path: ["products", index, "image", "picturedSkuId"],
          message: `Product ${product.id} references an invalid pictured SKU.`,
        });
      }
      if (!productIdsWithSkus.has(product.id)) {
        context.addIssue({
          code: "custom",
          path: ["products", index],
          message: `Product ${product.id} has no published SKU.`,
        });
      }
      if (
        new Set(product.relatedProductIds).size !==
        product.relatedProductIds.length
      ) {
        context.addIssue({
          code: "custom",
          path: ["products", index, "relatedProductIds"],
          message: `Product ${product.id} has duplicate related products.`,
        });
      }
      for (const relatedProductId of product.relatedProductIds) {
        if (!productIds.has(relatedProductId) || relatedProductId === product.id) {
          context.addIssue({
            code: "custom",
            path: ["products", index, "relatedProductIds"],
            message: `Product ${product.id} has an invalid related product.`,
          });
        }
      }
    }

    const mediaCoordinates = new Set<string>();
    for (const [index, media] of snapshot.media.entries()) {
      if (!productIds.has(media.productId)) {
        context.addIssue({
          code: "custom",
          path: ["media", index, "productId"],
          message: `Media references an unknown product: ${media.productId}.`,
        });
      }
      if (
        media.picturedSkuId !== null &&
        skuProductIds.get(media.picturedSkuId) !== media.productId
      ) {
        context.addIssue({
          code: "custom",
          path: ["media", index, "picturedSkuId"],
          message: "Media pictured SKU does not belong to its product.",
        });
      }
      if (!media.path.startsWith(`/media/${media.assetId}/`)) {
        context.addIssue({
          code: "custom",
          path: ["media", index, "path"],
          message: "Media path does not match its content digest.",
        });
      }
      const coordinate =
        `${media.productId}\u0000${media.role}\u0000${media.sortOrder}`;
      if (mediaCoordinates.has(coordinate)) {
        context.addIssue({
          code: "custom",
          path: ["media", index],
          message: "Media role/sort coordinates must be unique.",
        });
      }
      mediaCoordinates.add(coordinate);
    }
  });

/**
 * PostgREST may deserialize a bigint JSON value as a safe number. The public
 * contract normalizes it to a decimal string so catalog revisions cannot lose
 * precision as the sequence grows.
 */
export const publicCatalogSnapshotSchema = z.preprocess((input) => {
  const unwrapped =
    Array.isArray(input) && input.length === 1 ? input[0] : input;
  if (
    unwrapped &&
    typeof unwrapped === "object" &&
    "revision" in unwrapped
  ) {
    const revision = (unwrapped as { readonly revision?: unknown }).revision;
    if (
      (typeof revision === "number" &&
        Number.isSafeInteger(revision) &&
        revision >= 0) ||
      typeof revision === "bigint"
    ) {
      return { ...unwrapped, revision: String(revision) };
    }
  }
  return unwrapped;
}, publicCatalogSnapshotObjectSchema);

export type PublicCatalogSnapshot = DeepReadonly<
  z.infer<typeof publicCatalogSnapshotObjectSchema>
>;

export const adminProductDraftSchema = productSchema.extend({
  schemaVersion: z.literal(1),
  rowVersion: nonNegativeInteger,
  workflowStatus: z.enum(["draft", "ready-for-review", "approved", "archived"]),
  updatedAt: isoDateTime,
  updatedBy: z.string().uuid(),
});
export type AdminProductDraft = DeepReadonly<
  z.infer<typeof adminProductDraftSchema>
>;

export const productPublicationSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  productId: identifier,
  publicationRevision: positiveInteger,
  status: z.enum(["published", "superseded", "withdrawn"]),
  product: publishedProductSchema,
  skus: z.array(publishedSkuSchema).min(1),
  publishedAt: isoDateTime,
  publishedBy: z.string().uuid(),
});
export type ProductPublication = DeepReadonly<
  z.infer<typeof productPublicationSchema>
>;

export const inventorySummarySchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    skuId: identifier,
    onHand: nonNegativeInteger,
    reserved: nonNegativeInteger,
    safetyStock: nonNegativeInteger,
    available: nonNegativeInteger,
    rowVersion: nonNegativeInteger,
    updatedAt: isoDateTime,
  })
  .superRefine((inventory, context) => {
    const expectedAvailable = Math.max(
      0,
      inventory.onHand - inventory.reserved - inventory.safetyStock,
    );
    if (inventory.available !== expectedAvailable) {
      context.addIssue({
        code: "custom",
        path: ["available"],
        message: "Available inventory does not match the ledger projection.",
      });
    }
  });
export type InventorySummary = DeepReadonly<
  z.infer<typeof inventorySummarySchema>
>;

const orderMoneySchema = z.strictObject({
  merchandiseGrossTwd: nonNegativeInteger,
  shippingGrossTwd: nonNegativeInteger,
  grossTwd: nonNegativeInteger,
  netTwd: nonNegativeInteger,
  taxTwd: nonNegativeInteger,
});

export const adminOrderProjectionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  publicId: z.string().trim().min(1).max(64),
  merchantTradeNo: z.string().trim().min(1).max(64).nullable(),
  status: z.enum([
    "awaiting_payment",
    "paid",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
    "closed",
    "partially_refunded",
    "refunded",
  ]),
  customerEmailMasked: z.string().trim().min(3).max(254),
  currency: z.literal("TWD"),
  totals: orderMoneySchema,
  paymentStatus: z.enum([
    "not_started",
    "pending",
    "paid",
    "failed",
    "partially_refunded",
    "refunded",
  ]),
  invoiceStatus: z.enum([
    "not_requested",
    "pending",
    "issued",
    "voided",
    "allowance_issued",
    "failed",
  ]),
  fulfillmentStatus: z.enum([
    "unfulfilled",
    "picking",
    "packed",
    "shipped",
    "delivered",
    "returned",
  ]),
  rowVersion: nonNegativeInteger,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type AdminOrderProjection = DeepReadonly<
  z.infer<typeof adminOrderProjectionSchema>
>;

export function parsePublicCatalogSnapshot(
  input: unknown,
): PublicCatalogSnapshot {
  return publicCatalogSnapshotSchema.parse(input);
}
