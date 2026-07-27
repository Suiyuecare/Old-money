import { assetManifest, type AssetManifestEntry } from "@/content/asset-manifest";
import type { CategoryId } from "@/lib/catalog";

export const lookbookAssets: readonly AssetManifestEntry[] = Object.freeze(
  assetManifest.filter(
    (asset) =>
      asset.role === "estate-lifestyle" || asset.role === "tennis-lifestyle",
  ),
);

const requireAsset = (path: string): AssetManifestEntry => {
  const asset = assetManifest.find(
    (candidate) =>
      candidate.variants.webp === path || candidate.variants.avif === path,
  );
  if (!asset) throw new Error(`Missing governed visual inventory record for ${path}.`);
  return asset;
};

export interface CategoryHeroPair {
  readonly desktop: AssetManifestEntry;
  readonly mobile: AssetManifestEntry;
}

export const categoryHeroAssets: Readonly<Record<CategoryId, CategoryHeroPair>> =
  Object.freeze(
    Object.fromEntries(
      (["apparel", "accessories", "home", "stationery", "tennis"] as const).map(
        (category) => [
          category,
          Object.freeze({
            desktop: requireAsset(`/images/categories/${category}-desktop.webp`),
            mobile: requireAsset(`/images/categories/${category}-mobile.webp`),
          }),
        ],
      ),
    ) as Record<CategoryId, CategoryHeroPair>,
  );

