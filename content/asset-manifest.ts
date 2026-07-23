import { products } from "@/lib/catalog";
import { estateCollections, estateJournalEntries } from "@/lib/editorial";

export const ASSET_SOURCE = "OpenAI image generation" as const;
export const ASSET_STATUS = "approved" as const;
export const ASSET_GENERATED_AT = "2026-07-22" as const;
export const PROMPT_AUDIT_PROVENANCE =
  "Stable audit identifier derived from canonical asset identity; not a cryptographic hash of the original generation prompt, which was not retained in this repository." as const;

export type AssetType = "product" | "editorial";
export type DisplayAspectRatio = "4:5" | "3:2";
export type PromptSourceIdentifier =
  `canonical-copy:${"lib/catalog.ts" | "lib/editorial.ts"}#${string}`;
export type PromptAuditIdentifier = `audit-id:${string}`;

export interface NormalizedFocusPoint {
  /** Horizontal focal position from 0 (left) to 1 (right). */
  readonly x: number;
  /** Vertical focal position from 0 (top) to 1 (bottom). */
  readonly y: number;
}

export interface AssetQaChecklist {
  readonly humanVisualReviewCompleted: true;
  readonly noPublicPersonReferenceObserved: true;
  readonly noThirdPartyLogoObserved: true;
  readonly anatomyAndHandsReviewed: true;
  readonly structurePlausibleForConcept: true;
  readonly noGeneratedTextObserved: true;
  readonly cropFocusReviewed: true;
  readonly conceptOnlyAcknowledged: true;
  readonly notRealProductPhotographyAcknowledged: true;
}

export interface AssetQualityReview {
  readonly status: typeof ASSET_STATUS;
  readonly method: "human visual review";
  readonly reviewedAt: typeof ASSET_GENERATED_AT;
  readonly checklist: AssetQaChecklist;
  readonly limitations: string;
}

export interface AssetManifestEntry {
  readonly id: string;
  readonly path: string;
  readonly type: AssetType;
  readonly source: typeof ASSET_SOURCE;
  readonly status: typeof ASSET_STATUS;
  readonly generatedAt: typeof ASSET_GENERATED_AT;
  /**
   * Identifies the canonical copy used to audit or reconstruct the visual brief.
   * It is not a claim that the original generation prompt exists at this path.
   */
  readonly promptSource: PromptSourceIdentifier;
  /** Historical PLAN.md field name; value is an audit ID, not a digest. */
  readonly promptHash: PromptAuditIdentifier;
  readonly promptHashProvenance: typeof PROMPT_AUDIT_PROVENANCE;
  readonly originalWidth: number;
  readonly originalHeight: number;
  readonly displayAspectRatio: DisplayAspectRatio;
  readonly focus: NormalizedFocusPoint;
  readonly fileSizeBytes: number;
  readonly alt: string;
  readonly depictedProductId: string | null;
  readonly depictedCollectionId: string | null;
  readonly depictedJournalId: string | null;
  readonly depictedSkuId: string | null;
  readonly qa: AssetQualityReview;
  readonly notes: string;
}

interface EditorialFileMetadata {
  readonly originalWidth: number;
  readonly originalHeight: number;
  readonly displayAspectRatio: DisplayAspectRatio;
  readonly focus: NormalizedFocusPoint;
  readonly fileSizeBytes: number;
}

type ProductId = (typeof products)[number]["id"];
type EditorialPath =
  | (typeof estateCollections)[number]["image"]
  | (typeof estateJournalEntries)[number]["image"];

const PRODUCT_NOTES =
  "AI-generated fictional LIGNÉE concept image. Human visual review observed no recognizable public-person reference or third-party logo. It is not photography of a real manufactured product and has no third-party image licensor.";

const EDITORIAL_NOTES =
  "AI-generated fictional The Lignée Estate concept image. Human visual review observed no recognizable public-person reference or third-party logo. It is not documentary or real-product photography and has no third-party image licensor.";

