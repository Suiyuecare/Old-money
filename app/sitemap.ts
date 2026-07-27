import type { MetadataRoute } from "next";

import { getCommerceEnvironment } from "@/lib/commerce/config";

export default function sitemap(): MetadataRoute.Sitemap {
  const environment = getCommerceEnvironment();
  if (!environment.controls.searchIndexEnabled) return [];
  // The shared DB/Edge safety read is not provisioned. Even if an environment
  // is misconfigured, do not emit an indexable sitemap until it exists.
  return [];
}

