import { z } from "zod";

import { CommerceDomainError } from "@/lib/commerce/errors";
import {
  getPrivilegedSupabaseClient,
  getPublicSupabaseClient,
} from "@/lib/supabase/request-clients";

import {
  MEDIA_DERIVATIVE_FORMATS,
  MEDIA_DERIVATIVE_WIDTHS,
} from "./contracts";
import { getMediaStorageBindings } from "./storage";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const publicVariantSchema = z.enum([
  "800.webp",
  "800.avif",
  "1200.webp",
  "1200.avif",
  "1600.webp",
  "1600.avif",
]);

export type PublicMediaVariant = z.infer<typeof publicVariantSchema>;

export interface PublicMediaDescriptor {
  readonly sha256: string;
  readonly variant: PublicMediaVariant;
  readonly objectPath: string;
  readonly contentType: "image/webp" | "image/avif";
  readonly byteLength: number;
  readonly mediaSafetyRevision: number;
  readonly assetStatus: "live-approved";
  readonly tombstoned: false;
  readonly published: true;
}

const descriptorSchema = z.preprocess((input) => {
  const candidate = Array.isArray(input) && input.length === 1
    ? input[0]
    : input;
  if (!candidate || typeof candidate !== "object") return candidate;
  const row = candidate as Readonly<Record<string, unknown>>;
  return {
    sha256: row.sha256,
    variant: row.variant,
    objectPath: row.objectPath ?? row.object_path,
    contentType: row.contentType ?? row.content_type,
    byteLength: row.byteLength ?? row.byte_length,
    mediaSafetyRevision:
      row.mediaSafetyRevision ?? row.media_safety_revision,
    assetStatus:
      row.assetStatus === "live_approved"
        ? "live-approved"
        : row.assetStatus ??
          (row.asset_status === "live_approved"
            ? "live-approved"
            : row.asset_status),
    tombstoned: row.tombstoned,
    published: row.published,
  };
}, z.strictObject({
  sha256: sha256Schema,
  variant: publicVariantSchema,
  objectPath: z.string().regex(
    /^catalog\/[a-f0-9]{64}\/(?:800|1200|1600)\.(?:webp|avif)$/,
  ),
  contentType: z.enum(["image/webp", "image/avif"]),
  byteLength: z.number().int().positive().max(20 * 1024 * 1024),
  mediaSafetyRevision: z.number().int().nonnegative(),
  assetStatus: z.literal("live-approved"),
  tombstoned: z.literal(false),
  published: z.literal(true),
}));

export function parsePublicMediaCoordinates(input: {
  readonly sha256: string;
  readonly variant: string;
}): { readonly sha256: string; readonly variant: PublicMediaVariant } {
  const parsed = z.strictObject({
    sha256: sha256Schema,
    variant: publicVariantSchema,
  }).safeParse(input);
  if (!parsed.success) {
    throw new CommerceDomainError(
      "PUBLIC_MEDIA_NOT_FOUND",
      "The requested media derivative does not exist.",
      404,
    );
  }
  return parsed.data;
}

export function parsePublicMediaDescriptor(
  input: unknown,
  expected: {
    readonly sha256: string;
    readonly variant: PublicMediaVariant;
  },
): PublicMediaDescriptor {
  const parsed = descriptorSchema.safeParse(input);
  if (!parsed.success) {
    throw new CommerceDomainError(
      "PUBLIC_MEDIA_CONTRACT_INVALID",
      "The public media resolver returned an invalid record.",
      503,
    );
  }
  const descriptor = parsed.data;
  const [width, format] = descriptor.variant.split(".") as [
    `${(typeof MEDIA_DERIVATIVE_WIDTHS)[number]}`,
    (typeof MEDIA_DERIVATIVE_FORMATS)[number],
  ];
  const expectedPath =
    `catalog/${descriptor.sha256}/${width}.${format}`;
  const expectedContentType = `image/${format}`;
  if (
    descriptor.sha256 !== expected.sha256 ||
    descriptor.variant !== expected.variant ||
    descriptor.objectPath !== expectedPath ||
    descriptor.contentType !== expectedContentType
  ) {
    throw new CommerceDomainError(
      "PUBLIC_MEDIA_CONTRACT_MISMATCH",
      "The public media resolver record does not match the request.",
      503,
    );
  }
  return Object.freeze(descriptor);
}

export async function resolvePublicMedia(input: {
  readonly sha256: string;
  readonly variant: string;
}): Promise<PublicMediaDescriptor | null> {
  const coordinates = parsePublicMediaCoordinates(input);
  const publicClient = getPublicSupabaseClient();
  const { data, error } = await publicClient
    .schema("api")
    .rpc("public_media_resolve", {
      p_sha: coordinates.sha256,
      p_variant: coordinates.variant,
    });
  if (error) {
    throw new CommerceDomainError(
      "PUBLIC_MEDIA_RESOLVER_UNAVAILABLE",
      "The public media resolver is unavailable.",
      503,
    );
  }
  if (data === null || (Array.isArray(data) && data.length === 0)) return null;
  return parsePublicMediaDescriptor(data, coordinates);
}

export async function downloadPublicMedia(
  descriptor: PublicMediaDescriptor,
): Promise<Buffer> {
  const bucket = getMediaStorageBindings().productDerivativeBucket;
  const privilegedClient = getPrivilegedSupabaseClient();
  const { data, error } = await privilegedClient.storage
    .from(bucket)
    .download(descriptor.objectPath, {}, { cache: "no-store" });
  if (error || !data) {
    throw new CommerceDomainError(
      "PUBLIC_MEDIA_OBJECT_UNAVAILABLE",
      "The approved media derivative is unavailable.",
      503,
    );
  }
  const bytes = Buffer.from(await data.arrayBuffer());
  if (bytes.byteLength !== descriptor.byteLength) {
    throw new CommerceDomainError(
      "PUBLIC_MEDIA_SIZE_MISMATCH",
      "The approved media derivative failed its integrity check.",
      503,
    );
  }
  return bytes;
}
