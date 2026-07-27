/**
 * Canonical LIGNÉE Estate No. 01 catalog.
 *
 * The assortment, chapter assignment, category assignment, and TWD amounts are
 * locked by the approved plan. Prices and all physical product facts remain
 * sandbox drafts until the corresponding launch evidence is approved.
 */

export type CategoryId =
  | "apparel"
  | "accessories"
  | "home"
  | "stationery"
  | "tennis";

export type AudienceId = "men" | "women" | "unisex";

export type CollectionId =
  | "first-light-in-the-field"
  | "the-conservatory-hour"
  | "after-rain-the-library"
  | "dinner-at-the-long-table"
  | "the-private-court";

export type ProductKind =
  | "polo-shirt"
  | "oxford-shirt"
  | "knitwear"
  | "blazer"
  | "tailored-trousers"
  | "bermuda-shorts"
  | "dress"
  | "outerwear"
  | "skirt"
  | "waistcoat"
  | "belt"
  | "tote"
  | "briefcase"
  | "sunglasses"
  | "tie"
  | "loafers"
  | "boots"
  | "scarf"
  | "umbrella"
  | "cufflinks"
  | "candle"
  | "diffuser"
  | "throw"
  | "mug"
  | "tray"
  | "table-linen"
  | "candlesticks"
  | "cushion"
  | "bookends"
  | "notebook"
  | "pen"
  | "correspondence-cards"
  | "letter-opener"
  | "tennis-racquet"
  | "tennis-balls"
  | "racquet-cover"
  | "court-shoes";

export type ProductOptionKey =
  | "size"
  | "color"
  | "format"
  | "finish"
  | "capacity"
  | "scent"
  | "set"
  | "ink"
  | "grip";

export type SkuDisplayStatus = "preview" | "available" | "unavailable";
export type LaunchFactStatus = "sandbox-draft" | "requires-approval";

export interface CategoryMetadata {
  readonly id: CategoryId;
  readonly label: string;
  readonly englishLabel: string;
  readonly routeSegment: string;
  readonly description: string;
  readonly order: number;
}

export interface CollectionMetadata {
  readonly id: CollectionId;
  readonly name: string;
  readonly subtitle: string;
  readonly description: string;
}

export interface ProductOptionValue {
  readonly value: string;
  readonly label: string;
}

export interface ProductOptionAxis {
  readonly key: ProductOptionKey;
  readonly label: string;
  readonly values: readonly ProductOptionValue[];
}

export interface ProductImage {
  readonly assetId: string;
  readonly path: string;
  readonly detailPath: string;
  readonly alt: string;
  readonly picturedSkuId: string;
  readonly approvalStatus: LaunchFactStatus;
}

export interface Product {
  readonly id: string;
  readonly productCode: string;
  readonly launchPosition: number;
  readonly slug: string;
  readonly name: string;
  readonly subtitle: string;
  readonly kind: ProductKind;
  readonly category: CategoryId;
  readonly audience: AudienceId;
  readonly collectionId: CollectionId;
  readonly basePriceTwd: number;
  readonly priceStatus: "sandbox-draft";
  readonly taxIncluded: true;
  readonly launchStatus: "sandbox-ready";
  readonly purchasableInDemo: true;
  readonly purchasableInProduction: false;
  readonly optionAxes: readonly ProductOptionAxis[];
  readonly materialConcepts: readonly MaterialConceptId[];
  readonly description: string;
  readonly story: string;
  readonly sizing: string;
  readonly care: string;
  readonly image: ProductImage;
  readonly relatedProductIds: readonly string[];
  readonly launchGateCodes: readonly string[];
}

export interface SKU {
  readonly id: string;
  readonly skuCode: string;
  readonly productId: string;
  readonly options: Readonly<Partial<Record<ProductOptionKey, string>>>;
  readonly priceTwd?: number;
  readonly priceVersion: "sandbox-2026-07-24-v1";
  readonly taxIncluded: true;
  readonly displayStatus: SkuDisplayStatus;
  readonly representativeAssetId: string;
  readonly factsStatus: "requires-approval";
  readonly weightGrams: null;
  readonly packageDimensionsMm: null;
  readonly enabledInProduction: false;
}

export const categoryMetadata = [
  {
    id: "apparel",
    label: "服飾",
    englishLabel: "Apparel",
    routeSegment: "apparel",
    description: "為城市、田野與宅邸日常保留從容的克制剪裁。",
    order: 1,
  },
  {
    id: "accessories",
    label: "配件",
    englishLabel: "Accessories",
    routeSegment: "accessories",
    description: "在每日使用中留下時間質地的隨身物件。",
    order: 2,
  },
  {
    id: "home",
    label: "居家生活",
    englishLabel: "Home",
    routeSegment: "home",
    description: "從藏書室到長桌晚宴，為生活留下安靜秩序。",
    order: 3,
  },
  {
    id: "stationery",
    label: "文具",
    englishLabel: "Stationery",
    routeSegment: "stationery",
    description: "讓記錄、書信與整理成為可以延續的儀式。",
    order: 4,
  },
  {
    id: "tennis",
    label: "網球運動",
    englishLabel: "Tennis",
    routeSegment: "tennis",
    description: "為私人草地球場與會所往返而設計的十件系列。",
    order: 5,
  },
] as const satisfies readonly CategoryMetadata[];

