import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { CommerceDomainError } from "@/lib/commerce/errors";

const maximumAttachmentBytes = 20 * 1024 * 1024;
const supportCasePublicIdSchema = z
  .string()
  .regex(/^case-[a-f0-9]{20}$/);
const uuidSchema = z.string().uuid();
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const safeFileNameSchema = z
  .string()
  .regex(/^support-case-[a-f0-9]{20}-[a-f0-9]{12}\.webp$/);

export const supportCaseReferenceSchema = z.union([
  supportCasePublicIdSchema,
  uuidSchema,
]);
export const supportAttachmentIdSchema = uuidSchema;

const attachmentMetadataSchema = z.strictObject({
  id: uuidSchema,
  assetId: uuidSchema,
  sha256: sha256Schema,
  contentType: z.literal("image/webp"),
  byteLength: z.number().int().positive().max(maximumAttachmentBytes),
  width: z.literal(1600),
  height: z.number().int().positive().max(100_000),
  fileName: safeFileNameSchema,
  createdAt: z.string().datetime({ offset: true }),
});

const attachmentListSchema = z.preprocess(
  unwrapSingleRpcRow,
  z.strictObject({
    case: z.strictObject({
      id: uuidSchema,
      publicId: supportCasePublicIdSchema,
      state: z.enum(["open", "resolved"]),
      rowVersion: z.number().int().positive(),
    }),
    attachments: z.array(attachmentMetadataSchema).max(1_000),
  }),
);

const downloadDescriptorSchema = z.preprocess(
  unwrapSingleRpcRow,
  z.strictObject({
    attachmentId: uuidSchema,
    assetId: uuidSchema,
    caseId: uuidSchema,
    casePublicId: supportCasePublicIdSchema,
    sha256: sha256Schema,
    objectPath: z
      .string()
      .regex(/^support\/[a-f0-9]{64}\/1600\.webp$/),
    contentType: z.literal("image/webp"),
    byteLength: z.number().int().positive().max(maximumAttachmentBytes),
    width: z.literal(1600),
    height: z.number().int().positive().max(100_000),
    fileName: safeFileNameSchema,
  }),
);

interface RpcErrorLike {
  readonly code?: string;
  readonly message?: string;
  readonly details?: string;
  readonly hint?: string;
}

interface RpcResult {
  readonly data: unknown;
  readonly error: RpcErrorLike | null;
}

interface AuthenticatedRpcClient {
  schema(name: "api"): {
    rpc(
      name: string,
      args: Readonly<Record<string, unknown>>,
    ): PromiseLike<RpcResult>;
  };
}

export interface SupportAttachmentMetadata {
  readonly id: string;
  readonly assetId: string;
  readonly sha256: string;
  readonly contentType: "image/webp";
  readonly byteLength: number;
  readonly width: 1600;
  readonly height: number;
  readonly fileName: string;
  readonly createdAt: string;
  readonly downloadPath: string;
}

export interface SupportAttachmentList {
  readonly case: {
    readonly id: string;
    readonly publicId: string;
    readonly state: "open" | "resolved";
    readonly rowVersion: number;
  };
  readonly attachments: readonly SupportAttachmentMetadata[];
}

export interface SupportAttachmentDownloadDescriptor {
  readonly attachmentId: string;
  readonly assetId: string;
  readonly caseId: string;
  readonly casePublicId: string;
  readonly sha256: string;
  readonly objectPath: string;
  readonly contentType: "image/webp";
  readonly byteLength: number;
  readonly width: 1600;
  readonly height: number;
  readonly fileName: string;
}

function unwrapSingleRpcRow(value: unknown): unknown {
  return Array.isArray(value) && value.length === 1 ? value[0] : value;
}

export function parseSupportCaseReference(value: string): string {
  const parsed = supportCaseReferenceSchema.safeParse(value);
  if (!parsed.success) {
    throw new CommerceDomainError(
      "INVALID_SUPPORT_ATTACHMENT_COORDINATES",
      "The support case reference is invalid.",
      400,
    );
  }
  return uuidSchema.safeParse(parsed.data).success
    ? parsed.data.toLowerCase()
    : parsed.data;
}

export function parseSupportAttachmentId(value: string): string {
  const parsed = supportAttachmentIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new CommerceDomainError(
      "INVALID_SUPPORT_ATTACHMENT_COORDINATES",
      "The support attachment ID is invalid.",
      400,
    );
  }
  return parsed.data.toLowerCase();
}

function rpcFailure(error: RpcErrorLike): never {
  const source = [
    error.code,
    error.message,
    error.details,
    error.hint,
  ].filter(Boolean).join(" ");
  if (
    source.includes("SUPPORT_CASE_NOT_FOUND") ||
    source.includes("SUPPORT_ATTACHMENT_NOT_FOUND")
  ) {
    throw new CommerceDomainError(
      "SUPPORT_ATTACHMENT_NOT_FOUND",
      "The support case or attachment was not found.",
      404,
    );
  }
  if (
    source.includes("ADMIN_AAL2_REQUIRED") ||
    source.includes("ADMIN_AUTH_REQUIRED") ||
    source.includes("ADMIN_SESSION_REQUIRED") ||
    source.includes("ADMIN_SESSION_REVOKED") ||
    source.includes("ADMIN_MEMBERSHIP_INACTIVE") ||
    source.includes("ADMIN_ROLE_FORBIDDEN")
  ) {
    throw new CommerceDomainError(
      "SUPPORT_ATTACHMENT_FORBIDDEN",
      "The current administrator may not read this support attachment.",
      403,
    );
  }
  if (
    source.includes("INVALID_SUPPORT_CASE_ID") ||
    source.includes("INVALID_SUPPORT_ATTACHMENT_COORDINATES")
  ) {
    throw new CommerceDomainError(
      "INVALID_SUPPORT_ATTACHMENT_COORDINATES",
      "The support attachment coordinates are invalid.",
      400,
    );
  }
  throw new CommerceDomainError(
    "SUPPORT_ATTACHMENT_READ_UNAVAILABLE",
    "The private support attachment service is unavailable.",
    503,
  );
}

