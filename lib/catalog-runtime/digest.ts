import { createHash } from "node:crypto";

import type { PublicCatalogSnapshot } from "./contracts";

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, entry]) =>
          `${JSON.stringify(key)}:${canonicalJson(entry)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};

/**
 * Content digests intentionally exclude revision and generatedAt. Compare mode
 * verifies that two sources publish identical sellable content even though
 * their operational metadata was created at different times.
 */
export function createCatalogContentDigest(
  snapshot: PublicCatalogSnapshot,
): string {
  const content = {
    schemaVersion: snapshot.schemaVersion,
    products: [...snapshot.products].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    skus: [...snapshot.skus].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    media: [...snapshot.media].sort((left, right) =>
      left.productId.localeCompare(right.productId) ||
      left.role.localeCompare(right.role) ||
      left.sortOrder - right.sortOrder,
    ),
    categories: [...snapshot.categories].sort(
      (left, right) => left.sortOrder - right.sortOrder,
    ),
    chapters: [...snapshot.chapters].sort(
      (left, right) => left.sortOrder - right.sortOrder,
    ),
  };
  return createHash("sha256").update(canonicalJson(content)).digest("hex");
}