export const categories = categoryMetadata;

export const collections = [
  {
    id: "first-light-in-the-field",
    name: "First Light in the Field",
    subtitle: "田野初光",
    description: "清晨的草露、馬房與通往林地的第一段路。",
  },
  {
    id: "the-conservatory-hour",
    name: "The Conservatory Hour",
    subtitle: "溫室時刻",
    description: "午後光線穿過玻璃，在葉影與衣褶間停留。",
  },
  {
    id: "after-rain-the-library",
    name: "After Rain, the Library",
    subtitle: "雨後，藏書室",
    description: "濕潤木質氣息與紙頁聲，構成回到室內的節奏。",
  },
  {
    id: "dinner-at-the-long-table",
    name: "Dinner at the Long Table",
    subtitle: "長桌晚宴",
    description: "燭光、織物與器物，讓款待保有從容。",
  },
  {
    id: "the-private-court",
    name: "The Private Court",
    subtitle: "私人草地球場",
    description: "白線、短草與會所露台，構成午後比賽的分寸。",
  },
] as const satisfies readonly CollectionMetadata[];

export const audienceMetadata: Readonly<
  Record<AudienceId, { readonly label: string; readonly englishLabel: string }>
> = {
  men: { label: "男士", englishLabel: "Men" },
  women: { label: "女士", englishLabel: "Women" },
  unisex: { label: "共用", englishLabel: "Unisex" },
};

export const materialConceptMetadata = {
  "cotton-direction": { label: "棉質方向（待供應確認）" },
  "knit-direction": { label: "針織方向（待供應確認）" },
  "tailoring-direction": { label: "剪裁織物方向（待供應確認）" },
  "outerwear-direction": { label: "外套織物方向（待供應確認）" },
  "leather-direction": { label: "皮革方向（待供應確認）" },
  "silk-direction": { label: "絲質方向（待供應確認）" },
  "metal-direction": { label: "金屬方向（待供應確認）" },
  "wood-direction": { label: "木質方向（待供應確認）" },
  "ceramic-direction": { label: "陶瓷方向（待供應確認）" },
  "glass-direction": { label: "透明材質方向（待供應確認）" },
  "paper-direction": { label: "紙材方向（待供應確認）" },
  "fragrance-direction": { label: "香氛配方方向（待安全確認）" },
  "performance-direction": { label: "運動機能方向（待性能確認）" },
  "racquet-direction": { label: "球拍結構方向（待性能確認）" },
  "textile-direction": { label: "家飾織物方向（待供應確認）" },
} as const;

export type MaterialConceptId = keyof typeof materialConceptMetadata;

const optionAxis = (
  key: ProductOptionKey,
  label: string,
  values: readonly (readonly [value: string, label: string])[],
): ProductOptionAxis => ({
  key,
  label,
  values: values.map(([value, valueLabel]) => ({ value, label: valueLabel })),
});

const apparelSizes = optionAxis("size", "尺寸", [
  ["s", "S（Sandbox）"],
  ["m", "M（Sandbox）"],
  ["l", "L（Sandbox）"],
]);

const tailoringColors = optionAxis("color", "顏色", [
  ["estate-olive", "莊園橄欖"],
  ["warm-ivory", "暖象牙"],
]);

const courtColors = optionAxis("color", "顏色", [
  ["court-ivory", "球場象牙"],
  ["deep-green", "深草綠"],
]);

const singleFormat = optionAxis("format", "規格", [
  ["launch-sample", "首發樣品規格"],
]);

const accessoryFinish = optionAxis("finish", "表面", [
  ["estate-dark", "莊園深色"],
  ["warm-natural", "暖自然色"],
]);

const shoeSizes = optionAxis("size", "鞋碼", [
  ["eu-40", "EU 40（Sandbox）"],
  ["eu-42", "EU 42（Sandbox）"],
]);

const beltSizes = optionAxis("size", "長度", [
  ["85cm", "85 cm（Sandbox）"],
  ["95cm", "95 cm（Sandbox）"],
]);

const racquetGrip = optionAxis("grip", "握把", [
  ["g2", "G2（Sandbox）"],
  ["g3", "G3（Sandbox）"],
]);

interface CatalogSeed {
  readonly name: string;
  readonly subtitle: string;
  readonly id: string;
  readonly category: CategoryId;
  readonly collectionId: CollectionId;
  readonly price: number;
  readonly kind: ProductKind;
  readonly audience: AudienceId;
  readonly material: MaterialConceptId;
  readonly optionAxes?: readonly ProductOptionAxis[];
}