function parseList(value: unknown): Omit<
  SupportAttachmentList,
  "attachments"
> & {
  readonly attachments: readonly Omit<
    SupportAttachmentMetadata,
    "downloadPath"
  >[];
} {
  const parsed = attachmentListSchema.safeParse(value);
  if (!parsed.success) {
    throw new CommerceDomainError(
      "SUPPORT_ATTACHMENT_CONTRACT_INVALID",
      "The private support attachment service returned an invalid list.",
      503,
    );
  }
  return parsed.data;
}

export function parseSupportAttachmentDownloadDescriptor(
  value: unknown,
  expected: {
    readonly caseReference: string;
    readonly attachmentId: string;
  },
): SupportAttachmentDownloadDescriptor {
  const parsed = downloadDescriptorSchema.safeParse(value);
  if (!parsed.success) {
    throw new CommerceDomainError(
      "SUPPORT_ATTACHMENT_CONTRACT_INVALID",
      "The private support attachment service returned an invalid download record.",
      503,
    );
  }
  const descriptor = parsed.data;
  const requestedCase = parseSupportCaseReference(expected.caseReference);
  const requestedAttachment = parseSupportAttachmentId(expected.attachmentId);
  if (
    descriptor.attachmentId !== requestedAttachment ||
    (
      descriptor.caseId !== requestedCase &&
      descriptor.casePublicId !== requestedCase
    ) ||
    descriptor.objectPath !==
      `support/${descriptor.sha256}/1600.webp`
  ) {
    throw new CommerceDomainError(
      "SUPPORT_ATTACHMENT_CONTRACT_MISMATCH",
      "The resolved private attachment does not match the request.",
      503,
    );
  }
  return Object.freeze(descriptor);
}

export async function listSupportAttachments(
  client: AuthenticatedRpcClient,
  caseReference: string,
): Promise<SupportAttachmentList> {
  const parsedCaseReference = parseSupportCaseReference(caseReference);
  const { data, error } = await client.schema("api").rpc(
    "admin_support_attachments_list",
    { p_case_id: parsedCaseReference },
  );
  if (error) rpcFailure(error);
  const parsed = parseList(data);
  return Object.freeze({
    case: Object.freeze(parsed.case),
    attachments: Object.freeze(
      parsed.attachments.map((attachment) =>
        Object.freeze({
          ...attachment,
          downloadPath:
            `/api/admin/support/cases/${encodeURIComponent(parsed.case.publicId)}`
            + `/attachments/${encodeURIComponent(attachment.id)}`,
        }),
      ),
    ),
  });
}

export async function resolveSupportAttachmentDownload(
  client: AuthenticatedRpcClient,
  input: {
    readonly caseReference: string;
    readonly attachmentId: string;
  },
): Promise<SupportAttachmentDownloadDescriptor> {
  const caseReference = parseSupportCaseReference(input.caseReference);
  const attachmentId = parseSupportAttachmentId(input.attachmentId);
  const { data, error } = await client.schema("api").rpc(
    "admin_support_attachment_download_resolve",
    {
      p_case_id: caseReference,
      p_attachment_id: attachmentId,
    },
  );
  if (error) rpcFailure(error);
  return parseSupportAttachmentDownloadDescriptor(data, {
    caseReference,
    attachmentId,
  });
}

export async function downloadPrivateSupportAttachment(
  client: SupabaseClient,
  bucket: string,
  descriptor: SupportAttachmentDownloadDescriptor,
  signal?: AbortSignal,
): Promise<Blob> {
  const { data, error } = await client.storage
    .from(bucket)
    .download(
      descriptor.objectPath,
      {},
      {
        cache: "no-store",
        ...(signal ? { signal } : {}),
      },
    );
  if (error || !data) {
    throw new CommerceDomainError(
      "SUPPORT_ATTACHMENT_OBJECT_UNAVAILABLE",
      "The private support attachment object is unavailable.",
      503,
    );
  }
  if (data.size !== descriptor.byteLength) {
    throw new CommerceDomainError(
      "SUPPORT_ATTACHMENT_SIZE_MISMATCH",
      "The private support attachment failed its integrity check.",
      503,
    );
  }
  return data;
}

export function supportAttachmentDownloadHeaders(
  descriptor: SupportAttachmentDownloadDescriptor,
): Headers {
  const fileName = safeFileNameSchema.parse(descriptor.fileName);
  const headers = new Headers();
  headers.set(
    "Cache-Control",
    "private, no-store, no-cache, max-age=0, must-revalidate",
  );
  headers.set("Content-Disposition", `attachment; filename="${fileName}"`);
  headers.set("Content-Length", String(descriptor.byteLength));
  headers.set("Content-Security-Policy", "sandbox; default-src 'none'");
  headers.set("Content-Type", descriptor.contentType);
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("Expires", "0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return headers;
}

export function demoSupportAttachmentList(
  caseReference: string,
): SupportAttachmentList {
  const parsedCaseReference = parseSupportCaseReference(caseReference);
  return Object.freeze({
    case: Object.freeze({
      id: uuidSchema.safeParse(parsedCaseReference).success
        ? parsedCaseReference
        : "00000000-0000-4000-8000-000000000001",
      publicId: supportCasePublicIdSchema.safeParse(parsedCaseReference).success
        ? parsedCaseReference
        : "case-00000000000000000000",
      state: "open",
      rowVersion: 1,
    }),
    attachments: Object.freeze([]),
  });
}
