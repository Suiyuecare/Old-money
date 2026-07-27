import { createHash } from "node:crypto";
import { z } from "zod";

import { CommerceDomainError } from "@/lib/commerce/errors";
import { idempotencyKeySchema } from "@/lib/commerce/validation";

export const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
export const MEDIA_DERIVATIVE_WIDTHS = [800, 1200, 1600] as const;
export const MEDIA_DERIVATIVE_FORMATS = ["webp", "avif"] as const;

export const mediaScopeSchema = z.enum(["product", "support"]);
export type MediaScope = z.infer<typeof mediaScopeSchema>;

export const sourceImageContentTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
export type SourceImageContentType = z.infer<
  typeof sourceImageContentTypeSchema
>;

const entityIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
    "Entity IDs may contain letters, numbers, underscores, and hyphens only.",
  );

const sourceFileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .refine(
    (value) =>
      value !== "." &&
      value !== ".." &&
      !value.includes("/") &&
      !value.includes("\\") &&
      !value.includes("\0"),
    "File name must not contain a path.",
  );

const expectedVersionSchema = z.number().int().positive().safe();

const commonUploadFields = {
  scope: mediaScopeSchema,
  entityId: entityIdSchema,
  fileName: sourceFileNameSchema,
  contentType: sourceImageContentTypeSchema,
  sizeBytes: z.number().int().positive().max(MAX_SOURCE_IMAGE_BYTES).safe(),
  expectedVersion: expectedVersionSchema,
  idempotencyKey: idempotencyKeySchema,
} as const;

export const createUploadIntentSchema = z
  .strictObject(commonUploadFields)
  .superRefine((value, context) => {
    if (!fileExtensionMatchesContentType(value.fileName, value.contentType)) {
      context.addIssue({
        code: "custom",
        path: ["fileName"],
        message: "File extension does not match the declared image type.",
      });
    }
  });

export type CreateUploadIntentInput = z.infer<
  typeof createUploadIntentSchema
>;

export const finalizeUploadSchema = z
  .strictObject({
    ...commonUploadFields,
    intentId: z.string().regex(/^[a-f0-9]{64}$/),
    sourcePath: z
      .string()
      .min(1)
      .max(420)
      .refine(isSafeSourceObjectPath, "Source object path is invalid."),
  })
  .superRefine((value, context) => {
    if (!fileExtensionMatchesContentType(value.fileName, value.contentType)) {
      context.addIssue({
        code: "custom",
        path: ["fileName"],
        message: "File extension does not match the declared image type.",
      });
    }
    const expectedPath = createSourceObjectPath({
      scope: value.scope,
      entityId: value.entityId,
      intentId: value.intentId,
      contentType: value.contentType,
    });
    if (value.sourcePath !== expectedPath) {
      context.addIssue({
        code: "custom",
        path: ["sourcePath"],
        message: "Source object path does not match this upload intent.",
      });
    }
  });

export type FinalizeUploadInput = z.infer<typeof finalizeUploadSchema>;

const extensionsByContentType: Readonly<
  Record<SourceImageContentType, readonly string[]>
> = Object.freeze({
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/avif": [".avif"],
});

const canonicalExtensionByContentType: Readonly<
  Record<SourceImageContentType, string>
> = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
});

function fileExtensionMatchesContentType(
  fileName: string,
  contentType: SourceImageContentType,
): boolean {
  const normalized = fileName.toLowerCase();
  return extensionsByContentType[contentType].some((extension) =>
    normalized.endsWith(extension),
  );
}

export function createUploadIntentId(input: {
  readonly actorId: string;
  readonly scope: MediaScope;
  readonly entityId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
}): string {
  return createHash("sha256")
    .update("lignee-media-upload-intent-v1\0")
    .update(input.actorId)
    .update("\0")
    .update(input.scope)
    .update("\0")
    .update(input.entityId)
    .update("\0")
    .update(String(input.expectedVersion))
    .update("\0")
    .update(input.idempotencyKey)
    .digest("hex");
}

export function createSourceObjectPath(input: {
  readonly scope: MediaScope;
  readonly entityId: string;
  readonly intentId: string;
  readonly contentType: SourceImageContentType;
}): string {
  if (
    !entityIdSchema.safeParse(input.entityId).success ||
    !/^[a-f0-9]{64}$/.test(input.intentId)
  ) {
    throw new CommerceDomainError(
      "INVALID_MEDIA_PATH_INPUT",
      "Media path input is invalid.",
      400,
    );
  }
  const extension = canonicalExtensionByContentType[input.contentType];
  return `incoming/${input.scope}/${input.entityId}/${input.intentId}.${extension}`;
}

export function isSafeSourceObjectPath(value: string): boolean {
  if (
    value.includes("..") ||
    value.includes("\\") ||
    value.includes("\0") ||
    /%2f|%5c|%00/i.test(value)
  ) {
    return false;
  }
  return /^incoming\/(product|support)\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}\/[a-f0-9]{64}\.(jpg|png|webp|avif)$/.test(
    value,
  );
}