const catalogSeeds: readonly CatalogSeed[] = [
  { name: "Field House Polo", subtitle: "田野會所 Polo 衫", id: "field-house-polo", category: "apparel", collectionId: "first-light-in-the-field", price: 7800, kind: "polo-shirt", audience: "men", material: "cotton-direction" },
  { name: "Alder Oxford", subtitle: "奧德牛津襯衫", id: "alder-oxford-shirt", category: "apparel", collectionId: "first-light-in-the-field", price: 8800, kind: "oxford-shirt", audience: "men", material: "cotton-direction" },
  { name: "Conservatory Knit", subtitle: "溫室薄針織衫", id: "conservatory-knit", category: "apparel", collectionId: "the-conservatory-hour", price: 9800, kind: "knitwear", audience: "women", material: "knit-direction" },
  { name: "Bracken Riding Blazer", subtitle: "蕨徑騎裝西裝外套", id: "bracken-riding-blazer", category: "apparel", collectionId: "first-light-in-the-field", price: 28800, kind: "blazer", audience: "men", material: "tailoring-direction" },
  { name: "Long Lawn Trousers", subtitle: "長草坪西裝褲", id: "long-lawn-trousers", category: "apparel", collectionId: "the-conservatory-hour", price: 13800, kind: "tailored-trousers", audience: "unisex", material: "tailoring-direction" },
  { name: "Keeper Bermuda Shorts", subtitle: "莊園守望百慕達短褲", id: "keeper-bermuda-shorts", category: "apparel", collectionId: "first-light-in-the-field", price: 8800, kind: "bermuda-shorts", audience: "men", material: "cotton-direction" },
  { name: "Walled Garden Dress", subtitle: "圍牆花園長洋裝", id: "walled-garden-dress", category: "apparel", collectionId: "the-conservatory-hour", price: 24800, kind: "dress", audience: "women", material: "tailoring-direction" },
  { name: "Hawthorn Trench", subtitle: "山楂樹風衣", id: "hawthorn-trench", category: "apparel", collectionId: "first-light-in-the-field", price: 28800, kind: "outerwear", audience: "unisex", material: "outerwear-direction" },
  { name: "Moorland Wax Jacket", subtitle: "荒原蠟棉獵裝外套", id: "moorland-wax-jacket", category: "apparel", collectionId: "first-light-in-the-field", price: 24800, kind: "outerwear", audience: "unisex", material: "outerwear-direction" },
  { name: "North Hall Overcoat", subtitle: "北廳羊毛長大衣", id: "north-hall-overcoat", category: "apparel", collectionId: "after-rain-the-library", price: 36800, kind: "outerwear", audience: "unisex", material: "outerwear-direction" },
  { name: "Morning Room Cardigan", subtitle: "晨間室開襟針織衫", id: "morning-room-cardigan", category: "apparel", collectionId: "the-conservatory-hour", price: 12800, kind: "knitwear", audience: "women", material: "knit-direction" },
  { name: "Orchard Roll-Neck", subtitle: "果園高領針織衫", id: "orchard-roll-neck", category: "apparel", collectionId: "first-light-in-the-field", price: 11800, kind: "knitwear", audience: "unisex", material: "knit-direction" },
  { name: "Estate Silk Blouse", subtitle: "莊園絲質襯衫", id: "estate-silk-blouse", category: "apparel", collectionId: "the-conservatory-hour", price: 9800, kind: "oxford-shirt", audience: "women", material: "silk-direction" },
  { name: "Cedar Pleated Skirt", subtitle: "雪松百褶中長裙", id: "cedar-pleated-skirt", category: "apparel", collectionId: "the-conservatory-hour", price: 12800, kind: "skirt", audience: "women", material: "tailoring-direction" },
  { name: "Paddock Waistcoat", subtitle: "馬場人字紋背心", id: "paddock-waistcoat", category: "apparel", collectionId: "first-light-in-the-field", price: 13800, kind: "waistcoat", audience: "unisex", material: "tailoring-direction" },
  { name: "Garden Shirt Dress", subtitle: "花園襯衫洋裝", id: "garden-shirt-dress", category: "apparel", collectionId: "the-conservatory-hour", price: 22800, kind: "dress", audience: "women", material: "cotton-direction" },
  { name: "Bridle Line Belt", subtitle: "韁繩線條皮帶", id: "bridle-line-belt", category: "accessories", collectionId: "first-light-in-the-field", price: 6800, kind: "belt", audience: "unisex", material: "leather-direction", optionAxes: [beltSizes, accessoryFinish] },
  { name: "Glasshouse Tote", subtitle: "玻璃溫室托特包", id: "glasshouse-tote", category: "accessories", collectionId: "the-conservatory-hour", price: 16800, kind: "tote", audience: "unisex", material: "textile-direction" },
  { name: "Estate Dispatch Briefcase", subtitle: "莊園信差公事包", id: "estate-dispatch-briefcase", category: "accessories", collectionId: "after-rain-the-library", price: 32000, kind: "briefcase", audience: "unisex", material: "leather-direction" },
  { name: "South Lawn Sunglasses", subtitle: "南草坪太陽眼鏡", id: "south-lawn-sunglasses", category: "accessories", collectionId: "first-light-in-the-field", price: 9800, kind: "sunglasses", audience: "unisex", material: "outerwear-direction" },
  { name: "Long Table Tie", subtitle: "長桌領帶", id: "long-table-tie", category: "accessories", collectionId: "dinner-at-the-long-table", price: 7200, kind: "tie", audience: "men", material: "silk-direction" },
  { name: "Bridle Loafers", subtitle: "馬銜扣樂福鞋", id: "bridle-loafers", category: "accessories", collectionId: "first-light-in-the-field", price: 14800, kind: "loafers", audience: "unisex", material: "leather-direction", optionAxes: [shoeSizes, accessoryFinish] },
  { name: "Keeper Riding Boots", subtitle: "莊園騎士長靴", id: "keeper-riding-boots", category: "accessories", collectionId: "first-light-in-the-field", price: 18800, kind: "boots", audience: "unisex", material: "leather-direction", optionAxes: [shoeSizes, accessoryFinish] },
  { name: "House Colours Silk Scarf", subtitle: "家族色絲巾", id: "house-colours-silk-scarf", category: "accessories", collectionId: "the-conservatory-hour", price: 6800, kind: "scarf", audience: "unisex", material: "silk-direction" },
  { name: "Ash Walking Umbrella", subtitle: "梣木長柄傘", id: "ash-walking-umbrella", category: "accessories", collectionId: "after-rain-the-library", price: 8800, kind: "umbrella", audience: "unisex", material: "wood-direction" },
  { name: "Signet Cufflinks", subtitle: "印戒造型袖扣", id: "signet-cufflinks", category: "accessories", collectionId: "dinner-at-the-long-table", price: 6800, kind: "cufflinks", audience: "men", material: "metal-direction" },
  { name: "Hearth No. 4 Candle", subtitle: "四號壁爐香氛蠟燭", id: "hearth-number-four-candle", category: "home", collectionId: "dinner-at-the-long-table", price: 3200, kind: "candle", audience: "unisex", material: "fragrance-direction" },
  { name: "Wet Cedar Diffuser", subtitle: "雨杉擴香", id: "wet-cedar-diffuser", category: "home", collectionId: "after-rain-the-library", price: 4800, kind: "diffuser", audience: "unisex", material: "fragrance-direction" },
  { name: "Stable Door Throw", subtitle: "馬房門毛毯", id: "stable-door-throw", category: "home", collectionId: "first-light-in-the-field", price: 12800, kind: "throw", audience: "unisex", material: "textile-direction" },
  { name: "Breakfast Room Mug", subtitle: "早餐室馬克杯", id: "breakfast-room-mug", category: "home", collectionId: "dinner-at-the-long-table", price: 2200, kind: "mug", audience: "unisex", material: "ceramic-direction" },
  { name: "Library Service Tray", subtitle: "藏書室木製托盤", id: "library-service-tray", category: "home", collectionId: "after-rain-the-library", price: 7600, kind: "tray", audience: "unisex", material: "wood-direction" },
  { name: "Manor Table Linen", subtitle: "莊園桌巾組", id: "manor-table-linen", category: "home", collectionId: "dinner-at-the-long-table", price: 8800, kind: "table-linen", audience: "unisex", material: "textile-direction" },
  { name: "Long Hall Candlesticks", subtitle: "長廳燭台", id: "long-hall-candlesticks", category: "home", collectionId: "dinner-at-the-long-table", price: 12800, kind: "candlesticks", audience: "unisex", material: "metal-direction" },
  { name: "Drawing Room Cushion", subtitle: "會客室羊毛靠墊", id: "drawing-room-cushion", category: "home", collectionId: "dinner-at-the-long-table", price: 6800, kind: "cushion", audience: "unisex", material: "textile-direction" },
  { name: "Library Bookends", subtitle: "藏書室書擋", id: "library-bookends", category: "home", collectionId: "after-rain-the-library", price: 7600, kind: "bookends", audience: "unisex", material: "metal-direction" },
  { name: "Estate Ledger Notebook", subtitle: "莊園簿冊筆記本", id: "estate-ledger-notebook", category: "stationery", collectionId: "after-rain-the-library", price: 5800, kind: "notebook", audience: "unisex", material: "paper-direction" },
  { name: "Correspondence Pen", subtitle: "書信原子筆", id: "correspondence-pen", category: "stationery", collectionId: "after-rain-the-library", price: 3800, kind: "pen", audience: "unisex", material: "metal-direction" },
  { name: "Valet Desk Tray", subtitle: "管家桌面收納盤", id: "valet-desk-tray", category: "stationery", collectionId: "after-rain-the-library", price: 6800, kind: "tray", audience: "unisex", material: "wood-direction" },
  { name: "House Correspondence Cards", subtitle: "私人書信卡組", id: "house-correspondence-cards", category: "stationery", collectionId: "after-rain-the-library", price: 2200, kind: "correspondence-cards", audience: "unisex", material: "paper-direction" },
  { name: "Brass Letter Opener", subtitle: "黃銅拆信刀", id: "brass-letter-opener", category: "stationery", collectionId: "after-rain-the-library", price: 3800, kind: "letter-opener", audience: "unisex", material: "metal-direction" },
  { name: "Ash-Tone Tennis Racquet", subtitle: "梣木色網球拍", id: "ash-tone-tennis-racquet", category: "tennis", collectionId: "the-private-court", price: 18800, kind: "tennis-racquet", audience: "unisex", material: "racquet-direction", optionAxes: [racquetGrip] },
  { name: "Baseline Tennis Dress", subtitle: "底線網球洋裝", id: "baseline-tennis-dress", category: "tennis", collectionId: "the-private-court", price: 9800, kind: "dress", audience: "women", material: "performance-direction", optionAxes: [apparelSizes, courtColors] },
  { name: "Pavilion Pleated Skirt", subtitle: "看台百褶網球裙", id: "pavilion-pleated-skirt", category: "tennis", collectionId: "the-private-court", price: 7800, kind: "skirt", audience: "women", material: "performance-direction", optionAxes: [apparelSizes, courtColors] },
  { name: "Match Point Cable Vest", subtitle: "賽末點麻花針織背心", id: "match-point-cable-vest", category: "tennis", collectionId: "the-private-court", price: 8800, kind: "waistcoat", audience: "unisex", material: "knit-direction", optionAxes: [apparelSizes, courtColors] },
  { name: "House Championship Tennis Balls", subtitle: "家族錦標賽網球組", id: "house-championship-tennis-balls", category: "tennis", collectionId: "the-private-court", price: 2800, kind: "tennis-balls", audience: "unisex", material: "performance-direction" },
  { name: "Bridle Leather Racquet Cover", subtitle: "韁繩皮革球拍套", id: "bridle-leather-racquet-cover", category: "tennis", collectionId: "the-private-court", price: 9800, kind: "racquet-cover", audience: "unisex", material: "leather-direction" },
  { name: "Clubhouse Tailored Shorts", subtitle: "會所剪裁網球短褲", id: "clubhouse-tailored-shorts", category: "tennis", collectionId: "the-private-court", price: 7800, kind: "bermuda-shorts", audience: "unisex", material: "performance-direction", optionAxes: [apparelSizes, courtColors] },
  { name: "Centre Court Performance Polo", subtitle: "中央球場機能 Polo 衫", id: "centre-court-performance-polo", category: "tennis", collectionId: "the-private-court", price: 7800, kind: "polo-shirt", audience: "unisex", material: "performance-direction", optionAxes: [apparelSizes, courtColors] },
  { name: "Centre Line Court Shoes", subtitle: "中線網球鞋", id: "centre-line-court-shoes", category: "tennis", collectionId: "the-private-court", price: 12800, kind: "court-shoes", audience: "unisex", material: "performance-direction", optionAxes: [shoeSizes, courtColors] },
  { name: "Clubhouse Racquet Tote", subtitle: "會所球拍托特包", id: "clubhouse-racquet-tote", category: "tennis", collectionId: "the-private-court", price: 16800, kind: "tote", audience: "unisex", material: "textile-direction" },
];

