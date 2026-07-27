import { requireAdminRole, getAdminAuthClient } from "@/lib/admin/auth";
import { CommerceDomainError } from "@/lib/commerce/errors";
import { mediaErrorResponse } from "@/lib/media/http";
import {
  downloadPrivateSupportAttachment,
  parseSupportAttachmentId,
  parseSupportCaseReference,
  resolveSupportAttachmentDownload,
  supportAttachmentDownloadHeaders,
} from "@/lib/media/support-attachments";
import { getMediaStorageBindings } from "@/lib/media/storage";
import { getPrivilegedSupabaseClient } from "@/lib/supabase/request-clients";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function assertNotCrossSite(request: Request): void {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new CommerceDomainError(
      "SUPPORT_ATTACHMENT_CROSS_SITE_REJECTED",
      "Cross-site support attachment reads are not allowed.",
      403,
    );
  }
}

export async function GET(
  request: Request,
  context: {
    readonly params: Promise<{
      readonly caseId: string;
      readonly attachmentId: string;
    }>;
  },
) {
  try {
    assertNotCrossSite(request);
    const identity = await requireAdminRole(["owner", "support"]);
    const params = await context.params;
    const caseId = parseSupportCaseReference(params.caseId);
    const attachmentId = parseSupportAttachmentId(params.attachmentId);
    if (identity.demo) {
      throw new CommerceDomainError(
        "SUPPORT_ATTACHMENT_NOT_FOUND",
        "Demo mode does not persist private support attachments.",
        404,
      );
    }

    // The administrator JWT resolves one allowlisted Storage coordinate only
    // after the database repeats AAL2, active-membership, role and revocation
    // checks. The privileged key is used solely for this server-side download.
    const descriptor = await resolveSupportAttachmentDownload(
      await getAdminAuthClient(),
      {
        caseReference: caseId,
        attachmentId,
      },
    );
    const object = await downloadPrivateSupportAttachment(
      getPrivilegedSupabaseClient(),
      getMediaStorageBindings().supportAttachmentBucket,
      descriptor,
      request.signal,
    );
    return new Response(object.stream(), {
      status: 200,
      headers: supportAttachmentDownloadHeaders(descriptor),
    });
  } catch (error) {
    const response = mediaErrorResponse(error);
    response.headers.set(
      "Cache-Control",
      "private, no-store, no-cache, max-age=0, must-revalidate",
    );
    response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  }
}