export function createDerivedObjectPath(input: {
  readonly scope: MediaScope;
  readonly sha256: string;
  readonly width: (typeof MEDIA_DERIVATIVE_WIDTHS)[number];
  readonly format: (typeof MEDIA_DERIVATIVE_FORMATS)[number];
}): string {
  if (!/^[a-f0-9]{64}$/.test(input.sha256)) {
    throw new CommerceDomainError(
      "INVALID_MEDIA_SHA",
      "Media content digest is invalid.",
      400,
    );
  }
  const prefix = input.scope === "product" ? "catalog" : "support";
  return `${prefix}/${input.sha256}/${input.width}.${input.format}`;
}

export function isSafeDerivedObjectPath(
  scope: MediaScope,
  value: string,
): boolean {
  if (
    value.includes("..") ||
    value.includes("\\") ||
    value.includes("\0") ||
    /%2f|%5c|%00/i.test(value)
  ) {
    return false;
  }
  const prefix = scope === "product" ? "catalog" : "support";
  return new RegExp(
    `^${prefix}/[a-f0-9]{64}/(800|1200|1600)\\.(webp|avif)$`,
  ).test(value);
}

export function createDeliveryPath(input: {
  readonly scope: MediaScope;
  readonly sha256: string;
  readonly width: (typeof MEDIA_DERIVATIVE_WIDTHS)[number];
  readonly format: (typeof MEDIA_DERIVATIVE_FORMATS)[number];
}): string | null {
  if (input.scope !== "product") return null;
  return `/media/${input.sha256}/${input.width}.${input.format}`;
}

export interface MediaDerivativeDescriptor {
  /** Stable delivery variant encoded in the object path. */
  readonly width: (typeof MEDIA_DERIVATIVE_WIDTHS)[number];
  /** Actual encoded width when a smaller source is not enlarged. */
  readonly renderedWidth: number;
  readonly height: number;
  readonly format: (typeof MEDIA_DERIVATIVE_FORMATS)[number];
  readonly byteLength: number;
  readonly objectPath: string;
  readonly deliveryPath: string | null;
}

const mediaDerivativeWidthSchema = z.union([
  z.literal(800),
  z.literal(1200),
  z.literal(1600),
]);
const mediaDerivativeFormatSchema = z.enum(MEDIA_DERIVATIVE_FORMATS);

export const mediaDerivativeDescriptorSchema: z.ZodType<
  MediaDerivativeDescriptor
> = z.strictObject({
  width: mediaDerivativeWidthSchema,
  renderedWidth: z.number().int().positive().safe(),
  height: z.number().int().positive().safe(),
  format: mediaDerivativeFormatSchema,
  byteLength: z.number().int().positive().max(MAX_SOURCE_IMAGE_BYTES).safe(),
  objectPath: z.string().min(1).max(420),
  deliveryPath: z.string().min(1).max(420).nullable(),
}).superRefine((descriptor, context) => {
  if (descriptor.renderedWidth > descriptor.width) {
    context.addIssue({
      code: "custom",
      path: ["renderedWidth"],
      message: "Rendered width cannot exceed its stable variant width.",
    });
  }
});

export const mediaDerivativeManifestSchema = z
  .array(mediaDerivativeDescriptorSchema)
  .length(
    MEDIA_DERIVATIVE_WIDTHS.length * MEDIA_DERIVATIVE_FORMATS.length,
  )
  .superRefine((derivatives, context) => {
    const coordinates = new Set(
      derivatives.map(
        (derivative) => `${derivative.width}.${derivative.format}`,
      ),
    );
    if (
      coordinates.size
      !== MEDIA_DERIVATIVE_WIDTHS.length * MEDIA_DERIVATIVE_FORMATS.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Derivative manifest must contain each width/format pair once.",
      });
    }
  });

export function validateMediaDerivativeManifest(
  value: unknown,
): readonly MediaDerivativeDescriptor[] {
  const parsed = mediaDerivativeManifestSchema.safeParse(value);
  if (!parsed.success) {
    throw new CommerceDomainError(
      "INVALID_MEDIA_DERIVATIVE_MANIFEST",
      "The generated derivative manifest is invalid.",
      422,
    );
  }
  return Object.freeze(
    parsed.data.map((descriptor) => Object.freeze(descriptor)),
  );
}

export interface MediaUploadIntent {
  readonly mode: "storage" | "demo";
  readonly persisted: boolean;
  readonly intentId: string;
  readonly sourcePath: string;
  readonly signedUploadUrl: string | null;
  readonly signedUploadToken: string | null;
  readonly expiresInSeconds: number | null;
  readonly maximumBytes: number;
  readonly acceptedContentType: SourceImageContentType;
  readonly message: string;
}

export interface FinalizedMedia {
  readonly mode: "storage" | "demo";
  readonly persisted: boolean;
  readonly processed: boolean;
  readonly intentId: string;
  readonly sourcePath: string;
  readonly sha256: string | null;
  readonly original: {
    readonly contentType: SourceImageContentType;
    readonly byteLength: number;
    readonly width: number | null;
    readonly height: number | null;
  };
  readonly derivatives: readonly MediaDerivativeDescriptor[];
  readonly mediaAssetId: string | null;
  readonly replayed: boolean;
  readonly message: string;
}