const optionValuesFor = (
  options: readonly ProductOptionAxis[],
): readonly Readonly<Partial<Record<ProductOptionKey, string>>>[] => {
  let combinations: readonly Readonly<Partial<Record<ProductOptionKey, string>>>[] = [{}];
  for (const axis of options) {
    combinations = combinations.flatMap((combination) =>
      axis.values.map((value) => ({ ...combination, [axis.key]: value.value })),
    );
  }
  return combinations;
};

const defaultOptionsForSeed = (seed: CatalogSeed): readonly ProductOptionAxis[] => {
  if (seed.optionAxes) return seed.optionAxes;
  if (seed.category === "apparel") return [apparelSizes, tailoringColors];
  if (seed.category === "tennis") return [singleFormat];
  return [singleFormat, accessoryFinish];
};

const picturedSkuId = (
  id: string,
  options: readonly ProductOptionAxis[],
): string => {
  const values = options.map((axis) => axis.values[0]?.value).filter(Boolean);
  return [id, ...values].join("-");
};

const allIds = catalogSeeds.map((seed) => seed.id);

export const products: readonly Product[] = Object.freeze(
  catalogSeeds.map((seed, index): Product => {
    const launchPosition = index + 1;
    const optionAxes = defaultOptionsForSeed(seed);
    const sameChapter = catalogSeeds
      .filter((candidate) => candidate.collectionId === seed.collectionId && candidate.id !== seed.id)
      .map((candidate) => candidate.id);
    const relatedProductIds = [
      ...sameChapter.slice(index % Math.max(1, sameChapter.length)),
      ...sameChapter,
      ...allIds.filter((id) => id !== seed.id),
    ].filter((id, candidateIndex, values) => values.indexOf(id) === candidateIndex).slice(0, 3);

    return {
      id: seed.id,
      productCode: `LIG-ENO1-${String(launchPosition).padStart(3, "0")}`,
      launchPosition,
      slug: seed.id,
      name: seed.name,
      subtitle: seed.subtitle,
      kind: seed.kind,
      category: seed.category,
      audience: seed.audience,
      collectionId: seed.collectionId,
      basePriceTwd: seed.price,
      priceStatus: "sandbox-draft",
      taxIncluded: true,
      launchStatus: "sandbox-ready",
      purchasableInDemo: true,
      purchasableInProduction: false,
      optionAxes,
      materialConcepts: [seed.material],
      description: `${seed.subtitle}以克制比例回應本章日常；材質、產地與量產規格須於正式發布前逐項核准。`,
      story: `屬於 ${collections.find((collection) => collection.id === seed.collectionId)?.subtitle ?? "Alderwick House"} 的一件日常。`,
      sizing: "目前僅供 Sandbox 選擇流程；平量、重量與實際規格須完成打樣後發布。",
      care: "照護方式須依最終材質與供應商標示核准；正式發布前不作耐用或維修保證。",
      image: {
        assetId: `${seed.id}-main`,
        path: `/images/products/${seed.id}.webp`,
        detailPath: `/images/product-details/${seed.id}-detail.webp`,
        alt: `${seed.subtitle}的 LIGNÉE Sandbox 商品影像`,
        picturedSkuId: picturedSkuId(seed.id, optionAxes),
        approvalStatus: "requires-approval",
      },
      relatedProductIds,
      launchGateCodes: [
        "physical-sample",
        "cost-margin-tax-price",
        "materials-origin-manufacture",
        "measurements-care-safety",
        "inventory-packaging-media",
        "legal-trademark",
      ],
    };
  }),
);

