import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";

import sharp from "sharp";

const workspace = resolve(import.meta.dirname, "..");
const inventoryPath = join(
  workspace,
  "content/asset-inventory.generated.json",
);
const inventoryBytes = readFileSync(inventoryPath);
const inventory = JSON.parse(inventoryBytes.toString("utf8"));
const privateAnchorRegistry = JSON.parse(
  readFileSync(join(workspace, "content/private-anchor-registry.json"), "utf8"),
);
const reviewRecord = JSON.parse(
  readFileSync(join(workspace, "content/asset-review-record.json"), "utf8"),
);
const errors = [];
const webpHashes = new Set();
const avifHashes = new Set();
const validPrivateAnchorIds = new Set(
  privateAnchorRegistry.anchors.map((anchor) => anchor.id),
);
const privateAnchorHashes = new Set(
  privateAnchorRegistry.anchors.map((anchor) => anchor.sha256),
);
const privateAnchorUseCounts = new Map(
  privateAnchorRegistry.anchors.map((anchor) => [anchor.id, 0]),
);
const variantPairs = [];
const inventoryVariantPaths = new Set(
  inventory.entries.flatMap((entry) => [
    entry.variants.webp,
    entry.variants.avif,
  ]),
);
const PERCEPTUAL_PEARSON_THRESHOLD = 0.985;
const VARIANT_PEARSON_THRESHOLD = 0.98;
const PERCEPTUAL_SAMPLE_SIZE = 64;

const inventoryHash = createHash("sha256")
  .update(inventoryBytes)
  .digest("hex");
if (
  reviewRecord.revision !== "asset-review-record-v1" ||
  reviewRecord.inventorySha256 !== inventoryHash ||
  reviewRecord.contactSheets?.length !== 2 ||
  reviewRecord.sourceSheets?.length !== 26
) {
  errors.push(
    "Asset review record is stale or malformed; regenerate governed review evidence.",
  );
}

if (inventory.publicAssetCount !== 150 || inventory.entries.length !== 150) {
  errors.push("Asset inventory must contain exactly 150 public records.");
}

const roleCounts = Object.groupBy(inventory.entries, (entry) => entry.role);
const expected = {
  "product-main": 50,
  "product-detail": 50,
  "estate-lifestyle": 24,
  "tennis-lifestyle": 12,
  category: 10,
  "story-hero": 4,
};
for (const [role, count] of Object.entries(expected)) {
  if ((roleCounts[role] ?? []).length !== count) {
    errors.push(`Role ${role} must contain ${count} assets.`);
  }
}

