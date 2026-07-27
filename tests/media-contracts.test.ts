import { describe, expect, it } from "vitest";

import {
  MAX_SOURCE_IMAGE_BYTES,
  createDeliveryPath,
  createDerivedObjectPath,
  createSourceObjectPath,
  createUploadIntentId,
  createUploadIntentSchema,
  finalizeUploadSchema,
  isSafeSourceObjectPath,
  isSafeDerivedObjectPath,
  mediaDerivativeManifestSchema,
  validateMediaDerivativeManifest,
} from "@/lib/media/contracts";

const baseIntent = {
  scope: "product" as const,
  entityId: "9f034926-d80e-4df5-9f6a-f0245e71311c",
  fileName: "estate-jacket.jpg",
  contentType: "image/jpeg" as const,
  sizeBytes: 2_048,
  expectedVersion: 3,
  idempotencyKey: "media-intent-test-0001",
};

describe("media request contracts", () => {
  it("builds deterministic server-owned object paths", () => {
    const intentId = createUploadIntentId({
      actorId: "62c12d42-6cc9-4480-b98c-e776f93c9d53",
      scope: baseIntent.scope,
      entityId: baseIntent.entityId,
      expectedVersion: baseIntent.expectedVersion,
      idempotencyKey: baseIntent.idempotencyKey,
    });
    expect(intentId).toMatch(/^[a-f0-9]{64}$/);
    const sourcePath = createSourceObjectPath({
      scope: baseIntent.scope,
      entityId: baseIntent.entityId,
      intentId,
      contentType: baseIntent.contentType,
    });
    expect(sourcePath).toBe(
      `incoming/product/${baseIntent.entityId}/${intentId}.jpg`,
    );
    expect(isSafeSourceObjectPath(sourcePath)).toBe(true);
    expect(
      createDerivedObjectPath({
        scope: "product",
        sha256: intentId,
        width: 1600,
        format: "avif",
      }),
    ).toBe(`catalog/${intentId}/1600.avif`);
    expect(
      createDeliveryPath({
        scope: "product",
        sha256: intentId,
        width: 1600,
        format: "avif",
      }),
    ).toBe(`/media/${intentId}/1600.avif`);
    expect(
      createDeliveryPath({
        scope: "support",
        sha256: intentId,
        width: 1600,
        format: "avif",
      }),
    ).toBeNull();
    expect(
      isSafeDerivedObjectPath(
        "product",
        `catalog/${intentId}/1600.avif`,
      ),
    ).toBe(true);
    expect(
      isSafeDerivedObjectPath(
        "support",
        `catalog/${intentId}/1600.avif`,
      ),
    ).toBe(false);
  });

  it("rejects MIME spoofing, oversized input, extra fields, and unsafe names", () => {
    expect(
      createUploadIntentSchema.safeParse({
        ...baseIntent,
        fileName: "estate-jacket.png",
      }).success,
    ).toBe(false);
    expect(
      createUploadIntentSchema.safeParse({
        ...baseIntent,
        sizeBytes: MAX_SOURCE_IMAGE_BYTES + 1,
      }).success,
    ).toBe(false);
    expect(
      createUploadIntentSchema.safeParse({
        ...baseIntent,
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      createUploadIntentSchema.safeParse({
        ...baseIntent,
        fileName: "../../secret.jpg",
      }).success,
    ).toBe(false);
  });

  it("binds finalize to the exact scope, entity, intent, and source path", () => {
    const intentId = createUploadIntentId({
      actorId: "62c12d42-6cc9-4480-b98c-e776f93c9d53",
      scope: baseIntent.scope,
      entityId: baseIntent.entityId,
      expectedVersion: baseIntent.expectedVersion,
      idempotencyKey: baseIntent.idempotencyKey,
    });
    const sourcePath = createSourceObjectPath({
      scope: baseIntent.scope,
      entityId: baseIntent.entityId,
      intentId,
      contentType: baseIntent.contentType,
    });
    expect(
      finalizeUploadSchema.safeParse({
        ...baseIntent,
        idempotencyKey: "media-finalize-test-0001",
        intentId,
        sourcePath,
      }).success,
    ).toBe(true);
    for (const attackPath of [
      `incoming/product/${baseIntent.entityId}/../${intentId}.jpg`,
      `incoming/product/${baseIntent.entityId}/%2e%2e/${intentId}.jpg`,
      `incoming\\product\\${baseIntent.entityId}\\${intentId}.jpg`,
      `incoming/support/${baseIntent.entityId}/${intentId}.jpg`,
      `incoming/product/another-product/${intentId}.jpg`,
    ]) {
      expect(
        finalizeUploadSchema.safeParse({
          ...baseIntent,
          idempotencyKey: "media-finalize-test-0001",
          intentId,
          sourcePath: attackPath,
        }).success,
      ).toBe(false);
    }
  });

  it("rejects encoded separators and traversal before storage is addressed", () => {
    expect(
      isSafeSourceObjectPath(
        `incoming/product/${baseIntent.entityId}/%2f${"a".repeat(64)}.jpg`,
      ),
    ).toBe(false);
    expect(
      isSafeSourceObjectPath(
        `incoming/product/${baseIntent.entityId}/${"a".repeat(64)}.jpg\0`,
      ),
    ).toBe(false);
    expect(
      isSafeDerivedObjectPath(
        "product",
        `catalog/${"a".repeat(64)}/../1600.webp`,
      ),
    ).toBe(false);
    expect(
      isSafeDerivedObjectPath(
        "product",
        `catalog/${"a".repeat(64)}/1600.webp%2fsecret`,
      ),
    ).toBe(false);
  });

  it("requires actual rendered widths for every derivative coordinate", () => {
    const sha256 = "a".repeat(64);
    const derivatives = [800, 1200, 1600].flatMap((width) =>
      ["webp", "avif"].map((format) => ({
        width,
        renderedWidth: width === 1600 ? 1200 : width,
        height: width === 800 ? 533 : 800,
        format,
        byteLength: 1024,
        objectPath: `catalog/${sha256}/${width}.${format}`,
        deliveryPath: `/media/${sha256}/${width}.${format}`,
      }))
    );
    expect(mediaDerivativeManifestSchema.safeParse(derivatives).success).toBe(
      true,
    );

    const missing = derivatives.map((derivative, index) =>
      index === 0
        ? {
            width: derivative.width,
            height: derivative.height,
            format: derivative.format,
            byteLength: derivative.byteLength,
            objectPath: derivative.objectPath,
            deliveryPath: derivative.deliveryPath,
          }
        : derivative
    );
    const oversized = derivatives.map((derivative, index) =>
      index === 0
        ? { ...derivative, renderedWidth: derivative.width + 1 }
        : derivative
    );
    const huge = derivatives.map((derivative, index) =>
      index === 0
        ? { ...derivative, renderedWidth: Number.MAX_SAFE_INTEGER }
        : derivative
    );

    expect(mediaDerivativeManifestSchema.safeParse(missing).success).toBe(
      false,
    );
    expect(mediaDerivativeManifestSchema.safeParse(oversized).success).toBe(
      false,
    );
    expect(mediaDerivativeManifestSchema.safeParse(huge).success).toBe(false);
    expect(() => validateMediaDerivativeManifest(missing)).toThrow(
      expect.objectContaining({
        code: "INVALID_MEDIA_DERIVATIVE_MANIFEST",
        httpStatus: 422,
      }),
    );
  });
});
