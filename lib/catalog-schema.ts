import { z } from "zod";

const identifier = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const nonEmptyText = z.string().trim().min(1);
const positiveTwd = z.number().int().positive();
const productCode = z.string().regex(/^LIG-(?:ENO1-\d{3}|\d{6,})$/);
const skuCode = z
  .string()
  .regex(/^LIG-(?:ENO1-\d{3}|\d{6,})-\d{2,3}$/);

export const estateNo01CategoryIdSchema = z.enum([
  "apparel",
  "accessories",
  "home",
  "stationery",
  "tennis",
]);
export const categoryIdSchema = identifier;

export const audienceIdSchema = z.enum(["men", "women", "unisex"]);

export const estateNo01CollectionIdSchema = z.enum([
  "first-light-in-the-field",
  "the-conservatory-hour",
  "after-rain-the-library",
  "dinner-at-the-long-table",
  "the-private-court",
]);
export const collectionIdSchema = identifier;

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

export const optionValueSchema = z.strictObject({
  value: nonEmptyText,
  label: nonEmptyText,
});

export const optionAxisSchema = z.strictObject({
  key: productOptionKeySchema,
  label: nonEmptyText,
  values: z.array(optionValueSchema).min(1),
});

export const productImageSchema = z.strictObject({
  assetId: identifier,
  path: z
    .string()
    .regex(
      /^\/(?:images\/products\/[a-z0-9-]+\.webp|media\/[a-f0-9]{64}\/[a-z0-9-]+\.(?:webp|avif))$/,
    ),
  detailPath: z
    .string()
    .regex(
      /^\/(?:images\/product-details\/[a-z0-9-]+-detail\.webp|media\/[a-f0-9]{64}\/[a-z0-9-]+\.(?:webp|avif))$/,
    ),
  alt: nonEmptyText,
  picturedSkuId: identifier,
  approvalStatus: z.enum([
    "sandbox-draft",
    "requires-approval",
    "approved",
  ]),
});

export const productSchema = z.strictObject({
  id: identifier,
  productCode,
  launchPosition: z.number().int().min(1),
  slug: identifier,
  name: nonEmptyText,
  subtitle: nonEmptyText,
  kind: nonEmptyText,
  category: categoryIdSchema,
  audience: audienceIdSchema,
  collectionId: collectionIdSchema,
  basePriceTwd: positiveTwd,
  priceStatus: z.enum(["sandbox-draft", "approved"]),
  taxIncluded: z.literal(true),
  launchStatus: z.enum(["sandbox-ready", "published", "archived"]),
  purchasableInDemo: z.boolean(),
  purchasableInProduction: z.boolean(),
  optionAxes: z.array(optionAxisSchema).min(1),
  materialConcepts: z.array(identifier).min(1),
  description: nonEmptyText,
  story: nonEmptyText,
  sizing: nonEmptyText,
  care: nonEmptyText,
  image: productImageSchema,
  relatedProductIds: z.array(identifier).max(12),
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
  skuCode,
  productId: identifier,
  options: skuOptionsSchema,
  priceTwd: positiveTwd.optional(),
  priceVersion: nonEmptyText,
  taxIncluded: z.literal(true),
  displayStatus: z.enum(["preview", "available", "unavailable"]),
  representativeAssetId: identifier,
  factsStatus: z.enum(["requires-approval", "approved"]),
  weightGrams: z.number().int().positive().nullable(),
  packageDimensionsMm: z
    .strictObject({
      length: z.number().int().positive(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .nullable(),
  enabledInProduction: z.boolean(),
});

export const catalogDocumentSchema = z.strictObject({
  products: z.array(productSchema),
  skus: z.array(skuSchema),
});

export function parseCatalogDocument(input: unknown) {
  return catalogDocumentSchema.parse(input);
}

/**
 * Estate No. 01 remains a locked migration fixture. Runtime catalogs use the
 * schemas above and are intentionally not limited to this launch assortment.
 */
export const estateNo01ProductSchema = productSchema.extend({
  productCode: z.string().regex(/^LIG-ENO1-\d{3}$/),
  launchPosition: z.number().int().min(1).max(50),
  category: estateNo01CategoryIdSchema,
  collectionId: estateNo01CollectionIdSchema,
  priceStatus: z.literal("sandbox-draft"),
  launchStatus: z.literal("sandbox-ready"),
  purchasableInDemo: z.literal(true),
  purchasableInProduction: z.literal(false),
  image: productImageSchema.extend({
    path: z.string().regex(/^\/images\/products\/[a-z0-9-]+\.webp$/),
    detailPath: z
      .string()
      .regex(/^\/images\/product-details\/[a-z0-9-]+-detail\.webp$/),
    approvalStatus: z.literal("requires-approval"),
  }),
  relatedProductIds: z.array(identifier).length(3),
});

export const estateNo01SkuSchema = skuSchema.extend({
  skuCode: z.string().regex(/^LIG-ENO1-\d{3}-\d{2}$/),
  priceVersion: z.literal("sandbox-2026-07-24-v1"),
  factsStatus: z.literal("requires-approval"),
  weightGrams: z.null(),
  packageDimensionsMm: z.null(),
  enabledInProduction: z.literal(false),
});

export const estateNo01CatalogDocumentSchema = z.strictObject({
  products: z.array(estateNo01ProductSchema).length(50),
  skus: z.array(estateNo01SkuSchema).length(189),
});

export function parseEstateNo01CatalogDocument(input: unknown) {
  return estateNo01CatalogDocumentSchema.parse(input);
}