export const skus: readonly SKU[] = Object.freeze(
  products.flatMap((product) =>
    optionValuesFor(product.optionAxes).map((options, index): SKU => {
      const optionValues = product.optionAxes.map((axis) => options[axis.key]).filter(Boolean);
      return {
        id: [product.id, ...optionValues].join("-"),
        skuCode: `${product.productCode}-${String(index + 1).padStart(2, "0")}`,
        productId: product.id,
        options,
        priceVersion: "sandbox-2026-07-24-v1",
        taxIncluded: true,
        displayStatus: "preview",
        representativeAssetId: product.image.assetId,
        factsStatus: "requires-approval",
        weightGrams: null,
        packageDimensionsMm: null,
        enabledInProduction: false,
      };
    }),
  ),
);

/** Publicly unreachable product concepts explicitly removed from Estate No. 01. */
export const excludedProductIds = Object.freeze([
  "rain-ledger-watch",
  "evening-sheer-tights",
  "dewdrop-earrings",
  "guest-wing-bed-linen",
  "long-table-glasses",
  "conservatory-stem-vase",
  "estate-almanac",
  "heirloom-portrait-frame",
  "library-pocket-square",
  "foxglove-leather-gloves",
]);

export interface ProductPriceRange {
  readonly min: number;
  readonly max: number;
  readonly isRange: boolean;
}

