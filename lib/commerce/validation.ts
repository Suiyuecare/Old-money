import { z } from "zod";

import { invoiceOptionSchema } from "@/lib/providers/invoice-schema";

export const taiwanMainIslandAddressSchema = z
  .strictObject({
    postalCode: z.string().regex(/^\d{3,6}$/),
    city: z.string().trim().min(2).max(10),
    district: z.string().trim().min(2).max(12),
    addressLine: z.string().trim().min(5).max(120),
  })
  .superRefine((address, context) => {
    if (["澎湖縣", "金門縣", "連江縣"].includes(address.city)) {
      context.addIssue({
        code: "custom",
        path: ["city"],
        message: "V1 僅配送台灣本島。",
      });
    }
  });

export const checkoutContactSchema = z.strictObject({
  recipientName: z.string().trim().min(1).max(60),
  email: z.string().email().max(254),
  mobile: z.string().regex(/^09\d{8}$/),
  shippingAddress: taiwanMainIslandAddressSchema,
  invoice: invoiceOptionSchema,
  note: z.string().trim().max(300).optional(),
  gift: z
    .strictObject({
      enabled: z.boolean(),
      message: z.string().trim().max(120),
    })
    .optional(),
});

const distinctSkuLines = <T extends z.ZodType<{ readonly skuId: string }>>(
  lineSchema: T,
) =>
  z
    .array(lineSchema)
    .min(1)
    .max(10)
    .superRefine((lines, context) => {
      const seen = new Set<string>();
      for (const [index, line] of lines.entries()) {
        if (seen.has(line.skuId)) {
          context.addIssue({
            code: "custom",
            path: [index, "skuId"],
            message: "Each SKU must appear exactly once.",
          });
        }
        seen.add(line.skuId);
      }
    });

const quoteLineSchema = z.strictObject({
  skuId: z.string().min(1).max(180),
  quantity: z.number().int().min(1).max(3),
  lastSeenPriceVersion: z.string().max(80).optional(),
  lastSeenUnitPriceTwd: z.number().int().nonnegative().optional(),
});

export const quoteRequestSchema = z.strictObject({
  lines: distinctSkuLines(quoteLineSchema),
});

export const acceptedQuoteRequestSchema = z.strictObject({
  lines: distinctSkuLines(
    z.strictObject({
      skuId: z.string().min(1).max(180),
      quantity: z.number().int().min(1).max(3),
      lastSeenPriceVersion: z.string().min(1).max(80),
      lastSeenUnitPriceTwd: z.number().int().nonnegative(),
      acceptedQuoteDigest: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
});

export const idempotencyKeySchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
