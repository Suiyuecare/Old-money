import { requireAdminRole, getAdminAuthClient } from "@/lib/admin/auth";
import { CommerceDomainError } from "@/lib/commerce/errors";
import { noStoreJson } from "@/lib/http";
import { mediaErrorResponse } from "@/lib/media/http";
import {
  demoSupportAttachmentList,
  listSupportAttachments,
  parseSupportCaseReference,
} from "@/lib/media/support-attachments";

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
    readonly params: Promise<{ readonly caseId: string }>;
  },
) {
  try {
    assertNotCrossSite(request);
    const identity = await requireAdminRole(["owner", "support"]);
    const { caseId: rawCaseId } = await context.params;
    const caseId = parseSupportCaseReference(rawCaseId);
    const attachments = identity.demo
      ? demoSupportAttachmentList(caseId)
      : await listSupportAttachments(await getAdminAuthClient(), caseId);
    const response = noStoreJson(attachments);
    response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  } catch (error) {
    const response = mediaErrorResponse(error);
    response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  }
}