const productById = new Map(products.map((product) => [product.id, product] as const));
const productBySlug = new Map(products.map((product) => [product.slug, product] as const));
const skuById = new Map(skus.map((catalogSku) => [catalogSku.id, catalogSku] as const));
const skusByProductId = new Map<string, SKU[]>();
const categoryById = new Map<string, CategoryMetadata>(
  categoryMetadata.map((category) => [category.id, category]),
);
const collectionById = new Map<string, CollectionMetadata>(
  collections.map((collection) => [collection.id, collection]),
);

for (const product of products) skusByProductId.set(product.id, []);
for (const catalogSku of skus) skusByProductId.get(catalogSku.productId)?.push(catalogSku);

export const getProductById = (id: string): Product | undefined => productById.get(id);
export const getProductBySlug = (slug: string): Product | undefined => productBySlug.get(slug);
export const getSkuById = (id: string): SKU | undefined => skuById.get(id);
export const getCategoryById = (id: string): CategoryMetadata | undefined => categoryById.get(id);
export const getCollectionById = (id: string): CollectionMetadata | undefined => collectionById.get(id);
export const isCategoryId = (value: string): value is CategoryId => categoryById.has(value);
export const isAudienceId = (value: string): value is AudienceId =>
  Object.prototype.hasOwnProperty.call(audienceMetadata, value);