for (const entry of inventory.entries) {
  const webp = join(workspace, "public", entry.variants.webp.slice(1));
  const avif = join(workspace, "public", entry.variants.avif.slice(1));
  if (!existsSync(webp) || !existsSync(avif)) {
    errors.push(`Missing responsive variants for ${entry.id}.`);
    continue;
  }
  const webpBytes = readFileSync(webp);
  const avifBytes = readFileSync(avif);
  const hash = createHash("sha256").update(webpBytes).digest("hex");
  const avifHash = createHash("sha256").update(avifBytes).digest("hex");
  webpHashes.add(hash);
  avifHashes.add(avifHash);
  if (hash !== entry.sha256) errors.push(`WebP SHA-256 mismatch for ${entry.id}.`);
  if (avifHash !== entry.avifSha256) {
    errors.push(`AVIF SHA-256 mismatch for ${entry.id}.`);
  }
  if (statSync(webp).size !== entry.bytes) errors.push(`Byte size mismatch for ${entry.id}.`);
  if (statSync(avif).size !== entry.avifBytes) {
    errors.push(`AVIF byte size mismatch for ${entry.id}.`);
  }
  if (
    webpBytes.toString("ascii", 0, 4) !== "RIFF" ||
    webpBytes.toString("ascii", 8, 12) !== "WEBP"
  ) {
    errors.push(`Invalid WebP signature for ${entry.id}.`);
  }
  if (!/^ftyp(?:avif|avis)$/.test(avifBytes.toString("ascii", 4, 12))) {
    errors.push(`Invalid AVIF signature for ${entry.id}.`);
  }
  if (
    entry.status !== "sandbox_review" ||
    entry.qa.humanFinalApproval !== false ||
    entry.qa.physicalProductMatch !== false ||
    entry.rights.state !== "internal-sandbox-only"
  ) {
    errors.push(`Sandbox asset ${entry.id} was incorrectly elevated.`);
  }
  if (entry.role.endsWith("lifestyle")) {
    if (!Array.isArray(entry.personReferenceIds)) {
      errors.push(`Lifestyle asset ${entry.id} has no personReferenceIds array.`);
    } else {
      const uniqueIds = new Set(entry.personReferenceIds);
      if (uniqueIds.size !== entry.personReferenceIds.length) {
        errors.push(`Lifestyle asset ${entry.id} repeats a private anchor ID.`);
      }
      for (const id of entry.personReferenceIds) {
        if (!validPrivateAnchorIds.has(id)) {
          errors.push(`Lifestyle asset ${entry.id} references unknown anchor ${id}.`);
        } else {
          privateAnchorUseCounts.set(
            id,
            (privateAnchorUseCounts.get(id) ?? 0) + 1,
          );
        }
      }
      if (entry.containsPeople !== (entry.personReferenceIds.length > 0)) {
        errors.push(
          `Lifestyle asset ${entry.id} has inconsistent containsPeople provenance.`,
        );
      }
    }
  }
  const [webpMetadata, avifMetadata] = await Promise.all([
    sharp(webp).metadata(),
    sharp(avif).metadata(),
  ]);
  if (
    webpMetadata.width !== entry.width ||
    webpMetadata.height !== entry.height ||
    avifMetadata.width !== entry.width ||
    avifMetadata.height !== entry.height
  ) {
    errors.push(`Decoded responsive dimensions do not match inventory for ${entry.id}.`);
  }
  variantPairs.push({ id: entry.id, webp, avif });
}

for (const [anchorId, count] of privateAnchorUseCounts) {
  if (count === 0) {
    errors.push(`Private anchor ${anchorId} is not referenced by any lifestyle asset.`);
  }
}

if (webpHashes.size !== 150) {
  errors.push(`Expected 150 byte-unique WebP payloads; found ${webpHashes.size}.`);
}
if (avifHashes.size !== 150) {
  errors.push(`Expected 150 byte-unique AVIF payloads; found ${avifHashes.size}.`);
}

const publicRoot = join(workspace, "public");
const publicFiles = readdirSync(publicRoot, { recursive: true }).map(String);
const actualPublicVariantPaths = new Set();
for (const relativePath of publicFiles) {
  const path = join(publicRoot, relativePath);
  const stats = lstatSync(path);
  if (stats.isSymbolicLink()) {
    errors.push(`Public tree must not contain symlinks: ${relativePath}.`);
    continue;
  }
  if (!stats.isFile()) continue;
  const normalizedPublicPath = `/${relativePath.replaceAll("\\", "/")}`;
  if (
    normalizedPublicPath.startsWith("/images/") &&
    /\.(?:webp|avif)$/.test(normalizedPublicPath)
  ) {
    actualPublicVariantPaths.add(normalizedPublicPath);
  }
  const publicHash = createHash("sha256")
    .update(readFileSync(path))
    .digest("hex");
  if (privateAnchorHashes.has(publicHash)) {
    errors.push(`Private visual anchor bytes leaked under public: ${relativePath}.`);
  }
  if (/visual-anchors|identity-source|source-v2/.test(relativePath)) {
    errors.push(`Private visual anchor naming leaked under public: ${relativePath}.`);
  }
}

