import { requireAdminRole } from "@/lib/admin/auth";
import type { AdminRole } from "@/lib/admin/types";
import {
  createUploadIntentSchema,
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
      createUploadIntentSchema,
      16_384,
    );
    // requireAdminRole re-reads the current user, verified TOTP factors, AAL2
    // level, active membership, role, and server-side session context.
    const identity = await requireAdminRole(allowedRoles(input.scope));
    const pipeline = await getRequestMediaPipeline();
    const intent = await pipeline.createUploadIntent(
      mediaActorFromAdmin(identity),
      input,
    );
    return noStoreJson({ uploadIntent: intent }, { status: 201 });
  } catch (error) {
    return mediaErrorResponse(error);
  }
}
