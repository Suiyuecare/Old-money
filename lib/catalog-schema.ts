import { z } from "zod";

const identifier = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const nonEmptyText = z.string().trim().min(1);
const positiveTwd = z.number().int().positive();

export const categoryIdSchema = z.enum([
  "apparel",
  "accessories",
  "home",
  "stationery",
]);

export const audienceIdSchema = z.enum(["men", "women", "unisex"]);

export const collectionIdSchema = z.enum([
  "first-light-in-the-field",
  "the-conservatory-hour",
  "after-rain-the-library",
  "dinner-at-the-long-table",
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
]);

const productKindSchema = z.enum([
  "polo-shirt",
  "oxford-shirt",
  "knitwear",
  "blazer",
  "tailored-trousers",
  "bermuda-shorts",
  "long-dress",
  "belt",
  "watch",
  "tote",
  "briefcase",
  "sunglasses",
  "tie",
  "hosiery",
  "earrings",
  "scented-candle",
  "diffuser",
  "bed-linen",
  "throw",
  "mug",
  "glassware",
  "wooden-tray",
  "vase",
  "notebook",
  "ballpoint-pen",
  "desk-tray",
  "journal-planner",
]);

const materialConceptSchema = z.enum([
  "cotton-pique",
  "oxford-cotton",
  "fine-knit",
  "tailored-wool",
  "cotton-twill",
  "draped-weave",
  "leather-concept",
  "steel-concept",
  "canvas-weave",
  "acetate-concept",
  "silk-weave",
  "sheer-knit",
  "pearl-concept",
  "wax-blend",
  "fragrance-oil",
  "woven-cotton",
  "wool-blend",
  "glazed-ceramic",
  "crystalline-glass",
  "ash-wood",
  "stoneware-concept",
  "archival-paper",
  "brass-concept",
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
  alt: nonEmptyText,
  picturedSkuId: identifier,
});

export const productSchema = z.strictObject({
  id: identifier,
  slug: identifier,
  name: nonEmptyText,
  subtitle: nonEmptyText,
  kind: productKindSchema,
  category: categoryIdSchema,
  audience: audienceIdSchema,
  collectionId: collectionIdSchema,
  basePriceTwd: positiveTwd,
  optionAxes: z.array(optionAxisSchema).min(1),
  materialConcepts: z.array(materialConceptSchema).min(1),
  description: nonEmptyText,
  story: nonEmptyText,
  sizing: nonEmptyText,
  care: nonEmptyText,
  image: productImageSchema,
  relatedProductIds: z.array(identifier),
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
  productId: identifier,
  options: skuOptionsSchema,
  priceTwd: positiveTwd.optional(),
  displayStatus: z.enum(["preview", "available", "unavailable"]),
  representativeAssetId: identifier,
});

export const catalogDocumentSchema = z.strictObject({
  products: z.array(productSchema).length(27),
  skus: z.array(skuSchema).min(27),
});

export function parseCatalogDocument(input: unknown) {
  return catalogDocumentSchema.parse(input);
}
