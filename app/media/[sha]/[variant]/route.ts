import { assetManifest } from "@/content/asset-manifest";
import { getCommerceEnvironment } from "@/lib/commerce/config";
import { canServePublicMedia } from "@/lib/commerce/readiness";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ readonly sha: string; readonly variant: string }> },
) {
  const { sha, variant } = await context.params;
  const asset = assetManifest.find(
    (candidate) =>
      candidate.sha256 === sha &&
      (variant === "webp" || variant === "avif"),
  );
  if (!asset) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    });
  }
  const readiness = canServePublicMedia(getCommerceEnvironment(), {
    edgeBeforeCacheVerified: false,
    revisionMatches: false,
    status: asset.status,
    tombstoned: false,
  });
  return new Response(null, {
    status: readiness.allowed ? 500 : 503,
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      "X-Lignee-Media-Gate": readiness.code,
    },
  });
}

