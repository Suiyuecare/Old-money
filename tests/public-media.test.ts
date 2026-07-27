import { describe, expect, it } from "vitest";

import {
  parsePublicMediaCoordinates,
  parsePublicMediaDescriptor,
} from "@/lib/media/public-delivery";

const sha = "a".repeat(64);

describe("public media delivery contract", () => {
  it("accepts only generated derivative coordinates", () => {
    expect(
      parsePublicMediaCoordinates({
        sha256: sha,
        variant: "1600.avif",
      }),
    ).toEqual({ sha256: sha, variant: "1600.avif" });

    expect(() =>
      parsePublicMediaCoordinates({
        sha256: "../private",
        variant: "1600.avif",
      }),
    ).toThrowError(/does not exist/);
    expect(() =>
      parsePublicMediaCoordinates({
        sha256: sha,
        variant: "original.jpg",
      }),
    ).toThrowError(/does not exist/);
    expect(() =>
      parsePublicMediaCoordinates({
        sha256: sha,
        variant: "1600.avif%2f..%2fsource",
      }),
    ).toThrowError(/does not exist/);
  });

  it("normalizes the SQL record while rechecking every safety fact", () => {
    expect(
      parsePublicMediaDescriptor(
        {
          sha256: sha,
          variant: "1200.webp",
          object_path: `catalog/${sha}/1200.webp`,
          content_type: "image/webp",
          byte_length: 12_345,
          media_safety_revision: 7,
          asset_status: "live_approved",
          tombstoned: false,
          published: true,
        },
        { sha256: sha, variant: "1200.webp" },
      ),
    ).toMatchObject({
      objectPath: `catalog/${sha}/1200.webp`,
      assetStatus: "live-approved",
      mediaSafetyRevision: 7,
    });
  });

  it("rejects tombstones, unpublished assets, mismatched paths and MIME", () => {
    const valid = {
      sha256: sha,
      variant: "800.avif",
      objectPath: `catalog/${sha}/800.avif`,
      contentType: "image/avif",
      byteLength: 4_000,
      mediaSafetyRevision: 1,
      assetStatus: "live-approved",
      tombstoned: false,
      published: true,
    } as const;

    for (const invalid of [
      { ...valid, tombstoned: true },
      { ...valid, published: false },
      { ...valid, assetStatus: "review" },
      { ...valid, objectPath: `catalog/${sha}/1600.avif` },
      { ...valid, contentType: "image/webp" },
    ]) {
      expect(() =>
        parsePublicMediaDescriptor(invalid, {
          sha256: sha,
          variant: "800.avif",
        }),
      ).toThrow();
    }
  });
});
