import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { CommerceDomainError } from "@/lib/commerce/errors";
import {
  MAX_SOURCE_IMAGE_BYTES,
  MEDIA_DERIVATIVE_FORMATS,
  MEDIA_DERIVATIVE_WIDTHS,
} from "@/lib/media/contracts";
import { processSourceImage } from "@/lib/media/image-processor";

describe("private source image processing", () => {
  it(
    "auto-orients, strips metadata, and produces deterministic WebP/AVIF variants",
    async () => {
      const source = await sharp({
        create: {
          width: 1800,
          height: 1200,
          channels: 3,
          background: { r: 86, g: 92, b: 60 },
        },
      })
        .withMetadata({
          orientation: 6,
          exif: {
            IFD0: {
              Artist: "must-not-survive",
              Copyright: "private-source",
            },
          },
        })
        .jpeg({ quality: 94 })
        .toBuffer();

      const first = await processSourceImage(source, "image/jpeg");
      const second = await processSourceImage(source, "image/jpeg");

      expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(second.sha256).toBe(first.sha256);
      expect(first.width).toBe(1200);
      expect(first.height).toBe(1800);
      expect(first.derivatives).toHaveLength(
        MEDIA_DERIVATIVE_WIDTHS.length * MEDIA_DERIVATIVE_FORMATS.length,
      );

      for (const derivative of first.derivatives) {
        const metadata = await sharp(derivative.bytes).metadata();
        expect(metadata.format).toBe(
          derivative.format === "avif" ? "heif" : "webp",
        );
        expect(metadata.exif).toBeUndefined();
        expect(metadata.icc).toBeUndefined();
        expect(metadata.orientation).toBeUndefined();
        expect(derivative.variantWidth).toBeGreaterThanOrEqual(
          derivative.width,
        );
        expect(derivative.width).toBe(metadata.width);
        expect(derivative.height).toBe(metadata.height);
      }

      expect(
        first.derivatives
          .filter((derivative) => derivative.format === "webp")
          .map((derivative) => ({
            variantWidth: derivative.variantWidth,
            renderedWidth: derivative.width,
          })),
      ).toEqual([
        { variantWidth: 800, renderedWidth: 800 },
        { variantWidth: 1200, renderedWidth: 1200 },
        { variantWidth: 1600, renderedWidth: 1200 },
      ]);
    },
    30_000,
  );

  it("sniffs decoded content instead of trusting the declared MIME type", async () => {
    const png = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    await expect(processSourceImage(png, "image/jpeg")).rejects.toMatchObject({
      code: "SOURCE_IMAGE_TYPE_MISMATCH",
      httpStatus: 415,
    } satisfies Partial<CommerceDomainError>);
  });

  it("rejects oversized and undecodable inputs before any derivative upload", async () => {
    await expect(
      processSourceImage(
        Buffer.alloc(MAX_SOURCE_IMAGE_BYTES + 1),
        "image/jpeg",
      ),
    ).rejects.toMatchObject({
      code: "SOURCE_IMAGE_SIZE_REJECTED",
      httpStatus: 413,
    } satisfies Partial<CommerceDomainError>);
    await expect(
      processSourceImage(Buffer.from("not-an-image"), "image/jpeg"),
    ).rejects.toMatchObject({
      code: "SOURCE_IMAGE_INVALID",
      httpStatus: 422,
    } satisfies Partial<CommerceDomainError>);
  });
});