for (const path of actualPublicVariantPaths) {
  if (!inventoryVariantPaths.has(path)) {
    errors.push(`Public image variant is not governed by the inventory: ${path}.`);
  }
}
for (const path of inventoryVariantPaths) {
  if (!actualPublicVariantPaths.has(path)) {
    errors.push(`Inventory image variant is missing from public: ${path}.`);
  }
}

async function normalizedPixels(path) {
  return sharp(path)
    .resize(PERCEPTUAL_SAMPLE_SIZE, PERCEPTUAL_SAMPLE_SIZE, {
      fit: "fill",
    })
    .greyscale()
    .raw()
    .toBuffer();
}

function pearsonCorrelation(left, right) {
  let leftSum = 0;
  let rightSum = 0;
  for (let index = 0; index < left.length; index += 1) {
    leftSum += left[index];
    rightSum += right[index];
  }
  const leftMean = leftSum / left.length;
  const rightMean = rightSum / right.length;
  let numerator = 0;
  let leftSquare = 0;
  let rightSquare = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftSquare += leftDelta * leftDelta;
    rightSquare += rightDelta * rightDelta;
  }
  const denominator = Math.sqrt(leftSquare * rightSquare);
  return denominator === 0 ? (leftSquare === rightSquare ? 1 : 0) : numerator / denominator;
}

async function checkPerceptualGroup(label, entries) {
  const samples = await Promise.all(
    entries.map(async (entry) => ({
      path: entry.variants.webp,
      pixels: await normalizedPixels(
        join(workspace, "public", entry.variants.webp.slice(1)),
      ),
    })),
  );
  let highest = { score: -1, left: "", right: "" };
  for (let leftIndex = 0; leftIndex < samples.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < samples.length;
      rightIndex += 1
    ) {
      const score = pearsonCorrelation(
        samples[leftIndex].pixels,
        samples[rightIndex].pixels,
      );
      if (score > highest.score) {
        highest = {
          score,
          left: samples[leftIndex].path,
          right: samples[rightIndex].path,
        };
      }
      if (score > PERCEPTUAL_PEARSON_THRESHOLD) {
        errors.push(
          `Perceptual ${label} collision: ${samples[leftIndex].path} <> ${
            samples[rightIndex].path
          } Pearson=${score.toFixed(6)} > ${PERCEPTUAL_PEARSON_THRESHOLD}.`,
        );
      }
    }
  }
  return highest;
}

const productMainPerceptual = await checkPerceptualGroup(
  "product-main",
  inventory.entries.filter((entry) => entry.role === "product-main"),
);
const lifestylePerceptual = await checkPerceptualGroup(
  "lifestyle",
  inventory.entries.filter((entry) => entry.role.endsWith("lifestyle")),
);

let weakestVariantPair = { score: 1, id: "" };
for (const pair of variantPairs) {
  const [webpPixels, avifPixels] = await Promise.all([
    normalizedPixels(pair.webp),
    normalizedPixels(pair.avif),
  ]);
  const score = pearsonCorrelation(webpPixels, avifPixels);
  if (score < weakestVariantPair.score) {
    weakestVariantPair = { score, id: pair.id };
  }
  if (score < VARIANT_PEARSON_THRESHOLD) {
    errors.push(
      `Responsive variant mismatch for ${pair.id}: Pearson=${score.toFixed(
        6,
      )} < ${VARIANT_PEARSON_THRESHOLD}.`,
    );
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  `Asset gate passed: 150 unique WebP and 150 unique AVIF public payloads; ` +
    `perceptual Pearson max product-main=${productMainPerceptual.score.toFixed(6)} ` +
    `lifestyle=${lifestylePerceptual.score.toFixed(6)} ` +
    `(threshold ${PERCEPTUAL_PEARSON_THRESHOLD}); weakest WebP/AVIF pair=` +
    `${weakestVariantPair.id}:${weakestVariantPair.score.toFixed(6)}; ` +
    `no registered private-anchor bytes or public symlinks found.`,
);