const QA_REVIEW: AssetQualityReview = Object.freeze({
  status: ASSET_STATUS,
  method: "human visual review",
  reviewedAt: ASSET_GENERATED_AT,
  checklist: Object.freeze({
    humanVisualReviewCompleted: true,
    noPublicPersonReferenceObserved: true,
    noThirdPartyLogoObserved: true,
    anatomyAndHandsReviewed: true,
    structurePlausibleForConcept: true,
    noGeneratedTextObserved: true,
    cropFocusReviewed: true,
    conceptOnlyAcknowledged: true,
    notRealProductPhotographyAcknowledged: true,
  }),
  limitations:
    "Observational prototype review only: it cannot establish identity, rights clearance, material accuracy, manufacturability, product safety, or correspondence to a physical item.",
});

const PRODUCT_FILE_SIZE_BYTES = {
  "field-house-polo": 127_378,
  "alder-oxford-shirt": 93_122,
  "conservatory-knit": 79_916,
  "bracken-riding-blazer": 139_226,
  "long-lawn-trousers": 78_922,
  "keeper-bermuda-shorts": 102_312,
  "walled-garden-dress": 90_392,
  "bridle-line-belt": 97_794,
  "rain-ledger-watch": 105_578,
  "glasshouse-tote": 192_702,
  "estate-dispatch-briefcase": 109_380,
  "south-lawn-sunglasses": 88_934,
  "long-table-tie": 215_802,
  "evening-sheer-tights": 167_246,
  "dewdrop-earrings": 58_062,
  "hearth-number-four-candle": 116_566,
  "wet-cedar-diffuser": 99_968,
  "guest-wing-bed-linen": 86_012,
  "stable-door-throw": 220_808,
  "breakfast-room-mug": 84_020,
  "long-table-glasses": 156_284,
  "library-service-tray": 112_386,
  "conservatory-stem-vase": 74_208,
  "estate-ledger-notebook": 141_328,
  "correspondence-pen": 102_126,
  "valet-desk-tray": 114_846,
  "estate-almanac": 122_298,
} as const satisfies Record<ProductId, number>;

const EDITORIAL_FILE_METADATA = {
  "/images/editorial/first-light-in-the-field.webp": {
    originalWidth: 2_400,
    originalHeight: 1_600,
    displayAspectRatio: "3:2",
    focus: { x: 0.72, y: 0.52 },
    fileSizeBytes: 300_852,
  },
  "/images/editorial/the-conservatory-hour.webp": {
    originalWidth: 2_400,
    originalHeight: 1_600,
    displayAspectRatio: "3:2",
    focus: { x: 0.5, y: 0.48 },
    fileSizeBytes: 193_364,
  },
  "/images/editorial/after-rain-the-library.webp": {
    originalWidth: 2_400,
    originalHeight: 1_600,
    displayAspectRatio: "3:2",
    focus: { x: 0.34, y: 0.5 },
    fileSizeBytes: 121_804,
  },
  "/images/editorial/dinner-at-the-long-table.webp": {
    originalWidth: 2_400,
    originalHeight: 1_600,
    displayAspectRatio: "3:2",
    focus: { x: 0.56, y: 0.46 },
    fileSizeBytes: 144_160,
  },
  "/images/editorial/before-the-house-wakes.webp": {
    originalWidth: 1_921,
    originalHeight: 2_400,
    displayAspectRatio: "4:5",
    focus: { x: 0.5, y: 0.45 },
    fileSizeBytes: 208_236,
  },
  "/images/editorial/the-quiet-geometry-of-a-conservatory.webp": {
    originalWidth: 1_921,
    originalHeight: 2_400,
    displayAspectRatio: "4:5",
    focus: { x: 0.54, y: 0.47 },
    fileSizeBytes: 279_476,
  },
  "/images/editorial/notes-kept-after-rain.webp": {
    originalWidth: 1_535,
    originalHeight: 2_400,
    displayAspectRatio: "4:5",
    focus: { x: 0.44, y: 0.45 },
    fileSizeBytes: 95_428,
  },
  "/images/editorial/a-table-made-for-time.webp": {
    originalWidth: 1_921,
    originalHeight: 2_400,
    displayAspectRatio: "4:5",
    focus: { x: 0.54, y: 0.45 },
    fileSizeBytes: 132_326,
  },
} as const satisfies Record<EditorialPath, EditorialFileMetadata>;

