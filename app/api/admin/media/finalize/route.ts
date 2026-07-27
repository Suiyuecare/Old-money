import { requireAdminRole } from "@/lib/admin/auth";
import type { AdminRole } from "@/lib/admin/types";
import {
  finalizeUploadSchema,
  type MediaScope,
} from "@/lib/media/contracts";
import { mediaErrorResponse } from "@/lib/media/http";
import {
  getRequestMediaPipeline,
  mediaActorFromAdmin,
} from "@/lib/media/service";
import { assertSameOrigin, noStoreJson, parseBoundedJson } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function allowedRoles(scope: MediaScope): readonly AdminRole[] {
  return scope === "product"
    ? (["owner", "merchandiser"] as const)
    : (["owner", "support"] as const);
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = await parseBoundedJson(
      request,
      finalizeUploadSchema,
      16_384,
    );
    // This is intentionally repeated at finalize time. A signed upload grant
    // never substitutes for current AAL2, membership, role, or session checks.
    const identity = await requireAdminRole(allowedRoles(input.scope));
    const pipeline = await getRequestMediaPipeline();
    const finalized = await pipeline.finalizeUpload(
      mediaActorFromAdmin(identity),
      input,
    );
    return noStoreJson({ media: finalized });
  } catch (error) {
    return mediaErrorResponse(error);
  }
}
