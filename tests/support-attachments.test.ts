import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET as downloadSupportAttachment } from "@/app/api/admin/support/cases/[caseId]/attachments/[attachmentId]/route";
import { GET as listSupportAttachmentRoute } from "@/app/api/admin/support/cases/[caseId]/attachments/route";
import { CommerceDomainError } from "@/lib/commerce/errors";
import {
  listSupportAttachments,
  parseSupportAttachmentDownloadDescriptor,
  supportAttachmentDownloadHeaders,
  type SupportAttachmentDownloadDescriptor,
} from "@/lib/media/support-attachments";

const origin = "http://localhost:3000";
const caseId = "case-0123456789abcdef0123";
const caseUuid = "23000000-0000-4000-8000-000000000001";
const attachmentId = "23000000-0000-4000-8000-000000000002";
const assetId = "23000000-0000-4000-8000-000000000003";
const sha256 = "a".repeat(64);
const fileName = `support-${caseId}-${sha256.slice(0, 12)}.webp`;
const originalMode = process.env.LIGNEE_MODE;

function descriptor(
  overrides: Partial<SupportAttachmentDownloadDescriptor> = {},
): SupportAttachmentDownloadDescriptor {
  return {
    attachmentId,
    assetId,
    caseId: caseUuid,
    casePublicId: caseId,
    sha256,
    objectPath: `support/${sha256}/1600.webp`,
    contentType: "image/webp",
    byteLength: 123_456,
    width: 1600,
    height: 1067,
    fileName,
    ...overrides,
  };
}

beforeEach(() => {
  process.env.LIGNEE_MODE = "demo";
});

afterEach(() => {
  if (originalMode === undefined) delete process.env.LIGNEE_MODE;
  else process.env.LIGNEE_MODE = originalMode;
});

describe("private support attachment boundary", () => {
  it("maps the AAL2 RPC list to same-origin download endpoints without leaking object paths", async () => {
    const calls: {
      name?: string;
      args?: Readonly<Record<string, unknown>>;
    } = {};
    const client = {
      schema: (schema: "api") => {
        expect(schema).toBe("api");
        return {
          rpc: async (
            name: string,
            args: Readonly<Record<string, unknown>>,
          ) => {
            calls.name = name;
            calls.args = args;
            return {
              data: {
                case: {
                  id: caseUuid,
                  publicId: caseId,
                  state: "open",
                  rowVersion: 4,
                },
                attachments: [
                  {
                    id: attachmentId,
                    assetId,
                    sha256,
                    contentType: "image/webp",
                    byteLength: 123_456,
                    width: 1600,
                    height: 1067,
                    fileName,
                    createdAt: "2026-07-28T01:02:03.000Z",
                  },
                ],
              },
              error: null,
            };
          },
        };
      },
    };

    const result = await listSupportAttachments(client, caseId);
    expect(calls).toEqual({
      name: "admin_support_attachments_list",
      args: { p_case_id: caseId },
    });
    expect(result.attachments[0]?.downloadPath).toBe(
      `/api/admin/support/cases/${caseId}/attachments/${attachmentId}`,
    );
    expect(JSON.stringify(result)).not.toContain("objectPath");
    expect(JSON.stringify(result)).not.toContain("signed");
  });

  it("rejects a resolver record that does not exactly match the requested private derivative", () => {
    expect(() =>
      parseSupportAttachmentDownloadDescriptor(
        descriptor({
          objectPath: `support/${"b".repeat(64)}/1600.webp`,
        }),
        { caseReference: caseId, attachmentId },
      ),
    ).toThrowError(CommerceDomainError);

    expect(() =>
      parseSupportAttachmentDownloadDescriptor(
        descriptor({ fileName: "../../case.webp" }),
        { caseReference: caseId, attachmentId },
      ),
    ).toThrowError(CommerceDomainError);
  });

  it("builds a forced-download response with no-store and nosniff", () => {
    const headers = supportAttachmentDownloadHeaders(descriptor());
    expect(headers.get("content-type")).toBe("image/webp");
    expect(headers.get("content-length")).toBe("123456");
    expect(headers.get("content-disposition")).toBe(
      `attachment; filename="${fileName}"`,
    );
    expect(headers.get("cache-control")).toContain("no-store");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(headers.get("content-security-policy")).toContain("sandbox");
  });

  it("serves a no-store empty list in local demo but never fabricates a download", async () => {
    const listResponse = await listSupportAttachmentRoute(
      new Request(
        `${origin}/api/admin/support/cases/${caseId}/attachments`,
        { headers: { "sec-fetch-site": "same-origin" } },
      ),
      { params: Promise.resolve({ caseId }) },
    );
    expect(listResponse.status).toBe(200);
    expect(listResponse.headers.get("cache-control")).toContain("no-store");
    expect(listResponse.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await listResponse.json()).toMatchObject({
      case: { publicId: caseId, state: "open", rowVersion: 1 },
      attachments: [],
    });

    const downloadResponse = await downloadSupportAttachment(
      new Request(
        `${origin}/api/admin/support/cases/${caseId}/attachments/${attachmentId}`,
        { headers: { "sec-fetch-site": "same-origin" } },
      ),
      { params: Promise.resolve({ caseId, attachmentId }) },
    );
    expect(downloadResponse.status).toBe(404);
    expect(downloadResponse.headers.get("cache-control")).toContain("no-store");
    expect(downloadResponse.headers.get("x-content-type-options")).toBe(
      "nosniff",
    );
  });

  it("rejects cross-site reads before any private lookup", async () => {
    const response = await listSupportAttachmentRoute(
      new Request(
        `${origin}/api/admin/support/cases/${caseId}/attachments`,
        { headers: { "sec-fetch-site": "cross-site" } },
      ),
      { params: Promise.resolve({ caseId }) },
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "SUPPORT_ATTACHMENT_CROSS_SITE_REJECTED" },
    });
  });
});
