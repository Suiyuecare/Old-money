import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assetManifest,
  assetManifestSummary,
  getAssetManifestEntryByPath,
  privateAnchorManifest,
} from "@/content/asset-manifest";
import { products } from "@/lib/catalog";
import { estateCollections, estateJournalEntries } from "@/lib/editorial";
import {
  categoryHeroAssets,
  lookbookAssets,
} from "@/lib/visual-inventory";

const workspaceRoot = resolve(import.meta.dirname, "..");

describe("visual inventory governance", () => {
  it("locks the required 150-public-asset role split", () => {
    expect(assetManifest).toHaveLength(150);
    expect(assetManifestSummary).toEqual({
      productMain: 50,
      productDetail: 50,
      estateLifestyle: 24,
      tennisLifestyle: 12,
      categories: 10,
      storyHeroes: 4,
      publicTotal: 150,
      privateIdentitySources: 8,
    });
    expect(new Set(assetManifest.map(({ id }) => id))).toHaveLength(150);
  });

  it("has one main and one detail record for every product", () => {
    for (const product of products) {
      expect(assetManifest).toContainEqual(
        expect.objectContaining({
          role: "product-main",
          productId: product.id,
          skuId: product.image.picturedSkuId,
          variants: expect.objectContaining({ webp: product.image.path }),
        }),
      );
      expect(assetManifest).toContainEqual(
        expect.objectContaining({
          role: "product-detail",
          productId: product.id,
          skuId: product.image.picturedSkuId,
          variants: expect.objectContaining({ webp: product.image.detailPath }),
        }),
      );
    }
  });

  it("keeps both public encodings present, hashed, dimensioned, and launch-gated", () => {
    for (const asset of assetManifest) {
      expect(asset.status).toBe("sandbox_review");
      expect(asset.visibility).toBe("public");
      expect(asset.rights).toEqual({
        state: "internal-sandbox-only",
        finalClearanceRequired: true,
      });
      expect(asset.qa.humanFinalApproval).toBe(false);
      expect(asset.qa.physicalProductMatch).toBe(false);
      expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(asset.avifSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(asset.width).toBeGreaterThanOrEqual(900);
      expect(asset.height).toBeGreaterThanOrEqual(900);
      expect(asset.alt.trim().length).toBeGreaterThan(0);
      expect(asset.focus.x).toBeGreaterThanOrEqual(0);
      expect(asset.focus.x).toBeLessThanOrEqual(1);
      expect(asset.focus.y).toBeGreaterThanOrEqual(0);
      expect(asset.focus.y).toBeLessThanOrEqual(1);

      for (const variantPath of Object.values(asset.variants)) {
        expect(variantPath).toMatch(/^\/images\/[a-z0-9/-]+\.(?:webp|avif)$/);
        const filePath = resolve(workspaceRoot, "public", variantPath.slice(1));
        expect(existsSync(filePath), variantPath).toBe(true);
        expect(statSync(filePath).isFile(), variantPath).toBe(true);
        expect(statSync(filePath).size, variantPath).toBeGreaterThan(0);
      }

      const webpBytes = readFileSync(
        resolve(workspaceRoot, "public", asset.variants.webp.slice(1)),
      );
      expect(webpBytes.toString("ascii", 0, 4)).toBe("RIFF");
      expect(webpBytes.toString("ascii", 8, 12)).toBe("WEBP");
      const avifBytes = readFileSync(
        resolve(workspaceRoot, "public", asset.variants.avif.slice(1)),
      );
      expect(avifBytes.toString("ascii", 4, 12)).toMatch(/^ftyp(?:avif|avis)$/);
    }

    const webpHashes = assetManifest.map((asset) =>
      createHash("sha256")
        .update(
          readFileSync(
            resolve(workspaceRoot, "public", asset.variants.webp.slice(1)),
          ),
        )
        .digest("hex"),
    );
    const avifHashes = assetManifest.map((asset) =>
      createHash("sha256")
        .update(
          readFileSync(
            resolve(workspaceRoot, "public", asset.variants.avif.slice(1)),
          ),
        )
        .digest("hex"),
    );
    expect(new Set(webpHashes)).toHaveLength(150);
    expect(new Set(avifHashes)).toHaveLength(150);
  });

  it("documents optional ignored private sources without requiring them in a clone", () => {
    expect(privateAnchorManifest).toHaveLength(8);
    expect(new Set(privateAnchorManifest.map(({ id }) => id))).toHaveLength(8);
    for (const anchor of privateAnchorManifest) {
      expect(anchor.visibility).toBe("private");
      expect(anchor.ignoredLocalPath).toMatch(/^\.private\/visual-anchors\//);
      expect(anchor.publicServingAllowed).toBe(false);
      expect(anchor.finalApproval).toBe(false);
      expect(anchor.status).toBe("generated-internal-sandbox-source");
      expect(existsSync(resolve(workspaceRoot, "public", anchor.ignoredLocalPath))).toBe(
        false,
      );
    }

    const validAnchorIds = new Set(
      privateAnchorManifest.map((anchor) => anchor.id),
    );
    for (const asset of assetManifest.filter((entry) =>
      entry.role.endsWith("lifestyle"),
    )) {
      expect(Array.isArray(asset.personReferenceIds)).toBe(true);
      expect(new Set(asset.personReferenceIds).size).toBe(
        asset.personReferenceIds.length,
      );
      expect(asset.containsPeople).toBe(asset.personReferenceIds.length > 0);
      for (const anchorId of asset.personReferenceIds) {
        expect(validAnchorIds.has(anchorId), `${asset.id}: ${anchorId}`).toBe(
          true,
        );
      }
    }
  });

  it("references every lifestyle and responsive category asset from reachable UI", () => {
    expect(lookbookAssets).toHaveLength(36);
    expect(new Set(lookbookAssets.map((asset) => asset.id))).toHaveLength(36);
    expect(
      lookbookAssets.filter((asset) => asset.role === "estate-lifestyle"),
    ).toHaveLength(24);
    expect(
      lookbookAssets.filter((asset) => asset.role === "tennis-lifestyle"),
    ).toHaveLength(12);

    const categoryReferences = Object.values(categoryHeroAssets).flatMap(
      ({ desktop, mobile }) => [desktop, mobile],
    );
    expect(categoryReferences).toHaveLength(10);
    expect(new Set(categoryReferences.map((asset) => asset.id))).toHaveLength(10);
    expect(categoryReferences.every((asset) => asset.role === "category")).toBe(true);

    for (const editorialImage of [
      ...estateCollections.map((entry) => entry.image),
      ...estateJournalEntries.map((entry) => entry.image),
    ]) {
      expect(
        getAssetManifestEntryByPath(editorialImage),
        `unmanifested editorial image ${editorialImage}`,
      ).toBeDefined();
    }
  });
});
