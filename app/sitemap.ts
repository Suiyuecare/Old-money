import type { MetadataRoute } from "next";

import { getCatalogSnapshot } from "@/lib/commerce/container";
import { getCommerceEnvironmentWithRuntimeControls } from "@/lib/commerce/runtime-environment";
import { estateJournalEntries } from "@/lib/editorial";

export const dynamic = "force-dynamic";

const storefrontRoutes = [
  "",
  "/shop",
  "/men",
  "/women",
  "/accessories",
  "/home",
  "/stationery",
  "/tennis",
  "/collections",
  "/journal",
  "/story",
  "/care-repair",
  "/shipping-returns",
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const environment =
    await getCommerceEnvironmentWithRuntimeControls();
  if (!environment.controls.searchIndexEnabled) return [];

  const snapshot = await getCatalogSnapshot();
  const lastModified = new Date(snapshot.generatedAt);
  const base = environment.canonicalOrigin;
  return [
    ...storefrontRoutes.map((path) => ({
      url: `${base}${path}`,
      lastModified,
      changeFrequency: "weekly" as const,
    })),
    ...snapshot.products.map((product) => ({
      url: `${base}/product/${product.slug}`,
      lastModified,
      changeFrequency: "weekly" as const,
    })),
    ...snapshot.categories.map((category) => ({
      url: `${base}/category/${category.routeSegment}`,
      lastModified,
      changeFrequency: "weekly" as const,
    })),
    ...snapshot.chapters.map((chapter) => ({
      url: `${base}/collections/${chapter.routeSegment}`,
      lastModified,
      changeFrequency: "monthly" as const,
    })),
    ...estateJournalEntries.map((entry) => ({
      url: `${base}${entry.href}`,
      lastModified,
      changeFrequency: "monthly" as const,
    })),
  ];
}
