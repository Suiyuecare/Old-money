import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ASSET_GENERATED_AT,
  ASSET_SOURCE,
  ASSET_STATUS,
  PROMPT_AUDIT_PROVENANCE,
  assetManifest,
  assetManifestSummary,
} from "@/content/asset-manifest";
import { products } from "@/lib/catalog";
import { estateCollections, estateJournalEntries } from "@/lib/editorial";

const WORKSPACE_ROOT = resolve(import.meta.dirname, "..");

function readWebpDimensions(filePath: string): {
  width: number;
  height: number;
} {
  const bytes = readFileSync(filePath);
  expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
  expect(bytes.toString("ascii", 8, 12)).toBe("WEBP");

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = bytes.toString("ascii", offset, offset + 4);
    const chunkLength = bytes.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;

    if (chunkType === "VP8 ") {
      return {
        width: bytes.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: bytes.readUInt16LE(dataOffset + 8) & 0x3fff,
      };
    }

    if (chunkType === "VP8L") {
      const packed = bytes.readUInt32LE(dataOffset + 1);
      return {
        width: (packed & 0x3fff) + 1,
        height: ((packed >>> 14) & 0x3fff) + 1,
      };
    }

    if (chunkType === "VP8X") {
      return {
        width: bytes.readUIntLE(dataOffset + 4, 3) + 1,
        height: bytes.readUIntLE(dataOffset + 7, 3) + 1,
      };
    }

    offset = dataOffset + chunkLength + (chunkLength % 2);
  }

  throw new Error(`No WebP image dimension chunk found in ${filePath}`);
}

describe("asset governance manifest", () => {
  it("covers exactly the canonical 27 product and 8 editorial images", () => {
    expect(assetManifest).toHaveLength(35);
    expect(assetManifestSummary).toEqual({
      productImages: 27,
      editorialImages: 8,
      totalImages: 35,
    });

    const expectedPaths = [
      ...products.map((product) => product.image.path),
      ...estateCollections.map((collection) => collection.image),
      ...estateJournalEntries.map((entry) => entry.image),
    ];

    expect(assetManifest.map((asset) => asset.path)).toEqual(expectedPaths);
  });

  it("keeps identity, paths, provenance, and governance fields complete", () => {
    expect(new Set(assetManifest.map((asset) => asset.id)).size).toBe(35);
    expect(new Set(assetManifest.map((asset) => asset.path)).size).toBe(35);
    expect(new Set(assetManifest.map((asset) => asset.promptHash)).size).toBe(35);

    for (const asset of assetManifest) {
      expect(asset.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(asset.path).toMatch(/^\/images\/(products|editorial)\/[a-z0-9-]+\.webp$/);
      expect(asset.source).toBe(ASSET_SOURCE);
      expect(asset.status).toBe(ASSET_STATUS);
      expect(asset.generatedAt).toBe(ASSET_GENERATED_AT);
      expect(asset.promptSource).toMatch(
        /^canonical-copy:lib\/(catalog|editorial)\.ts#[a-z0-9-]+$/,
      );
      expect(asset.promptHash).toMatch(/^audit-id:[a-z0-9-]+:2026-07-22$/);
      expect(asset.promptHashProvenance).toBe(PROMPT_AUDIT_PROVENANCE);
      expect(asset.alt.trim().length).toBeGreaterThan(0);
      expect(asset.notes).toContain("AI-generated fictional");
      expect(asset.notes).toContain("Human visual review");
      expect(asset.notes).toContain("no recognizable public-person reference");
      expect(asset.notes).toContain("third-party logo");
      expect(asset.notes).toContain("not");
      expect(asset.notes).toContain("real");
      expect(asset.qa.status).toBe(ASSET_STATUS);
      expect(asset.qa.method).toBe("human visual review");
      expect(Object.values(asset.qa.checklist).every(Boolean)).toBe(true);
      expect(asset.qa.limitations.length).toBeGreaterThan(40);
      expect(asset.originalWidth).toBeGreaterThan(0);
      expect(asset.originalHeight).toBeGreaterThan(0);
      expect(asset.fileSizeBytes).toBeGreaterThan(0);
      expect(["4:5", "3:2"]).toContain(asset.displayAspectRatio);
      expect(asset.focus.x).toBeGreaterThanOrEqual(0);
      expect(asset.focus.x).toBeLessThanOrEqual(1);
      expect(asset.focus.y).toBeGreaterThanOrEqual(0);
      expect(asset.focus.y).toBeLessThanOrEqual(1);
    }
  });

  it("maps depicted product, collection, journal, and SKU IDs without ambiguity", () => {
    const productAssets = assetManifest.filter((asset) => asset.type === "product");
    const editorialAssets = assetManifest.filter((asset) => asset.type === "editorial");

    expect(productAssets).toHaveLength(27);
    expect(editorialAssets).toHaveLength(8);

    for (const product of products) {
      const asset = productAssets.find((item) => item.depictedProductId === product.id);
      expect(asset).toMatchObject({
        id: product.image.assetId,
        path: product.image.path,
        depictedCollectionId: product.collectionId,
        depictedJournalId: null,
        depictedSkuId: product.image.picturedSkuId,
      });
    }

    for (const collection of estateCollections) {
      expect(editorialAssets).toContainEqual(
        expect.objectContaining({
          path: collection.image,
          depictedProductId: null,
          depictedCollectionId: collection.id,
          depictedJournalId: null,
          depictedSkuId: null,
        }),
      );
    }

    for (const entry of estateJournalEntries) {
      expect(editorialAssets).toContainEqual(
        expect.objectContaining({
          path: entry.image,
          depictedProductId: null,
          depictedCollectionId: entry.collectionId,
          depictedJournalId: entry.id,
          depictedSkuId: null,
        }),
      );
    }
  });

  it("matches every local WebP, its true dimensions, and its exact byte size", () => {
    const localPaths = ["products", "editorial"].flatMap((directory) =>
      readdirSync(resolve(WORKSPACE_ROOT, "public", "images", directory))
        .filter((name) => name.endsWith(".webp"))
        .map((name) => `/images/${directory}/${name}`),
    );

    expect([...localPaths].sort()).toEqual(
      [...assetManifest.map((asset) => asset.path)].sort(),
    );

    for (const asset of assetManifest) {
      const filePath = resolve(WORKSPACE_ROOT, "public", asset.path.slice(1));
      expect(existsSync(filePath), asset.path).toBe(true);
      expect(statSync(filePath).isFile(), asset.path).toBe(true);
      expect(statSync(filePath).size, asset.path).toBe(asset.fileSizeBytes);

      const dimensions = readWebpDimensions(filePath);
      expect(dimensions.width, asset.path).toBe(asset.originalWidth);
      expect(dimensions.height, asset.path).toBe(asset.originalHeight);
    }
  });

  it("keeps optimized file sizes within the launch ceilings", () => {
    for (const asset of assetManifest) {
      const ceiling = asset.type === "product" ? 350_000 : 500_000;
      expect(asset.fileSizeBytes, asset.path).toBeLessThanOrEqual(ceiling);

      if (asset.type === "product") {
        expect(
          { width: asset.originalWidth, height: asset.originalHeight },
          asset.path,
        ).toEqual({ width: 1_600, height: 2_000 });
      } else {
        expect(Math.max(asset.originalWidth, asset.originalHeight), asset.path).toBe(2_400);
      }
    }
  });
});
