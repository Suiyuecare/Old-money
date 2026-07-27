import type { MetadataRoute } from "next";
import { getCommerceEnvironmentWithRuntimeControls } from "@/lib/commerce/runtime-environment";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const environment =
    await getCommerceEnvironmentWithRuntimeControls();
  if (!environment.controls.searchIndexEnabled) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
    };
  }

  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/api/", "/checkout/", "/orders/"],
    }],
    sitemap: `${environment.canonicalOrigin}/sitemap.xml`,
  };
}