const makePromptAudit = (
  sourceFile: "lib/catalog.ts" | "lib/editorial.ts",
  canonicalId: string,
): {
  promptSource: PromptSourceIdentifier;
  promptHash: PromptAuditIdentifier;
  promptHashProvenance: typeof PROMPT_AUDIT_PROVENANCE;
} => ({
  promptSource: `canonical-copy:${sourceFile}#${canonicalId}`,
  promptHash: `audit-id:${canonicalId}:${ASSET_GENERATED_AT}`,
  promptHashProvenance: PROMPT_AUDIT_PROVENANCE,
});

const productAssets: readonly AssetManifestEntry[] = products.map((product) => ({
  id: product.image.assetId,
  path: product.image.path,
  type: "product",
  source: ASSET_SOURCE,
  status: ASSET_STATUS,
  generatedAt: ASSET_GENERATED_AT,
  ...makePromptAudit("lib/catalog.ts", product.id),
  originalWidth: 1_600,
  originalHeight: 2_000,
  displayAspectRatio: "4:5",
  focus: { x: 0.5, y: 0.5 },
  fileSizeBytes: PRODUCT_FILE_SIZE_BYTES[product.id],
  alt: product.image.alt,
  depictedProductId: product.id,
  depictedCollectionId: product.collectionId,
  depictedJournalId: null,
  depictedSkuId: product.image.picturedSkuId,
  qa: QA_REVIEW,
  notes: PRODUCT_NOTES,
}));

const collectionAssets: readonly AssetManifestEntry[] = estateCollections.map(
  (collection) => {
    const file = EDITORIAL_FILE_METADATA[collection.image];
    return {
      id: `collection-${collection.id}-hero`,
      path: collection.image,
      type: "editorial",
      source: ASSET_SOURCE,
      status: ASSET_STATUS,
      generatedAt: ASSET_GENERATED_AT,
      ...makePromptAudit("lib/editorial.ts", collection.id),
      ...file,
      alt: collection.imageAlt,
      depictedProductId: null,
      depictedCollectionId: collection.id,
      depictedJournalId: null,
      depictedSkuId: null,
      qa: QA_REVIEW,
      notes: EDITORIAL_NOTES,
    };
  },
);

const journalAssets: readonly AssetManifestEntry[] = estateJournalEntries.map(
  (entry) => {
    const file = EDITORIAL_FILE_METADATA[entry.image];
    return {
      id: `${entry.id}-hero`,
      path: entry.image,
      type: "editorial",
      source: ASSET_SOURCE,
      status: ASSET_STATUS,
      generatedAt: ASSET_GENERATED_AT,
      ...makePromptAudit("lib/editorial.ts", entry.id),
      ...file,
      alt: entry.imageAlt,
      depictedProductId: null,
      depictedCollectionId: entry.collectionId,
      depictedJournalId: entry.id,
      depictedSkuId: null,
      qa: QA_REVIEW,
      notes: EDITORIAL_NOTES,
    };
  },
);

/**
 * Canonical launch manifest: exactly 27 product images and 8 editorial images.
 *
 * `approved` means the image passed human prototype editorial review. It does
 * not verify a physical product, sourcing, material, manufacture, provenance,
 * identity, or rights clearance, and it does not make the estate real history.
 */
export const assetManifest: readonly AssetManifestEntry[] = Object.freeze([
  ...productAssets,
  ...collectionAssets,
  ...journalAssets,
]);

const assetManifestByPath = new Map(assetManifest.map((asset) => [asset.path, asset] as const));

/** Returns the approved manifest record used for focus-aware image presentation. */
export function getAssetManifestEntryByPath(path: string): AssetManifestEntry | undefined {
  return assetManifestByPath.get(path);
}

export const assetManifestSummary = Object.freeze({
  productImages: productAssets.length,
  editorialImages: collectionAssets.length + journalAssets.length,
  totalImages: assetManifest.length,
});
