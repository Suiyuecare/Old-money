import { afterEach, describe, expect, it } from "vitest";

import {
  listAdminTaxonomy,
  upsertAdminTaxonomy,
} from "@/lib/admin/taxonomy";

const originalMode = process.env.LIGNEE_MODE;

afterEach(() => {
  if (originalMode === undefined) delete process.env.LIGNEE_MODE;
  else process.env.LIGNEE_MODE = originalMode;
});

describe("admin taxonomy contracts", () => {
  it("persists public descriptions and independent route segments", async () => {
    process.env.LIGNEE_MODE = "demo";
    const code = "country-sports";
    const created = await upsertAdminTaxonomy(
      "category",
      null,
      null,
      {
        code,
        nameEn: "Country Sports",
        nameZh: "莊園運動",
        description: "為草地球場與莊園週末設計的當代服飾與配件。",
        routeSegment: "estate-sport",
        sortOrder: 60,
      },
      {
        idempotencyKey: "taxonomy-country-sports-create",
        requestHash: "a".repeat(64),
      },
    );

    expect(created).toMatchObject({
      code,
      description: "為草地球場與莊園週末設計的當代服飾與配件。",
      routeSegment: "estate-sport",
    });
    expect(
      (await listAdminTaxonomy("category")).find(
        (item) => item.code === code,
      ),
    ).toEqual(created);
  });
});
