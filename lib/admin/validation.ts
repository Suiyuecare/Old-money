import { z } from "zod";

import type {
  AdminMediaLinkInput,
  AdminPriceInput,
  AdminProductInput,
  AdminReadinessCheck,
  AdminVariantInput,
  InventoryMovementReason,
} from "./types";

const slug = z
  .string()
  .trim()
  .min(3, "至少需要 3 個字元。")
  .max(80, "最多 80 個字元。")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "只能使用小寫英文、數字與連字號。");

const text = (label: string, max: number) =>
  z.string().trim().min(1, `請填寫${label}。`).max(max, `${label}不可超過 ${max} 字。`);

const identifier = z.string().trim().min(1).max(80).regex(
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  "代碼只能使用小寫英文、數字與連字號。",
);
const optionAxisSchema = z.strictObject({
  key: identifier,
  label: z.string().trim().min(1).max(80),
  values: z.array(z.strictObject({
    value: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(120),
  })).min(1).max(50),
});

export const adminProductInputSchema = z.strictObject({
  slug,
  name: text("英文名稱", 120),
  subtitle: text("中文名稱", 120),
  category: text("分類", 48),
  audience: z.enum(["men", "women", "unisex"], "請選擇適用對象。"),
  collectionId: text("系列", 80),
  kind: text("商品種類", 80),
  description: text("商品描述", 1200),
  story: text("品牌故事", 2000),
  sizing: text("尺寸說明", 1000),
  care: text("照護方式", 1000),
  materialConcepts: z.array(identifier).max(20),
  optionAxes: z.array(optionAxisSchema).max(8),
  launchGateCodes: z.array(identifier).min(1).max(30),
  relatedProductIds: z.array(identifier).max(12),
  seoTitle: text("SEO 標題", 120),
  seoDescription: text("SEO 描述", 240),
});

function parseIdentifierList(
  value: FormDataEntryValue | null,
  field: string,
): string[] {
  const source = typeof value === "string" ? value : "";
  const values = [...new Set(
    source
      .split(/[\s,，]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  )];
  const parsed = z.array(identifier).max(field === "relatedProductIds" ? 12 : 30).safeParse(values);
  if (parsed.success) return parsed.data;
  throw new z.ZodError(parsed.error.issues.map((issue) => ({
    ...issue,
    path: [field, ...issue.path],
  })));
}

function parseOptionAxes(value: FormDataEntryValue | null) {
  const source = typeof value === "string" && value.trim() ? value.trim() : "[]";
  try {
    return z.array(optionAxisSchema).max(8).parse(JSON.parse(source));
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new z.ZodError(error.issues.map((issue) => ({
        ...issue,
        path: ["optionAxes", ...issue.path],
      })));
    }
    throw new z.ZodError([{
      code: "custom",
      path: ["optionAxes"],
      message: "規格軸必須是有效 JSON。",
    }]);
  }
}

export const inventoryMovementSchema = z.strictObject({
  skuId: text("SKU", 160),
  delta: z.coerce.number().int("異動數量須為整數。").min(-10000).max(10000).refine((value) => value !== 0, "異動數量不可為零。"),
  reason: z.enum(["receiving", "cycle-count", "safety-stock", "return-inspection"]),
  expectedVersion: z.coerce.number().int().positive(),
});

const nullablePositiveInteger = z.preprocess(
  (value) => value === "" || value === null ? null : value,
  z.coerce.number().int().positive().nullable(),
);

const optionalVersion = z.preprocess(
  (value) => value === "" || value === null ? undefined : value,
  z.coerce.number().int().positive().optional(),
);

const optionValuesSchema = z
  .record(z.string().trim().min(1).max(48), z.string().trim().min(1).max(120))
  .refine((value) => Object.keys(value).length <= 8, "規格軸最多 8 個。");

