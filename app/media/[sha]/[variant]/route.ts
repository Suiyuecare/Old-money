import { CommerceDomainError } from "@/lib/commerce/errors";
import { canServePublicMedia } from "@/lib/commerce/readiness";
import { getCommerceEnvironmentWithRuntimeControls } from "@/lib/commerce/runtime-environment";
import {
  downloadPublicMedia,
  resolvePublicMedia,
} from "@/lib/media/public-delivery";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ readonly sha: string; readonly variant: string }> },
) {
  try {
    const { sha, variant } = await context.params;
    const [descriptor, environment] = await Promise.all([
      resolvePublicMedia({
        sha256: sha,
        variant,
      }),
      getCommerceEnvironmentWithRuntimeControls(),
    ]);
    if (!descriptor) return mediaError(404, "PUBLIC_MEDIA_NOT_FOUND");
    const readiness = canServePublicMedia(environment, {
      edgeBeforeCacheVerified: true,
      revisionMatches:
        descriptor.mediaSafetyRevision ===
        environment.controls.mediaSafetyRevision,
      status: "live_approved",
      tombstoned: descriptor.tombstoned,
    });
    if (!readiness.allowed) {
      return mediaError(503, readiness.code);
    }

    const bytes = await downloadPublicMedia(descriptor);
    const responseBody = new Uint8Array(bytes.byteLength);
    responseBody.set(bytes);
    return new Response(responseBody.buffer, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
        "Content-Length": String(bytes.byteLength),
        "Content-Type": descriptor.contentType,
        "Cross-Origin-Resource-Policy": "same-origin",
        ETag: `"sha256-${descriptor.sha256}-${descriptor.variant}-r${descriptor.mediaSafetyRevision}"`,
        "X-Content-Type-Options": "nosniff",
        "X-Lignee-Media-Revision": String(descriptor.mediaSafetyRevision),
        "X-Robots-Tag": "noindex, noarchive",
      },
    });
  } catch (error) {
    if (error instanceof CommerceDomainError) {
      return mediaError(error.httpStatus, error.code);
    }
    return mediaError(503, "PUBLIC_MEDIA_UNAVAILABLE");
  }
}

function mediaError(status: number, code: string): Response {
  return new Response(null, {
    status,
    headers: {
      "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Lignee-Media-Gate": code,
      "X-Robots-Tag": "noindex, noarchive",
    },
  });
}
