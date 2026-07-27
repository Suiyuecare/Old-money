import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";

import { CommerceDomainError } from "@/lib/commerce/errors";

import {
  MAX_SOURCE_IMAGE_BYTES,
  MEDIA_DERIVATIVE_FORMATS,
  MEDIA_DERIVATIVE_WIDTHS,
  type SourceImageContentType,
} from "./contracts";

const MAX_INPUT_PIXELS = 40_000_000;

const contentTypeBySharpFormat: Readonly<
  Record<string, SourceImageContentType | undefined>
> = Object.freeze({
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heif: "image/avif",
  avif: "image/avif",
});

export interface ProcessedDerivative {
  /**
   * The stable public variant requested by the catalog contract. A small
   * source can render below this width because enlargement is disabled.
   */
  readonly variantWidth: (typeof MEDIA_DERIVATIVE_WIDTHS)[number];
  /** The actual encoded pixel width reported by Sharp. */
  readonly width: number;
  readonly height: number;
  readonly format: (typeof MEDIA_DERIVATIVE_FORMATS)[number];
  readonly contentType: "image/webp" | "image/avif";
  readonly bytes: Buffer;
}

export interface ProcessedImage {
  readonly sha256: string;
  readonly sourceContentType: SourceImageContentType;
  readonly sourceByteLength: number;
  readonly width: number;
  readonly height: number;
  readonly derivatives: readonly ProcessedDerivative[];
}

function normalizeMetadataFormat(metadata: Metadata): SourceImageContentType {
  const contentType = metadata.format
    ? contentTypeBySharpFormat[metadata.format]
    : undefined;
  if (!contentType) {
    throw new CommerceDomainError(
      "UNSUPPORTED_SOURCE_IMAGE",
      "The uploaded object is not an accepted raster image.",
      415,
    );
  }
  return contentType;
}

function hasAvifContainerBrand(sourceBytes: Buffer): boolean {
  if (
    sourceBytes.byteLength < 16 ||
    sourceBytes.subarray(4, 8).toString("ascii") !== "ftyp"
  ) {
    return false;
  }
  const brands = sourceBytes
    .subarray(8, Math.min(sourceBytes.byteLength, 64))
    .toString("ascii");
  return /(?:avif|avis)/.test(brands);
}

function contentDigest(input: {
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
  readonly channels: number;
}): string {
  const dimensions = Buffer.allocUnsafe(12);
  dimensions.writeUInt32BE(input.width, 0);
  dimensions.writeUInt32BE(input.height, 4);
  dimensions.writeUInt32BE(input.channels, 8);
  return createHash("sha256")
    .update("lignee-normalized-srgb-rgba-v1\0")
    .update(dimensions)
    .update(input.data)
    .digest("hex");
}

export async function processSourceImage(
  sourceBytes: Buffer,
  declaredContentType: SourceImageContentType,
): Promise<ProcessedImage> {
  if (sourceBytes.byteLength < 1 || sourceBytes.byteLength > MAX_SOURCE_IMAGE_BYTES) {
    throw new CommerceDomainError(
      "SOURCE_IMAGE_SIZE_REJECTED",
      "The source image exceeds the accepted size.",
      413,
    );
  }

  let metadata: Metadata;
  try {
    metadata = await sharp(sourceBytes, {
      animated: false,
      failOn: "warning",
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();
  } catch {
    throw new CommerceDomainError(
      "SOURCE_IMAGE_INVALID",
      "The source image could not be decoded safely.",
      422,
    );
  }

  const detectedContentType = normalizeMetadataFormat(metadata);
  if (
    detectedContentType === "image/avif" &&
    !hasAvifContainerBrand(sourceBytes)
  ) {
    throw new CommerceDomainError(
      "UNSUPPORTED_SOURCE_IMAGE",
      "The HEIF container is not an AVIF image.",
      415,
    );
  }
  if (detectedContentType !== declaredContentType) {
    throw new CommerceDomainError(
      "SOURCE_IMAGE_TYPE_MISMATCH",
      "The uploaded image content does not match its declared type.",
      415,
    );
  }
  if ((metadata.pages ?? 1) !== 1) {
    throw new CommerceDomainError(
      "ANIMATED_IMAGE_REJECTED",
      "Animated or multi-page images are not accepted.",
      415,
    );
  }

  let normalized: {
    readonly data: Buffer;
    readonly info: {
      readonly width: number;
      readonly height: number;
      readonly channels: 1 | 2 | 3 | 4;
    };
  };
  try {
    normalized = await sharp(sourceBytes, {
      animated: false,
      failOn: "warning",
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .toColourspace("srgb")
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new CommerceDomainError(
      "SOURCE_IMAGE_NORMALIZATION_FAILED",
      "The source image could not be normalized safely.",
      422,
    );
  }

  const sha256 = contentDigest({
    data: normalized.data,
    width: normalized.info.width,
    height: normalized.info.height,
    channels: normalized.info.channels,
  });
  const derivatives: ProcessedDerivative[] = [];
  for (const width of MEDIA_DERIVATIVE_WIDTHS) {
    for (const format of MEDIA_DERIVATIVE_FORMATS) {
      const pipeline = sharp(normalized.data, {
        raw: {
          width: normalized.info.width,
          height: normalized.info.height,
          channels: normalized.info.channels,
        },
      }).resize({
        width,
        fit: "inside",
        withoutEnlargement: true,
      });
      const result =
        format === "webp"
          ? await pipeline
              .webp({ quality: 88, effort: 5, smartSubsample: true })
              .toBuffer({ resolveWithObject: true })
          : await pipeline
              .avif({ quality: 62, effort: 5, chromaSubsampling: "4:4:4" })
              .toBuffer({ resolveWithObject: true });
      derivatives.push(
        Object.freeze({
          variantWidth: width,
          width: result.info.width,
          height: result.info.height,
          format,
          contentType:
            format === "webp"
              ? ("image/webp" as const)
              : ("image/avif" as const),
          bytes: result.data,
        }),
      );
    }
  }

  return Object.freeze({
    sha256,
    sourceContentType: detectedContentType,
    sourceByteLength: sourceBytes.byteLength,
    width: normalized.info.width,
    height: normalized.info.height,
    derivatives: Object.freeze(derivatives),
  });
}
