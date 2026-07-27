import rawInventory from "./asset-inventory.generated.json";
import privateAnchorRegistry from "./private-anchor-registry.json";

export type AssetRole =
  | "product-main"
  | "product-detail"
  | "estate-lifestyle"
  | "tennis-lifestyle"
  | "category"
  | "story-hero";

export interface AssetManifestEntry {
  readonly id: string;
  readonly version: number;
  readonly source:
    | "imagegen-private-anchor-source-v3"
    | "imagegen-private-anchor-source-v4"
    | "imagegen-product-source-v3"
    | "existing-local-sandbox-source";
  readonly visibility: "public";
  readonly role: AssetRole;
  readonly status: "sandbox_review";
  readonly sha256: string;
  readonly avifSha256: string;
  readonly masterReference: "launch-gated-source-master";
  readonly variants: {
    readonly webp: string;
    readonly avif: string;
  };
  readonly productId: string | null;
  readonly skuId: string | null;
  readonly categoryId: string | null;
  readonly collectionId: string | null;
  readonly containsPeople: boolean;
  readonly personReferenceIds: readonly string[];
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: string;
  readonly focus: { readonly x: number; readonly y: number };
  readonly alt: string;
  readonly promptAudit: {
    readonly promptId: string;
    readonly generatedAt: "2026-07-24";
  };
  readonly rights: {
    readonly state: "internal-sandbox-only";
    readonly finalClearanceRequired: true;
  };
  readonly qa: {
    readonly automatedDimensions: true;
    readonly automatedHash: true;
    readonly humanFinalApproval: false;
    readonly physicalProductMatch: false;
  };
  readonly bytes: number;
  readonly avifBytes: number;
}

interface AssetInventoryDocument {
  readonly generatedAt: "2026-07-24";
  readonly publicAssetCount: 150;
  readonly entries: readonly AssetManifestEntry[];
}

const inventory = rawInventory as AssetInventoryDocument;

if (inventory.publicAssetCount !== 150 || inventory.entries.length !== 150) {
  throw new Error("LIGNÉE public visual inventory must contain exactly 150 records.");
}

export const assetManifest: readonly AssetManifestEntry[] = Object.freeze(
  inventory.entries,
);

const assetManifestByPath = new Map<string, AssetManifestEntry>();
for (const asset of assetManifest) {
  assetManifestByPath.set(asset.variants.webp, asset);
  assetManifestByPath.set(asset.variants.avif, asset);
}

export function getAssetManifestEntryByPath(
  path: string,
): AssetManifestEntry | undefined {
  return assetManifestByPath.get(path);
}

const countRole = (role: AssetRole): number =>
  assetManifest.filter((asset) => asset.role === role).length;

export const assetManifestSummary = Object.freeze({
  productMain: countRole("product-main"),
  productDetail: countRole("product-detail"),
  estateLifestyle: countRole("estate-lifestyle"),
  tennisLifestyle: countRole("tennis-lifestyle"),
  categories: countRole("category"),
  storyHeroes: countRole("story-hero"),
  publicTotal: assetManifest.length,
  privateIdentitySources: 8,
});

export interface PrivateAnchorManifestEntry {
  readonly id: string;
  readonly visibility: "private";
  readonly ignoredLocalPath: string;
  readonly sha256: string;
  readonly status: "generated-internal-sandbox-source";
  readonly publicServingAllowed: false;
  readonly finalApproval: false;
}

/**
 * These records document the eight locally generated identity sources without
 * serving or committing them. A clean clone may omit the ignored files; the
 * optional private-asset gate validates local custody when they are present.
 */
export const privateAnchorManifest: readonly PrivateAnchorManifestEntry[] =
  Object.freeze(
    privateAnchorRegistry.anchors.map((anchor) => ({
      ...anchor,
      visibility: "private" as const,
      status: "generated-internal-sandbox-source" as const,
      publicServingAllowed: false as const,
      finalApproval: false as const,
    })),
  );