export const isCollectionId = (value: string): value is CollectionId =>
  collectionById.has(value);
export const isMaterialConceptId = (value: string): value is MaterialConceptId =>
  Object.prototype.hasOwnProperty.call(materialConceptMetadata, value);
export const getSkusForProduct = (productId: string): readonly SKU[] =>
  skusByProductId.get(productId) ?? [];
export const getProductsByCategory = (category: CategoryId): readonly Product[] =>
  products.filter((product) => product.category === category);
export const getProductsByAudience = (audience: AudienceId): readonly Product[] =>
  products.filter((product) => product.audience === audience);
export const getApparelByAudience = (
  audience: Exclude<AudienceId, "unisex">,
): readonly Product[] =>
  products.filter(
    (product) =>
      product.category === "apparel" &&
      (product.audience === audience || product.audience === "unisex"),
  );
export const getProductsByCollection = (collectionId: CollectionId): readonly Product[] =>
  products.filter((product) => product.collectionId === collectionId);
export const getRelatedProducts = (productId: string): readonly Product[] => {
  const product = getProductById(productId);
  return product
    ? product.relatedProductIds.flatMap((id) => {
        const related = getProductById(id);
        return related ? [related] : [];
      })
    : [];
};
export const getMaterialConceptLabel = (id: string): string | undefined =>
  isMaterialConceptId(id) ? materialConceptMetadata[id].label : undefined;
export const getEffectiveSkuPrice = (skuOrId: SKU | string): number | undefined => {
  const catalogSku = typeof skuOrId === "string" ? getSkuById(skuOrId) : skuOrId;
  if (!catalogSku) return undefined;
  const product = getProductById(catalogSku.productId);
  return product ? catalogSku.priceTwd ?? product.basePriceTwd : undefined;
};
export const getProductPriceRange = (productId: string): ProductPriceRange | undefined => {
  const prices = getSkusForProduct(productId)
    .map(getEffectiveSkuPrice)
    .filter((price): price is number => price !== undefined);
  if (prices.length === 0) return undefined;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return { min, max, isRange: min !== max };
};
export const findSkuForOptions = (
  productId: string,
  selected: Readonly<Partial<Record<ProductOptionKey, string>>>,
): SKU | undefined => {
  const product = getProductById(productId);
  if (!product) return undefined;
  const requiredKeys = product.optionAxes.map((axis) => axis.key);
  if (
    Object.keys(selected).length !== requiredKeys.length ||
    requiredKeys.some((key) => typeof selected[key] !== "string")
  ) {
    return undefined;
  }
  return getSkusForProduct(productId).find((catalogSku) =>
    requiredKeys.every((key) => catalogSku.options[key] === selected[key]),
  );
};

export const formatTwd = (amount: number): string =>
  `NT$${new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(amount)}`;

export const normalizeCatalogSearchText = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("zh-TW")
    .replace(/\s+/g, " ");

export const getProductSearchDocument = (product: Product): string => {
  const collection = getCollectionById(product.collectionId);
  const category = getCategoryById(product.category);
  return normalizeCatalogSearchText(
    [
      product.name,
      product.subtitle,
      product.description,
      product.story,
      product.kind,
      category?.label,
      category?.englishLabel,
      collection?.name,
      collection?.subtitle,
      ...product.materialConcepts.map(getMaterialConceptLabel),
    ]
      .filter(Boolean)
      .join(" "),
  );
};

export const searchProducts = (query: string): readonly Product[] => {
  const normalized = normalizeCatalogSearchText(query);
  if (!normalized) return products;
  const tokens = normalized.split(" ").filter(Boolean);
  return products.filter((product) => {
    const document = getProductSearchDocument(product);
    return tokens.every((token) => document.includes(token));
  });
};

const expectedCategoryCounts: Readonly<Record<CategoryId, number>> = {
  apparel: 16,
  accessories: 10,
  home: 9,
  stationery: 5,
  tennis: 10,
};

const expectedCollectionCounts: Readonly<Record<CollectionId, number>> = {
  "first-light-in-the-field": 13,
  "the-conservatory-hour": 9,
  "after-rain-the-library": 11,
  "dinner-at-the-long-table": 7,
  "the-private-court": 10,
};

const duplicateValues = (values: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
};

