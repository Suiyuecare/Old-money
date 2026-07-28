import {
  categoryMetadata,
  collections,
  products as estateProducts,
  skus as estateSkus,
} from "@/lib/catalog";
import { parseEstateNo01CatalogDocument } from "@/lib/catalog-schema";

import {
  parsePublicCatalogSnapshot,
  type PublicCatalogSnapshot,
} from "./contracts";

const ESTATE_NO_01_GENERATED_AT = "2026-07-24T00:00:00.000Z";

/**
 * Client-safe factory for the locked Estate No. 01 migration fixture.
 *
 * This module deliberately has no dependency on the server-only digest or
 * repository adapters so storefront client bundles never resolve Node APIs.
 */
export function createEstateNo01Snapshot(): PublicCatalogSnapshot {
  const fixture = parseEstateNo01CatalogDocument({
    products: estateProducts,
    skus: estateSkus,
  });
  const publicProducts = fixture.products.map(
    ({ launchGateCodes, ...product }) => {
      void launchGateCodes;
      return product;
    },
  );
  return parsePublicCatalogSnapshot({
    schemaVersion: 1,
    revision: "1",
    generatedAt: ESTATE_NO_01_GENERATED_AT,
    products: publicProducts,
    skus: fixture.skus,
    media: [],
    categories: categoryMetadata.map((category) => ({
      code: category.id,
      nameEn: category.englishLabel,
      nameZh: category.label,
      description: category.description,
      routeSegment: category.routeSegment,
      sortOrder: category.order,
    })),
    chapters: collections.map((chapter, index) => ({
      code: chapter.id,
      titleEn: chapter.name,
      titleZh: chapter.subtitle,
      description: chapter.description,
      routeSegment: chapter.id,
      sortOrder: index + 1,
    })),
  });
}
