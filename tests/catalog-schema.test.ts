import { describe, expect, it } from "vitest";
import { parseCatalogDocument, productSchema, skuSchema } from "@/lib/catalog-schema";
import { products, skus } from "@/lib/catalog";

describe("catalog Zod boundary", () => {
  it("accepts the canonical catalog", () => {
    const parsed = parseCatalogDocument({ products, skus });
    expect(parsed.products).toHaveLength(27);
    expect(parsed.skus).toHaveLength(155);
  });

  it("rejects unsafe product identifiers and invalid prices", () => {
    const candidate = {
      ...products[0],
      id: "../unsafe",
      basePriceTwd: -1,
    };
    expect(productSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects unknown SKU option keys", () => {
    const candidate = {
      ...skus[0],
      options: { ...skus[0].options, invented: "value" },
    };
    expect(skuSchema.safeParse(candidate).success).toBe(false);
  });
});