export const validateCatalog = (
  candidateProducts: readonly Product[] = products,
  candidateSkus: readonly SKU[] = skus,
): readonly string[] => {
  const errors: string[] = [];
  const candidateProductById = new Map(candidateProducts.map((product) => [product.id, product]));
  const candidateSkuById = new Map(candidateSkus.map((catalogSku) => [catalogSku.id, catalogSku]));

  if (candidateProducts.length !== 50) {
    errors.push(`Expected exactly 50 products; received ${candidateProducts.length}.`);
  }
  for (const duplicate of duplicateValues(candidateProducts.map((product) => product.id))) {
    errors.push(`Duplicate product id: ${duplicate}.`);
  }
  for (const duplicate of duplicateValues(candidateProducts.map((product) => product.slug))) {
    errors.push(`Duplicate product slug: ${duplicate}.`);
  }
  for (const duplicate of duplicateValues(candidateProducts.map((product) => product.productCode))) {
    errors.push(`Duplicate product code: ${duplicate}.`);
  }
  for (const duplicate of duplicateValues(candidateSkus.map((catalogSku) => catalogSku.id))) {
    errors.push(`Duplicate SKU id: ${duplicate}.`);
  }
  for (const duplicate of duplicateValues(candidateSkus.map((catalogSku) => catalogSku.skuCode))) {
    errors.push(`Duplicate SKU code: ${duplicate}.`);
  }
  for (const category of categoryMetadata) {
    const count = candidateProducts.filter((product) => product.category === category.id).length;
    if (count !== expectedCategoryCounts[category.id]) {
      errors.push(`Category ${category.id} must contain ${expectedCategoryCounts[category.id]} products; received ${count}.`);
    }
  }
  for (const collection of collections) {
    const count = candidateProducts.filter((product) => product.collectionId === collection.id).length;
    if (count !== expectedCollectionCounts[collection.id]) {
      errors.push(`Collection ${collection.id} must contain ${expectedCollectionCounts[collection.id]} products; received ${count}.`);
    }
  }
  for (const product of candidateProducts) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.id) || product.slug !== product.id) {
      errors.push(`Product ${product.id} has an unsafe or non-canonical identifier.`);
    }
    if (!Number.isSafeInteger(product.basePriceTwd) || product.basePriceTwd <= 0) {
      errors.push(`Product ${product.id} has an invalid TWD price.`);
    }
    if (product.image.path !== `/images/products/${product.id}.webp`) {
      errors.push(`Product ${product.id} has a non-canonical main image path.`);
    }
    if (product.image.detailPath !== `/images/product-details/${product.id}-detail.webp`) {
      errors.push(`Product ${product.id} has a non-canonical detail image path.`);
    }
    if (product.optionAxes.length === 0 || product.relatedProductIds.length !== 3) {
      errors.push(`Product ${product.id} is missing options or related products.`);
    }
    if (product.relatedProductIds.some((id) => !candidateProductById.has(id) || id === product.id)) {
      errors.push(`Product ${product.id} has an invalid related product.`);
    }
    const productSkus = candidateSkus.filter((catalogSku) => catalogSku.productId === product.id);
    if (productSkus.length === 0) errors.push(`Product ${product.id} has no SKU.`);
    const pictured = candidateSkuById.get(product.image.picturedSkuId);
    if (!pictured || pictured.productId !== product.id) {
      errors.push(`Product ${product.id} has an invalid pictured SKU.`);
    }
  }
  for (const catalogSku of candidateSkus) {
    const product = candidateProductById.get(catalogSku.productId);
    if (!product) {
      errors.push(`SKU ${catalogSku.id} references missing product ${catalogSku.productId}.`);
      continue;
    }
    const requiredKeys = product.optionAxes.map((axis) => axis.key);
    if (
      Object.keys(catalogSku.options).length !== requiredKeys.length ||
      requiredKeys.some((key) => typeof catalogSku.options[key] !== "string")
    ) {
      errors.push(`SKU ${catalogSku.id} does not provide every option axis.`);
    }
    if (catalogSku.enabledInProduction || catalogSku.factsStatus !== "requires-approval") {
      errors.push(`SKU ${catalogSku.id} is not launch-gated.`);
    }
  }
  for (const excludedId of excludedProductIds) {
    if (candidateProductById.has(excludedId)) errors.push(`Excluded product ${excludedId} is public.`);
  }
  return errors;
};

export const catalogValidationErrors = Object.freeze([...validateCatalog()]);
export const catalogIsValid = catalogValidationErrors.length === 0;
export const assertCatalogConsistency = (): true => {
  if (!catalogIsValid) {
    throw new Error(`Invalid LIGNÉE catalog:\n${catalogValidationErrors.join("\n")}`);
  }
  return true;
};

assertCatalogConsistency();

export const catalogStats = Object.freeze({
  productCount: products.length,
  skuCount: skus.length,
  productCountsByCategory: Object.freeze(
    Object.fromEntries(
      categoryMetadata.map((category) => [category.id, getProductsByCategory(category.id).length]),
    ) as Record<CategoryId, number>,
  ),
  productCountsByCollection: Object.freeze(
    Object.fromEntries(
      collections.map((collection) => [collection.id, getProductsByCollection(collection.id).length]),
    ) as Record<CollectionId, number>,
  ),
});