function parseOptions(value: FormDataEntryValue | null): Readonly<Record<string, string>> {
  const source = z.string().trim().min(2, "請輸入 JSON 規格。").max(2000).parse(value);
  try {
    return optionValuesSchema.parse(JSON.parse(source));
  } catch (error) {
    if (error instanceof z.ZodError) throw error;
    throw new z.ZodError([{
      code: "custom",
      path: ["options"],
      message: "規格必須是有效 JSON，例如 {\"size\":\"M\",\"colour\":\"Olive\"}。",
    }]);
  }
}

export const adminVariantInputSchema = z.strictObject({
  variantId: z.preprocess(
    (value) => value === "" || value === null ? undefined : value,
    z.string().trim().min(1).max(160).optional(),
  ),
  expectedVariantVersion: optionalVersion,
  publicId: z.string().trim().min(3).max(120).regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
    "Public ID 只能使用英數字、句點、底線與連字號。",
  ),
  skuCode: z.preprocess(
    (value) => value === "" || value === null ? undefined : value,
    z.string().trim().min(3).max(80).regex(/^[A-Z0-9-]+$/, "SKU Code 只能使用大寫英數字與連字號。").optional(),
  ),
  options: optionValuesSchema,
  weightGrams: nullablePositiveInteger,
  packageDimensionsMm: z.strictObject({
    length: nullablePositiveInteger,
    width: nullablePositiveInteger,
    height: nullablePositiveInteger,
  }).transform((value, context) => {
    const values = [value.length, value.width, value.height];
    if (values.every((item) => item === null)) return null;
    if (values.some((item) => item === null)) {
      context.addIssue({
        code: "custom",
        message: "包裝長、寬、高須全部填寫，或全部留白。",
      });
      return z.NEVER;
    }
    return {
      length: value.length as number,
      width: value.width as number,
      height: value.height as number,
    };
  }),
  factsStatus: z.enum(["requires-approval", "approved"]),
  enabled: z.boolean(),
});

function optionalDateTime(value: FormDataEntryValue | null): string | null {
  if (value === "" || value === null) return null;
  const source = z.string().trim().max(40).parse(value);
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) {
    throw new z.ZodError([{
      code: "custom",
      path: ["validFrom"],
      message: "請輸入有效日期時間。",
    }]);
  }
  return date.toISOString();
}

export const adminPriceInputSchema = z.strictObject({
  variantId: z.string().trim().min(1).max(160),
  expectedVariantVersion: z.coerce.number().int().positive(),
  grossTwd: z.coerce.number().int().min(1).max(10_000_000),
  status: z.enum(["sandbox-draft", "approved"]),
  validFrom: z.string().datetime().nullable(),
  validUntil: z.string().datetime().nullable(),
}).superRefine((input, context) => {
  if (input.status === "approved" && !input.validFrom) {
    context.addIssue({
      code: "custom",
      path: ["validFrom"],
      message: "核准價格必須設定生效時間。",
    });
  }
  if (
    input.validFrom
    && input.validUntil
    && new Date(input.validUntil).getTime() <= new Date(input.validFrom).getTime()
  ) {
    context.addIssue({
      code: "custom",
      path: ["validUntil"],
      message: "結束時間必須晚於生效時間。",
    });
  }
});

export const readinessCodeSchema = z.enum([
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
]);

export const readinessInputSchema = z.strictObject({
  code: readinessCodeSchema,
  state: z.enum(["pending", "passed", "failed"]),
  evidenceReference: z.preprocess(
    (value) => value === "" || value === null ? null : value,
    z.string().trim().max(500).nullable(),
  ),
});

const safeEntityId = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._-]+$/);
const publicMediaPath = z.string().trim().regex(
  /^\/media\/[a-f0-9]{64}\/(800|1200|1600)\.(webp|avif)$/,
  "請使用已處理的同源 /media/{sha}/{variant} 路徑。",
);

