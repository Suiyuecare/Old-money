import { z } from "zod";

const identifier = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const nonEmptyText = z.string().trim().min(1);
const positiveTwd = z.number().int().positive();

export const categoryIdSchema = z.enum([
  "apparel",
  "accessories",
  "home",
  "stationery",
  "tennis",
]);

export const audienceIdSchema = z.enum(["men", "women", "unisex"]);

export const collectionIdSchema = z.enum([
  "first-light-in-the-field",
  "the-conservatory-hour",
  "after-rain-the-library",
  "dinner-at-the-long-table",
  "the-private-court",
]);

export const productOptionKeySchema = z.enum([
  "size",
  "color",
  "format",
  "finish",
  "capacity",
  "scent",
  "set",
  "ink",
  "grip",
]);

const optionValueSchema = z.strictObject({
  value: nonEmptyText,
  label: nonEmptyText,
});

const optionAxisSchema = z.strictObject({
  key: productOptionKeySchema,
  label: nonEmptyText,
  values: z.array(optionValueSchema).min(1),
});

const productImageSchema = z.strictObject({
  assetId: identifier,
  path: z.string().regex(/^\/images\/products\/[a-z0-9-]+\.webp$/),
  detailPath: z.string().regex(/^\/images\/product-details\/[a-z0-9-]+-detail\.webp$/),
  alt: nonEmptyText,
  picturedSkuId: identifier,
  approvalStatus: z.literal("requires-approval"),
});

export const productSchema = z.strictObject({
  id: identifier,
  productCode: z.string().regex(/^LIG-ENO1-\d{3}$/),
  launchPosition: z.number().int().min(1).max(50),
  slug: identifier,
  name: nonEmptyText,
  subtitle: nonEmptyText,
  kind: nonEmptyText,
  category: categoryIdSchema,
  audience: audienceIdSchema,
  collectionId: collectionIdSchema,
  basePriceTwd: positiveTwd,
  priceStatus: z.literal("sandbox-draft"),
  taxIncluded: z.literal(true),
  launchStatus: z.literal("sandbox-ready"),
  purchasableInDemo: z.literal(true),
  purchasableInProduction: z.literal(false),
  optionAxes: z.array(optionAxisSchema).min(1),
  materialConcepts: z.array(identifier).min(1),
  description: nonEmptyText,
  story: nonEmptyText,
  sizing: nonEmptyText,
  care: nonEmptyText,
  image: productImageSchema,
  relatedProductIds: z.array(identifier).length(3),
  launchGateCodes: z.array(identifier).min(1),
});

const skuOptionsSchema = z.record(z.string(), nonEmptyText).superRefine((options, context) => {
  for (const key of Object.keys(options)) {
    if (!productOptionKeySchema.safeParse(key).success) {
      context.addIssue({
        code: "custom",
        path: [key],
        message: `Unknown product option key: ${key}`,
      });
    }
  }
});

export const skuSchema = z.strictObject({
  id: identifier,
  skuCode: z.string().regex(/^LIG-ENO1-\d{3}-\d{2}$/),
  productId: identifier,
  options: skuOptionsSchema,
  priceTwd: positiveTwd.optional(),
  priceVersion: z.literal("sandbox-2026-07-24-v1"),
  taxIncluded: z.literal(true),
  displayStatus: z.enum(["preview", "available", "unavailable"]),
  representativeAssetId: identifier,
  factsStatus: z.literal("requires-approval"),
  weightGrams: z.null(),
  packageDimensionsMm: z.null(),
  enabledInProduction: z.literal(false),
});

export const catalogDocumentSchema = z.strictObject({
  products: z.array(productSchema).length(50),
  skus: z.array(skuSchema).min(50),
});

export function parseCatalogDocument(input: unknown) {
  return catalogDocumentSchema.parse(input);
}