export const adminMediaLinkInputSchema = z.strictObject({
  linkId: z.preprocess(
    (value) => value === "" || value === null ? undefined : value,
    safeEntityId.optional(),
  ),
  expectedLinkVersion: optionalVersion,
  assetId: safeEntityId,
  role: z.enum(["main", "detail", "gallery"]),
  sortOrder: z.coerce.number().int().min(1).max(1000),
  alt: text("圖片替代文字", 240),
  focalX: z.coerce.number().min(0).max(1),
  focalY: z.coerce.number().min(0).max(1),
  picturedSkuId: z.preprocess(
    (value) => value === "" || value === null ? null : value,
    safeEntityId.nullable(),
  ),
  publicPath: publicMediaPath,
});

export function productInputFromFormData(formData: FormData): AdminProductInput {
  return adminProductInputSchema.parse({
    slug: formData.get("slug"),
    name: formData.get("name"),
    subtitle: formData.get("subtitle"),
    category: formData.get("category"),
    audience: formData.get("audience"),
    collectionId: formData.get("collectionId"),
    kind: formData.get("kind"),
    description: formData.get("description"),
    story: formData.get("story"),
    sizing: formData.get("sizing"),
    care: formData.get("care"),
    materialConcepts: parseIdentifierList(formData.get("materialConcepts"), "materialConcepts"),
    optionAxes: parseOptionAxes(formData.get("optionAxes")),
    launchGateCodes: parseIdentifierList(formData.get("launchGateCodes"), "launchGateCodes"),
    relatedProductIds: parseIdentifierList(formData.get("relatedProductIds"), "relatedProductIds"),
    seoTitle: formData.get("seoTitle"),
    seoDescription: formData.get("seoDescription"),
  });
}

export function inventoryMovementFromFormData(formData: FormData): {
  skuId: string;
  delta: number;
  reason: InventoryMovementReason;
  expectedVersion: number;
} {
  return inventoryMovementSchema.parse({
    skuId: formData.get("skuId"),
    delta: formData.get("delta"),
    reason: formData.get("reason"),
    expectedVersion: formData.get("expectedVersion"),
  });
}

export function variantInputFromFormData(formData: FormData): AdminVariantInput {
  return adminVariantInputSchema.parse({
    variantId: formData.get("variantId"),
    expectedVariantVersion: formData.get("expectedVariantVersion"),
    publicId: formData.get("publicId"),
    skuCode: formData.get("skuCode"),
    options: parseOptions(formData.get("options")),
    weightGrams: formData.get("weightGrams"),
    packageDimensionsMm: {
      length: formData.get("packageLengthMm"),
      width: formData.get("packageWidthMm"),
      height: formData.get("packageHeightMm"),
    },
    factsStatus: formData.get("factsStatus"),
    enabled: formData.get("enabled") === "on",
  });
}

export function priceInputFromFormData(formData: FormData): AdminPriceInput {
  return adminPriceInputSchema.parse({
    variantId: formData.get("variantId"),
    expectedVariantVersion: formData.get("expectedVariantVersion"),
    grossTwd: formData.get("grossTwd"),
    status: formData.get("status"),
    validFrom: optionalDateTime(formData.get("validFrom")),
    validUntil: optionalDateTime(formData.get("validUntil")),
  });
}

export function readinessInputFromFormData(formData: FormData): {
  readonly code: string;
  readonly state: AdminReadinessCheck["state"];
  readonly evidenceReference: string | null;
} {
  return readinessInputSchema.parse({
    code: formData.get("code"),
    state: formData.get("state"),
    evidenceReference: formData.get("evidenceReference"),
  });
}

export function mediaLinkInputFromFormData(formData: FormData): AdminMediaLinkInput {
  return adminMediaLinkInputSchema.parse({
    linkId: formData.get("linkId"),
    expectedLinkVersion: formData.get("expectedLinkVersion"),
    assetId: formData.get("assetId"),
    role: formData.get("role"),
    sortOrder: formData.get("sortOrder"),
    alt: formData.get("alt"),
    focalX: formData.get("focalX"),
    focalY: formData.get("focalY"),
    picturedSkuId: formData.get("picturedSkuId"),
    publicPath: formData.get("publicPath"),
  });
}
