/**
 * Canonical, local-only commerce catalog for the LIGNÉE concept store.
 *
 * Product facts in this file are prototype copy. Material entries are deliberately
 * labelled as concepts and must not be treated as verified sourcing claims.
 */

export type CategoryId = "apparel" | "accessories" | "home" | "stationery";

export type AudienceId = "men" | "women" | "unisex";

export type CollectionId =
  | "first-light-in-the-field"
  | "the-conservatory-hour"
  | "after-rain-the-library"
  | "dinner-at-the-long-table";

export type ProductKind =
  | "polo-shirt"
  | "oxford-shirt"
  | "knitwear"
  | "blazer"
  | "tailored-trousers"
  | "bermuda-shorts"
  | "long-dress"
  | "belt"
  | "watch"
  | "tote"
  | "briefcase"
  | "sunglasses"
  | "tie"
  | "hosiery"
  | "earrings"
  | "scented-candle"
  | "diffuser"
  | "bed-linen"
  | "throw"
  | "mug"
  | "glassware"
  | "wooden-tray"
  | "vase"
  | "notebook"
  | "ballpoint-pen"
  | "desk-tray"
  | "journal-planner";

export type ProductOptionKey =
  | "size"
  | "color"
  | "format"
  | "finish"
  | "capacity"
  | "scent"
  | "set"
  | "ink";

export type SkuDisplayStatus = "preview" | "available" | "unavailable";

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
  readonly alt: string;
  readonly picturedSkuId: string;
}

export interface Product {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly subtitle: string;
  readonly kind: ProductKind;
  readonly category: CategoryId;
  readonly audience: AudienceId;
  readonly collectionId: CollectionId;
  readonly basePriceTwd: number;
  readonly optionAxes: readonly ProductOptionAxis[];
  readonly materialConcepts: readonly MaterialConceptId[];
  readonly description: string;
  readonly story: string;
  readonly sizing: string;
  readonly care: string;
  readonly image: ProductImage;
  readonly relatedProductIds: readonly string[];
}

export interface SKU {
  readonly id: string;
  readonly productId: string;
  readonly options: Readonly<Partial<Record<ProductOptionKey, string>>>;
  readonly priceTwd?: number;
  readonly displayStatus: SkuDisplayStatus;
  readonly representativeAssetId: string;
}

export const categoryMetadata = [
  {
    id: "apparel",
    label: "服飾",
    englishLabel: "Apparel",
    routeSegment: "apparel",
    description: "為城市與莊園日常而設計的克制剪裁。",
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
    description: "從溫室、藏書室到長桌晚宴的生活器物。",
    order: 3,
  },
  {
    id: "stationery",
    label: "文具",
    englishLabel: "Stationery",
    routeSegment: "stationery",
    description: "讓記錄與整理成為安靜而持久的儀式。",
    order: 4,
  },
] as const satisfies readonly CategoryMetadata[];

/** Alias retained for concise consumers. */
export const categories = categoryMetadata;

export const collections = [
  {
    id: "first-light-in-the-field",
    name: "First Light in the Field",
    subtitle: "晨光落在田野",
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
    description: "燭光、織物與玻璃器皿，讓款待保有從容。",
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
  "cotton-pique": { label: "棉質珠地概念" },
  "oxford-cotton": { label: "牛津棉概念" },
  "fine-knit": { label: "細緻針織概念" },
  "tailored-wool": { label: "精紡羊毛概念" },
  "cotton-twill": { label: "棉質斜紋概念" },
  "draped-weave": { label: "垂墜織物概念" },
  "leather-concept": { label: "真皮方向概念" },
  "steel-concept": { label: "金屬錶殼概念" },
  "canvas-weave": { label: "厚實帆布概念" },
  "acetate-concept": { label: "醋酸纖維框概念" },
  "silk-weave": { label: "絲質織紋概念" },
  "sheer-knit": { label: "細密彈性織物概念" },
  "pearl-concept": { label: "珍珠光澤概念" },
  "wax-blend": { label: "植物蠟調和概念" },
  "fragrance-oil": { label: "香氛油配方概念" },
  "woven-cotton": { label: "長纖棉織物概念" },
  "wool-blend": { label: "羊毛混紡概念" },
  "glazed-ceramic": { label: "釉面陶瓷概念" },
  "crystalline-glass": { label: "清透玻璃概念" },
  "ash-wood": { label: "梣木方向概念" },
  "stoneware-concept": { label: "霧面陶質概念" },
  "archival-paper": { label: "耐久紙材概念" },
  "brass-concept": { label: "黃銅方向概念" },
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

const garmentSizeAxis = optionAxis("size", "尺寸", [
  ["xs", "XS"],
  ["s", "S"],
  ["m", "M"],
  ["l", "L"],
  ["xl", "XL"],
]);

const image = (
  productId: string,
  alt: string,
  picturedSkuId: string,
): ProductImage => ({
  assetId: `${productId}-main`,
  path: `/images/products/${productId}.webp`,
  alt,
  picturedSkuId,
});

export const products = [
  {
    id: "field-house-polo",
    slug: "field-house-polo",
    name: "Field House Polo",
    subtitle: "田野會所 Polo 衫",
    kind: "polo-shirt",
    category: "apparel",
    audience: "men",
    collectionId: "first-light-in-the-field",
    basePriceTwd: 7800,
    optionAxes: [
      garmentSizeAxis,
      optionAxis("color", "顏色", [
        ["deep-olive", "深橄欖"],
        ["warm-ivory", "暖象牙"],
      ]),
    ],
    materialConcepts: ["cotton-pique"],
    description: "乾淨領型與適度份量，適合晨間田野與城市午餐。",
    story: "它屬於一天尚未被行程填滿的那段晨光。",
    sizing: "標準版型；XS–XL，建議依平日尺寸選擇。",
    care: "建議冷水柔洗、整形平放陰乾；實際標示以量產版本為準。",
    image: image(
      "field-house-polo",
      "深橄欖色 Polo 衫置於暖色木椅上的概念商品照",
      "field-house-polo-m-deep-olive",
    ),
    relatedProductIds: ["keeper-bermuda-shorts", "bridle-line-belt", "south-lawn-sunglasses"],
  },
  {
    id: "alder-oxford-shirt",
    slug: "alder-oxford-shirt",
    name: "Alder Oxford",
    subtitle: "奧德牛津襯衫",
    kind: "oxford-shirt",
    category: "apparel",
    audience: "men",
    collectionId: "first-light-in-the-field",
    basePriceTwd: 8800,
    optionAxes: [
      garmentSizeAxis,
      optionAxis("color", "顏色", [
        ["chalk", "粉筆白"],
        ["mist-blue", "霧藍"],
      ]),
    ],
    materialConcepts: ["oxford-cotton"],
    description: "柔和的領片與收斂輪廓，從書房延續到晚間餐桌。",
    story: "一件好襯衫，不必提醒旁人它已陪伴多年。",
    sizing: "微寬鬆版型；XS–XL，可內搭薄針織。",
    care: "建議冷水柔洗、低溫熨燙；實際標示以量產版本為準。",
    image: image(
      "alder-oxford-shirt",
      "粉筆白牛津襯衫懸掛於莊園衣櫃前的概念商品照",
      "alder-oxford-shirt-m-chalk",
    ),
    relatedProductIds: ["bracken-riding-blazer", "long-lawn-trousers", "long-table-tie"],
  },
  {
    id: "conservatory-knit",
    slug: "conservatory-knit",
    name: "Conservatory Knit",
    subtitle: "溫室薄針織衫",
    kind: "knitwear",
    category: "apparel",
    audience: "women",
    collectionId: "the-conservatory-hour",
    basePriceTwd: 9800,
    optionAxes: [
      garmentSizeAxis,
      optionAxis("color", "顏色", [
        ["oatmeal", "燕麥"],
        ["claret", "深酒紅"],
      ]),
    ],
    materialConcepts: ["fine-knit"],
    description: "貼近身形但不緊束，為溫室午後保留輕盈層次。",
    story: "薄針織收住玻璃窗後逐漸轉涼的光。",
    sizing: "合身版型；XS–XL，介於兩碼時建議選大一碼。",
    care: "建議專業清潔或低溫手洗，平放陰乾；以量產標示為準。",
    image: image(
      "conservatory-knit",
      "燕麥色薄針織衫在溫室柔光中的概念商品照",
      "conservatory-knit-m-oatmeal",
    ),
    relatedProductIds: ["long-lawn-trousers", "walled-garden-dress", "dewdrop-earrings"],
  },
  {
    id: "bracken-riding-blazer",
    slug: "bracken-riding-blazer",
    name: "Bracken Riding Blazer",
    subtitle: "蕨徑騎裝西裝外套",
    kind: "blazer",
    category: "apparel",
    audience: "unisex",
    collectionId: "first-light-in-the-field",
    basePriceTwd: 28800,
    optionAxes: [
      garmentSizeAxis,
      optionAxis("color", "顏色", [
        ["peat", "泥炭棕"],
        ["midnight", "午夜藍"],
      ]),
    ],
    materialConcepts: ["tailored-wool"],
    description: "借取騎裝比例，收窄肩線並保留現代活動空間。",
    story: "林徑歸來後，它仍能自然地坐上長桌席位。",
    sizing: "結構式肩線、直身剪裁；XS–XL。",
    care: "建議專業乾洗並使用寬肩衣架；以量產標示為準。",
    image: image(
      "bracken-riding-blazer",
      "泥炭棕騎裝輪廓西裝外套的概念商品照",
      "bracken-riding-blazer-m-peat",
    ),
    relatedProductIds: ["alder-oxford-shirt", "long-lawn-trousers", "rain-ledger-watch"],
  },
  {
    id: "long-lawn-trousers",
    slug: "long-lawn-trousers",
    name: "Long Lawn Trousers",
    subtitle: "長草坪西裝褲",
    kind: "tailored-trousers",
    category: "apparel",
    audience: "women",
    collectionId: "the-conservatory-hour",
    basePriceTwd: 13800,
    optionAxes: [
      garmentSizeAxis,
      optionAxis("color", "顏色", [
        ["charcoal", "炭灰"],
        ["oat", "淺燕麥"],
      ]),
    ],
    materialConcepts: ["tailored-wool"],
    description: "高腰直筒與安靜垂墜，為長日行程留出餘裕。",
    story: "步過長草坪時，褲腳只輕輕帶起一線風。",
    sizing: "高腰直筒；XS–XL，褲長預留修改空間。",
    care: "建議專業乾洗、蒸氣整形；以量產標示為準。",
    image: image(
      "long-lawn-trousers",
      "炭灰色高腰直筒西裝褲的概念商品照",
      "long-lawn-trousers-m-charcoal",
    ),
    relatedProductIds: ["conservatory-knit", "bracken-riding-blazer", "glasshouse-tote"],
  },
  {
    id: "keeper-bermuda-shorts",
    slug: "keeper-bermuda-shorts",
    name: "Keeper Bermuda Shorts",
    subtitle: "莊園守望百慕達短褲",
    kind: "bermuda-shorts",
    category: "apparel",
    audience: "men",
    collectionId: "first-light-in-the-field",
    basePriceTwd: 8800,
    optionAxes: [
      garmentSizeAxis,
      optionAxis("color", "顏色", [
        ["field-stone", "田野石色"],
        ["moss", "苔綠"],
      ]),
    ],
    materialConcepts: ["cotton-twill"],
    description: "俐落及膝比例與實用口袋，適合暖季的戶外午前。",
    story: "它記得每一條通往果園與馬房的近路。",
    sizing: "中腰直筒；XS–XL，褲長約至膝上。",
    care: "建議冷水柔洗、反面低溫熨燙；以量產標示為準。",
    image: image(
      "keeper-bermuda-shorts",
      "田野石色百慕達短褲置於木長凳上的概念商品照",
      "keeper-bermuda-shorts-m-field-stone",
    ),
    relatedProductIds: ["field-house-polo", "bridle-line-belt", "south-lawn-sunglasses"],
  },
  {
    id: "walled-garden-dress",
    slug: "walled-garden-dress",
    name: "Walled Garden Dress",
    subtitle: "圍牆花園長洋裝",
    kind: "long-dress",
    category: "apparel",
    audience: "women",
    collectionId: "the-conservatory-hour",
    basePriceTwd: 24800,
    optionAxes: [
      garmentSizeAxis,
      optionAxis("color", "顏色", [
        ["oxblood", "牛血紅"],
        ["fern", "蕨葉綠"],
      ]),
    ],
    materialConcepts: ["draped-weave"],
    description: "長線條與收斂腰節，在移動時展現柔和份量。",
    story: "花園門闔上後，晚宴才真正開始。",
    sizing: "自然腰線、長裙襬；XS–XL。",
    care: "建議專業清潔並懸掛收納；以量產標示為準。",
    image: image(
      "walled-garden-dress",
      "牛血紅長洋裝在圍牆花園入口的概念商品照",
      "walled-garden-dress-m-oxblood",
    ),
    relatedProductIds: ["dewdrop-earrings", "glasshouse-tote", "conservatory-stem-vase"],
  },
  {
    id: "bridle-line-belt",
    slug: "bridle-line-belt",
    name: "Bridle Line Belt",
    subtitle: "韁繩線條皮帶",
    kind: "belt",
    category: "accessories",
    audience: "unisex",
    collectionId: "first-light-in-the-field",
    basePriceTwd: 6800,
    optionAxes: [
      optionAxis("size", "腰圍", [
        ["80", "80 cm"],
        ["85", "85 cm"],
        ["90", "90 cm"],
        ["95", "95 cm"],
        ["100", "100 cm"],
      ]),
      optionAxis("color", "顏色", [
        ["saddle", "馬鞍棕"],
        ["oxblood", "牛血紅"],
      ]),
    ],
    materialConcepts: ["leather-concept", "brass-concept"],
    description: "窄幅比例與圓潤扣件，從騎具線條汲取安靜秩序。",
    story: "留下的不是裝飾，而是每日使用形成的光澤。",
    sizing: "五段腰圍；建議量測常穿褲款的皮帶位置。",
    care: "避免浸水與曝曬，以乾布拭淨；材質與保養仍待打樣確認。",
    image: image(
      "bridle-line-belt",
      "馬鞍棕窄幅皮帶盤放於木桌上的概念商品照",
      "bridle-line-belt-90-saddle",
    ),
    relatedProductIds: ["keeper-bermuda-shorts", "field-house-polo", "estate-dispatch-briefcase"],
  },
  {
    id: "rain-ledger-watch",
    slug: "rain-ledger-watch",
    name: "Rain Ledger Watch",
    subtitle: "雨日簿冊腕錶",
    kind: "watch",
    category: "accessories",
    audience: "unisex",
    collectionId: "after-rain-the-library",
    basePriceTwd: 58000,
    optionAxes: [
      optionAxis("size", "錶徑", [
        ["36mm", "36 mm"],
        ["40mm", "40 mm"],
      ]),
      optionAxis("color", "錶帶色", [
        ["walnut", "胡桃棕"],
        ["black", "墨黑"],
      ]),
    ],
    materialConcepts: ["steel-concept", "leather-concept"],
    description: "清晰刻度與低調錶殼，保留讀時最必要的線條。",
    story: "窗外落雨時，秒針仍按自己的步伐前行。",
    sizing: "36 mm 與 40 mm 兩種概念錶徑；規格待打樣確認。",
    care: "避免撞擊、磁場與長時間浸水；正式保固與防水規格待確認。",
    image: image(
      "rain-ledger-watch",
      "胡桃棕錶帶腕錶置於舊書旁的概念商品照",
      "rain-ledger-watch-36mm-walnut",
    ),
    relatedProductIds: ["estate-ledger-notebook", "correspondence-pen", "estate-dispatch-briefcase"],
  },
  {
    id: "glasshouse-tote",
    slug: "glasshouse-tote",
    name: "Glasshouse Tote",
    subtitle: "玻璃溫室托特包",
    kind: "tote",
    category: "accessories",
    audience: "women",
    collectionId: "the-conservatory-hour",
    basePriceTwd: 16800,
    optionAxes: [
      optionAxis("size", "尺寸", [
        ["medium", "Medium"],
        ["large", "Large"],
      ]),
      optionAxis("color", "顏色", [
        ["ecru", "原胚米"],
        ["olive", "橄欖綠"],
      ]),
    ],
    materialConcepts: ["canvas-weave", "leather-concept"],
    description: "能容納一日所需的開放式輪廓，以深色收邊穩住比例。",
    story: "從花房剪下的枝葉，也該有從容回家的方式。",
    sizing: "Medium 與 Large；容量為概念規格，待打樣確認。",
    care: "局部輕拭並保持乾燥；材質與保養仍待打樣確認。",
    image: image(
      "glasshouse-tote",
      "原胚米色托特包置於溫室長椅上的概念商品照",
      "glasshouse-tote-medium-ecru",
    ),
    relatedProductIds: ["walled-garden-dress", "conservatory-knit", "estate-ledger-notebook"],
  },
  {
    id: "estate-dispatch-briefcase",
    slug: "estate-dispatch-briefcase",
    name: "Estate Dispatch Briefcase",
    subtitle: "莊園信差公事包",
    kind: "briefcase",
    category: "accessories",
    audience: "unisex",
    collectionId: "after-rain-the-library",
    basePriceTwd: 32000,
    optionAxes: [
      optionAxis("format", "版型", [
        ["slim", "Slim"],
        ["standard", "Standard"],
      ]),
      optionAxis("color", "顏色", [
        ["bracken", "蕨棕"],
        ["oxblood", "牛血紅"],
      ]),
    ],
    materialConcepts: ["leather-concept"],
    description: "薄而挺立的公事輪廓，配置文件與日常器物的獨立位置。",
    story: "重要的信件總在雨停後送抵藏書室。",
    sizing: "Slim 與 Standard；筆電相容尺寸待打樣確認。",
    care: "避免浸水、曝曬與過度裝載；材質與保養仍待確認。",
    image: image(
      "estate-dispatch-briefcase",
      "蕨棕色公事包立於藏書室桌邊的概念商品照",
      "estate-dispatch-briefcase-slim-bracken",
    ),
    relatedProductIds: ["rain-ledger-watch", "correspondence-pen", "valet-desk-tray"],
  },
  {
    id: "south-lawn-sunglasses",
    slug: "south-lawn-sunglasses",
    name: "South Lawn Sunglasses",
    subtitle: "南草坪太陽眼鏡",
    kind: "sunglasses",
    category: "accessories",
    audience: "unisex",
    collectionId: "first-light-in-the-field",
    basePriceTwd: 9800,
    optionAxes: [
      optionAxis("color", "鏡框", [
        ["tortoise", "玳瑁棕"],
        ["deep-olive", "深橄欖"],
      ]),
      optionAxis("finish", "鏡片", [
        ["green", "灰綠"],
        ["brown", "茶棕"],
      ]),
    ],
    materialConcepts: ["acetate-concept"],
    description: "略帶圓角的經典框型，讓午後強光變得柔和。",
    story: "南草坪的光線總比時鐘早一步抵達。",
    sizing: "中等框寬；實際鏡架尺寸與 UV 規格待打樣驗證。",
    care: "以眼鏡布輕拭，避免高溫與化學溶劑。",
    image: image(
      "south-lawn-sunglasses",
      "玳瑁棕框灰綠鏡片太陽眼鏡的概念商品照",
      "south-lawn-sunglasses-tortoise-green",
    ),
    relatedProductIds: ["field-house-polo", "keeper-bermuda-shorts", "bridle-line-belt"],
  },
  {
    id: "long-table-tie",
    slug: "long-table-tie",
    name: "Long Table Tie",
    subtitle: "長桌領帶",
    kind: "tie",
    category: "accessories",
    audience: "men",
    collectionId: "dinner-at-the-long-table",
    basePriceTwd: 7200,
    optionAxes: [
      optionAxis("color", "顏色", [
        ["claret", "深酒紅"],
        ["olive", "橄欖綠"],
        ["midnight", "午夜藍"],
      ]),
    ],
    materialConcepts: ["silk-weave"],
    description: "窄而不尖銳的比例，以低對比織紋承接晚間光線。",
    story: "晚餐開始前，只需最後整理一次領結。",
    sizing: "單一長度概念規格；實際尺寸待打樣確認。",
    care: "建議專業清潔，解結後平放或懸掛。",
    image: image(
      "long-table-tie",
      "深酒紅領帶放在晚宴襯衫旁的概念商品照",
      "long-table-tie-claret",
    ),
    relatedProductIds: ["alder-oxford-shirt", "bracken-riding-blazer", "long-table-glasses"],
  },
  {
    id: "evening-sheer-tights",
    slug: "evening-sheer-tights",
    name: "Evening Sheer Tights",
    subtitle: "暮色絲襪",
    kind: "hosiery",
    category: "accessories",
    audience: "women",
    collectionId: "the-conservatory-hour",
    basePriceTwd: 4800,
    optionAxes: [
      optionAxis("size", "尺寸", [
        ["s-m", "S–M"],
        ["l-xl", "L–XL"],
      ]),
      optionAxis("color", "顏色", [
        ["smoke", "煙灰"],
        ["black", "墨黑"],
      ]),
    ],
    materialConcepts: ["sheer-knit"],
    description: "均勻霧面與細緻透膚度，為長裙保留最後一層光影。",
    story: "暮色落下時，細節才開始被看見。",
    sizing: "S–M 與 L–XL；正式彈性與尺寸表待打樣確認。",
    care: "建議置入洗衣袋冷水手洗；拆封退換規則須於正式上線前確認。",
    image: image(
      "evening-sheer-tights",
      "煙灰色霧面絲襪與長洋裝搭配的概念商品照",
      "evening-sheer-tights-s-m-smoke",
    ),
    relatedProductIds: ["walled-garden-dress", "dewdrop-earrings", "conservatory-knit"],
  },
  {
    id: "dewdrop-earrings",
    slug: "dewdrop-earrings",
    name: "Dewdrop Earrings",
    subtitle: "露珠耳環",
    kind: "earrings",
    category: "accessories",
    audience: "women",
    collectionId: "the-conservatory-hour",
    basePriceTwd: 12800,
    optionAxes: [
      optionAxis("size", "尺寸", [
        ["petite", "Petite"],
        ["classic", "Classic"],
      ]),
      optionAxis("finish", "金屬色", [
        ["soft-gold", "柔金"],
        ["silver", "銀色"],
      ]),
    ],
    materialConcepts: ["pearl-concept", "brass-concept"],
    description: "圓潤光澤與極簡耳針，像溫室葉片上停留的清晨水珠。",
    story: "它不為盛裝而生，只為讓光多停留一刻。",
    sizing: "Petite 與 Classic 兩種比例；實際尺寸待打樣確認。",
    care: "避免香水、潮濕與碰撞；拆封退換規則須於正式上線前確認。",
    image: image(
      "dewdrop-earrings",
      "柔金色小型圓潤耳環置於亞麻布上的概念商品照",
      "dewdrop-earrings-petite-soft-gold",
    ),
    relatedProductIds: ["walled-garden-dress", "conservatory-knit", "conservatory-stem-vase"],
  },
  {
    id: "hearth-number-four-candle",
    slug: "hearth-number-four-candle",
    name: "Hearth No. 4 Candle",
    subtitle: "四號壁爐香氛蠟燭",
    kind: "scented-candle",
    category: "home",
    audience: "unisex",
    collectionId: "dinner-at-the-long-table",
    basePriceTwd: 3200,
    optionAxes: [
      optionAxis("scent", "香氣", [
        ["cedar-embers", "雪松餘燼"],
        ["black-tea-fig", "紅茶無花果"],
      ]),
      optionAxis("capacity", "容量", [
        ["220g", "220 g"],
        ["420g", "420 g"],
      ]),
    ],
    materialConcepts: ["wax-blend", "fragrance-oil"],
    description: "低沉木質與乾燥果香，為晚餐後的房間留下溫度。",
    story: "最後一位客人離席後，壁爐仍替房間守夜。",
    sizing: "220 g 與 420 g 概念容量；燃燒時間待配方測試。",
    care: "首次燃燒應形成完整蠟池；每次點燃前修剪燭芯。",
    image: image(
      "hearth-number-four-candle",
      "深色玻璃香氛蠟燭在壁爐旁的概念商品照",
      "hearth-number-four-candle-cedar-embers-220g",
    ),
    relatedProductIds: ["wet-cedar-diffuser", "stable-door-throw", "long-table-glasses"],
  },
  {
    id: "wet-cedar-diffuser",
    slug: "wet-cedar-diffuser",
    name: "Wet Cedar Diffuser",
    subtitle: "雨杉擴香",
    kind: "diffuser",
    category: "home",
    audience: "unisex",
    collectionId: "after-rain-the-library",
    basePriceTwd: 4800,
    optionAxes: [
      optionAxis("scent", "香氣", [
        ["wet-cedar", "雨後雪松"],
        ["orris-paper", "鳶尾紙頁"],
      ]),
      optionAxis("capacity", "容量", [
        ["150ml", "150 ml"],
        ["250ml", "250 ml"],
      ]),
    ],
    materialConcepts: ["fragrance-oil", "crystalline-glass"],
    description: "帶有潮濕木質與紙頁氣息，適合入口與書房。",
    story: "雨停之後，林地的氣息被留在門廊裡。",
    sizing: "150 ml 與 250 ml 概念容量；擴香時間待配方測試。",
    care: "置於通風處並避免日照；翻轉擴香枝時保護桌面。",
    image: image(
      "wet-cedar-diffuser",
      "透明深色擴香瓶置於藏書室窗邊的概念商品照",
      "wet-cedar-diffuser-wet-cedar-150ml",
    ),
    relatedProductIds: ["hearth-number-four-candle", "estate-ledger-notebook", "library-service-tray"],
  },
  {
    id: "guest-wing-bed-linen",
    slug: "guest-wing-bed-linen",
    name: "Guest Wing Bed Linen",
    subtitle: "客翼床包組",
    kind: "bed-linen",
    category: "home",
    audience: "unisex",
    collectionId: "dinner-at-the-long-table",
    basePriceTwd: 12800,
    optionAxes: [
      optionAxis("size", "床型", [
        ["double", "Double"],
        ["queen", "Queen"],
        ["king", "King"],
      ]),
      optionAxis("color", "顏色", [
        ["warm-ivory", "暖象牙"],
        ["mist-grey", "霧灰"],
      ]),
    ],
    materialConcepts: ["woven-cotton"],
    description: "細緻包邊與沉靜色調，讓客房在夜裡顯得格外安定。",
    story: "真正的款待，從客人闔上房門後才開始。",
    sizing: "Double、Queen、King 概念規格；實際公分數待打樣確認。",
    care: "建議冷水機洗、低溫烘乾；以量產標示為準。",
    image: image(
      "guest-wing-bed-linen",
      "暖象牙床包組鋪設於英倫莊園客房的概念商品照",
      "guest-wing-bed-linen-double-warm-ivory",
    ),
    relatedProductIds: ["stable-door-throw", "hearth-number-four-candle", "wet-cedar-diffuser"],
  },
  {
    id: "stable-door-throw",
    slug: "stable-door-throw",
    name: "Stable Door Throw",
    subtitle: "馬房門毛毯",
    kind: "throw",
    category: "home",
    audience: "unisex",
    collectionId: "first-light-in-the-field",
    basePriceTwd: 12800,
    optionAxes: [
      optionAxis("color", "顏色", [
        ["heather", "石楠灰"],
        ["deep-olive", "深橄欖"],
        ["claret", "深酒紅"],
      ]),
    ],
    materialConcepts: ["wool-blend"],
    description: "有份量的柔軟織面，適合閱讀椅、車後座與清晨門廊。",
    story: "馬房門一開，冷空氣便提醒人披上一層溫暖。",
    sizing: "單一概念尺寸，約可覆蓋單人閱讀椅；實際尺寸待確認。",
    care: "建議通風除塵與專業清潔；以量產標示為準。",
    image: image(
      "stable-door-throw",
      "石楠灰毛毯搭在馬房木門上的概念商品照",
      "stable-door-throw-heather",
    ),
    relatedProductIds: ["guest-wing-bed-linen", "hearth-number-four-candle", "breakfast-room-mug"],
  },
  {
    id: "breakfast-room-mug",
    slug: "breakfast-room-mug",
    name: "Breakfast Room Mug",
    subtitle: "早餐室馬克杯",
    kind: "mug",
    category: "home",
    audience: "unisex",
    collectionId: "dinner-at-the-long-table",
    basePriceTwd: 2200,
    optionAxes: [
      optionAxis("capacity", "容量", [
        ["300ml", "300 ml"],
        ["420ml", "420 ml"],
      ]),
      optionAxis("color", "釉色", [
        ["cream", "乳霜白"],
        ["forest", "森林綠"],
      ]),
    ],
    materialConcepts: ["glazed-ceramic"],
    description: "厚實杯緣與舒適握把，為晨間茶飲保留溫度。",
    story: "早餐室最早亮起的，總是一只仍冒著熱氣的杯子。",
    sizing: "300 ml 與 420 ml 概念容量；實際容量待打樣確認。",
    care: "建議手洗；洗碗機與微波適用性待量產測試。",
    image: image(
      "breakfast-room-mug",
      "乳霜白馬克杯置於早餐室木桌上的概念商品照",
      "breakfast-room-mug-300ml-cream",
    ),
    relatedProductIds: ["stable-door-throw", "long-table-glasses", "estate-almanac"],
  },
  {
    id: "long-table-glasses",
    slug: "long-table-glasses",
    name: "Long Table Glasses",
    subtitle: "長桌玻璃杯組",
    kind: "glassware",
    category: "home",
    audience: "unisex",
    collectionId: "dinner-at-the-long-table",
    basePriceTwd: 5800,
    optionAxes: [
      optionAxis("set", "組合", [
        ["two", "兩入"],
        ["four", "四入"],
        ["six", "六入"],
      ]),
    ],
    materialConcepts: ["crystalline-glass"],
    description: "纖細杯壁與穩定杯底，在長桌燭光下留下清楚折射。",
    story: "舉杯的聲音很輕，卻足以讓整張長桌安靜片刻。",
    sizing: "兩入、四入、六入組；實際容量待打樣確認。",
    care: "建議分件手洗並以柔布擦乾；耐熱規格待量產測試。",
    image: image(
      "long-table-glasses",
      "兩只清透玻璃杯立於燭光長桌上的概念商品照",
      "long-table-glasses-two",
    ),
    relatedProductIds: ["library-service-tray", "hearth-number-four-candle", "long-table-tie"],
  },
  {
    id: "library-service-tray",
    slug: "library-service-tray",
    name: "Library Service Tray",
    subtitle: "藏書室木製托盤",
    kind: "wooden-tray",
    category: "home",
    audience: "unisex",
    collectionId: "after-rain-the-library",
    basePriceTwd: 7600,
    optionAxes: [
      optionAxis("size", "尺寸", [
        ["small", "Small"],
        ["large", "Large"],
      ]),
      optionAxis("finish", "表面色", [
        ["natural", "自然木色"],
        ["smoked", "煙燻木色"],
      ]),
    ],
    materialConcepts: ["ash-wood"],
    description: "微抬邊緣與內收把手，適合茶具、書信與案頭小物。",
    story: "雨天的茶，總由這只托盤送進藏書室。",
    sizing: "Small 與 Large；實際長寬待打樣確認。",
    care: "以微濕布擦拭後立即擦乾，避免浸泡與高溫。",
    image: image(
      "library-service-tray",
      "自然木色托盤承載茶杯與書信的概念商品照",
      "library-service-tray-small-natural",
    ),
    relatedProductIds: ["long-table-glasses", "breakfast-room-mug", "wet-cedar-diffuser"],
  },
  {
    id: "conservatory-stem-vase",
    slug: "conservatory-stem-vase",
    name: "Conservatory Stem Vase",
    subtitle: "溫室枝梗花瓶",
    kind: "vase",
    category: "home",
    audience: "unisex",
    collectionId: "the-conservatory-hour",
    basePriceTwd: 9200,
    optionAxes: [
      optionAxis("size", "尺寸", [
        ["low", "Low"],
        ["tall", "Tall"],
      ]),
      optionAxis("finish", "表面", [
        ["chalk", "粉筆白"],
        ["moss", "苔綠"],
      ]),
    ],
    materialConcepts: ["stoneware-concept"],
    description: "收窄瓶口托住單枝與鬆散花束，霧面輪廓不搶去植物光澤。",
    story: "溫室裡被修下的一枝，也值得單獨被看見。",
    sizing: "Low 與 Tall；實際高度與口徑待打樣確認。",
    care: "以中性清潔劑手洗，避免碰撞；防水性待量產測試。",
    image: image(
      "conservatory-stem-vase",
      "粉筆白低型花瓶插著單枝綠葉的概念商品照",
      "conservatory-stem-vase-low-chalk",
    ),
    relatedProductIds: ["walled-garden-dress", "dewdrop-earrings", "glasshouse-tote"],
  },
  {
    id: "estate-ledger-notebook",
    slug: "estate-ledger-notebook",
    name: "Estate Ledger Notebook",
    subtitle: "莊園簿冊筆記本",
    kind: "notebook",
    category: "stationery",
    audience: "unisex",
    collectionId: "after-rain-the-library",
    basePriceTwd: 5800,
    optionAxes: [
      optionAxis("size", "尺寸", [
        ["a5", "A5"],
        ["a4", "A4"],
      ]),
      optionAxis("color", "封面色", [
        ["walnut", "胡桃棕"],
        ["deep-olive", "深橄欖"],
      ]),
    ],
    materialConcepts: ["leather-concept", "archival-paper"],
    description: "平整開闔的簿冊比例，讓日常記錄有一處固定歸所。",
    story: "每一座莊園，都從有人願意把細節寫下開始。",
    sizing: "A5 與 A4；頁數與內頁磅數待打樣確認。",
    care: "避免潮濕與長時間日照，以乾布清理封面。",
    image: image(
      "estate-ledger-notebook",
      "胡桃棕筆記本攤放於藏書室書桌上的概念商品照",
      "estate-ledger-notebook-a5-walnut",
    ),
    relatedProductIds: ["correspondence-pen", "valet-desk-tray", "rain-ledger-watch"],
  },
  {
    id: "correspondence-pen",
    slug: "correspondence-pen",
    name: "Correspondence Pen",
    subtitle: "書信原子筆",
    kind: "ballpoint-pen",
    category: "stationery",
    audience: "unisex",
    collectionId: "after-rain-the-library",
    basePriceTwd: 3800,
    optionAxes: [
      optionAxis("finish", "筆身", [
        ["satin", "霧緞"],
        ["aged", "舊化色"],
      ]),
      optionAxis("ink", "墨色", [
        ["black", "黑"],
        ["blue", "藍"],
      ]),
    ],
    materialConcepts: ["brass-concept"],
    description: "平衡筆身與簡潔旋轉結構，適合短箋與長篇筆記。",
    story: "有些話在寄出之前，應先讓筆尖慢慢想清楚。",
    sizing: "單一筆身尺寸；重量與替芯規格待打樣確認。",
    care: "以柔布擦拭並保持乾燥；正式替芯相容性待確認。",
    image: image(
      "correspondence-pen",
      "霧緞色原子筆斜放在信紙上的概念商品照",
      "correspondence-pen-satin-black",
    ),
    relatedProductIds: ["estate-ledger-notebook", "estate-almanac", "valet-desk-tray"],
  },
  {
    id: "valet-desk-tray",
    slug: "valet-desk-tray",
    name: "Valet Desk Tray",
    subtitle: "管家桌面收納盤",
    kind: "desk-tray",
    category: "stationery",
    audience: "unisex",
    collectionId: "after-rain-the-library",
    basePriceTwd: 6800,
    optionAxes: [
      optionAxis("size", "尺寸", [
        ["small", "Small"],
        ["large", "Large"],
      ]),
      optionAxis("finish", "表面色", [
        ["natural", "自然木色"],
        ["smoked", "煙燻木色"],
      ]),
    ],
    materialConcepts: ["ash-wood"],
    description: "分隔而不零碎的桌面秩序，收納鑰匙、腕錶與書寫工具。",
    story: "清晨第一封信抵達前，桌面已經準備妥當。",
    sizing: "Small 與 Large；實際長寬待打樣確認。",
    care: "以微濕布擦拭後立即擦乾，避免浸泡與曝曬。",
    image: image(
      "valet-desk-tray",
      "自然木色分隔收納盤擺著腕錶與筆的概念商品照",
      "valet-desk-tray-small-natural",
    ),
    relatedProductIds: ["rain-ledger-watch", "correspondence-pen", "estate-dispatch-briefcase"],
  },
  {
    id: "estate-almanac",
    slug: "estate-almanac",
    name: "Estate Almanac",
    subtitle: "莊園日誌／月計畫本",
    kind: "journal-planner",
    category: "stationery",
    audience: "unisex",
    collectionId: "after-rain-the-library",
    basePriceTwd: 2800,
    optionAxes: [
      optionAxis("format", "版型", [
        ["journal", "日誌"],
        ["monthly", "月計畫"],
      ]),
      optionAxis("color", "封面色", [
        ["ivory", "象牙白"],
        ["olive", "橄欖綠"],
      ]),
    ],
    materialConcepts: ["archival-paper"],
    description: "同一冊形制提供自由日誌與月計畫兩種內頁，留住時間的不同尺度。",
    story: "季節循環不急著被管理，只需要有人持續記得。",
    sizing: "日誌與月計畫兩種版型；頁數與日期格式待打樣確認。",
    care: "保持乾燥並避免重壓；紙材與裝訂規格待確認。",
    image: image(
      "estate-almanac",
      "象牙白莊園日誌攤開在月曆旁的概念商品照",
      "estate-almanac-journal-ivory",
    ),
    relatedProductIds: ["estate-ledger-notebook", "correspondence-pen", "breakfast-room-mug"],
  },
] as const satisfies readonly Product[];

const sku = (
  id: string,
  productId: string,
  options: SKU["options"],
  priceTwd?: number,
): SKU => {
  const core: SKU = {
    id,
    productId,
    options,
    displayStatus: "preview",
    representativeAssetId: `${productId}-main`,
  };

  return priceTwd === undefined ? core : { ...core, priceTwd };
};

/**
 * Every selectable combination is represented by one canonical SKU. The
 * prototype intentionally carries no stock quantity; `displayStatus` describes
 * presentation only and must not be interpreted as inventory.
 */
export const skus = [
  // Apparel — Field House Polo
  sku("field-house-polo-xs-deep-olive", "field-house-polo", { size: "xs", color: "deep-olive" }),
  sku("field-house-polo-xs-warm-ivory", "field-house-polo", { size: "xs", color: "warm-ivory" }),
  sku("field-house-polo-s-deep-olive", "field-house-polo", { size: "s", color: "deep-olive" }),
  sku("field-house-polo-s-warm-ivory", "field-house-polo", { size: "s", color: "warm-ivory" }),
  sku("field-house-polo-m-deep-olive", "field-house-polo", { size: "m", color: "deep-olive" }),
  sku("field-house-polo-m-warm-ivory", "field-house-polo", { size: "m", color: "warm-ivory" }),
  sku("field-house-polo-l-deep-olive", "field-house-polo", { size: "l", color: "deep-olive" }),
  sku("field-house-polo-l-warm-ivory", "field-house-polo", { size: "l", color: "warm-ivory" }),
  sku("field-house-polo-xl-deep-olive", "field-house-polo", { size: "xl", color: "deep-olive" }),
  sku("field-house-polo-xl-warm-ivory", "field-house-polo", { size: "xl", color: "warm-ivory" }),

  // Apparel — Alder Oxford
  sku("alder-oxford-shirt-xs-chalk", "alder-oxford-shirt", { size: "xs", color: "chalk" }),
  sku("alder-oxford-shirt-xs-mist-blue", "alder-oxford-shirt", { size: "xs", color: "mist-blue" }),
  sku("alder-oxford-shirt-s-chalk", "alder-oxford-shirt", { size: "s", color: "chalk" }),
  sku("alder-oxford-shirt-s-mist-blue", "alder-oxford-shirt", { size: "s", color: "mist-blue" }),
  sku("alder-oxford-shirt-m-chalk", "alder-oxford-shirt", { size: "m", color: "chalk" }),
  sku("alder-oxford-shirt-m-mist-blue", "alder-oxford-shirt", { size: "m", color: "mist-blue" }),
  sku("alder-oxford-shirt-l-chalk", "alder-oxford-shirt", { size: "l", color: "chalk" }),
  sku("alder-oxford-shirt-l-mist-blue", "alder-oxford-shirt", { size: "l", color: "mist-blue" }),
  sku("alder-oxford-shirt-xl-chalk", "alder-oxford-shirt", { size: "xl", color: "chalk" }),
  sku("alder-oxford-shirt-xl-mist-blue", "alder-oxford-shirt", { size: "xl", color: "mist-blue" }),

  // Apparel — Conservatory Knit
  sku("conservatory-knit-xs-oatmeal", "conservatory-knit", { size: "xs", color: "oatmeal" }),
  sku("conservatory-knit-xs-claret", "conservatory-knit", { size: "xs", color: "claret" }),
  sku("conservatory-knit-s-oatmeal", "conservatory-knit", { size: "s", color: "oatmeal" }),
  sku("conservatory-knit-s-claret", "conservatory-knit", { size: "s", color: "claret" }),
  sku("conservatory-knit-m-oatmeal", "conservatory-knit", { size: "m", color: "oatmeal" }),
  sku("conservatory-knit-m-claret", "conservatory-knit", { size: "m", color: "claret" }),
  sku("conservatory-knit-l-oatmeal", "conservatory-knit", { size: "l", color: "oatmeal" }),
  sku("conservatory-knit-l-claret", "conservatory-knit", { size: "l", color: "claret" }),
  sku("conservatory-knit-xl-oatmeal", "conservatory-knit", { size: "xl", color: "oatmeal" }),
  sku("conservatory-knit-xl-claret", "conservatory-knit", { size: "xl", color: "claret" }),

  // Apparel — Bracken Riding Blazer
  sku("bracken-riding-blazer-xs-peat", "bracken-riding-blazer", { size: "xs", color: "peat" }),
  sku("bracken-riding-blazer-xs-midnight", "bracken-riding-blazer", { size: "xs", color: "midnight" }),
  sku("bracken-riding-blazer-s-peat", "bracken-riding-blazer", { size: "s", color: "peat" }),
  sku("bracken-riding-blazer-s-midnight", "bracken-riding-blazer", { size: "s", color: "midnight" }),
  sku("bracken-riding-blazer-m-peat", "bracken-riding-blazer", { size: "m", color: "peat" }),
  sku("bracken-riding-blazer-m-midnight", "bracken-riding-blazer", { size: "m", color: "midnight" }),
  sku("bracken-riding-blazer-l-peat", "bracken-riding-blazer", { size: "l", color: "peat" }),
  sku("bracken-riding-blazer-l-midnight", "bracken-riding-blazer", { size: "l", color: "midnight" }),
  sku("bracken-riding-blazer-xl-peat", "bracken-riding-blazer", { size: "xl", color: "peat" }),
  sku("bracken-riding-blazer-xl-midnight", "bracken-riding-blazer", { size: "xl", color: "midnight" }),

  // Apparel — Long Lawn Trousers
  sku("long-lawn-trousers-xs-charcoal", "long-lawn-trousers", { size: "xs", color: "charcoal" }),
  sku("long-lawn-trousers-xs-oat", "long-lawn-trousers", { size: "xs", color: "oat" }),
  sku("long-lawn-trousers-s-charcoal", "long-lawn-trousers", { size: "s", color: "charcoal" }),
  sku("long-lawn-trousers-s-oat", "long-lawn-trousers", { size: "s", color: "oat" }),
  sku("long-lawn-trousers-m-charcoal", "long-lawn-trousers", { size: "m", color: "charcoal" }),
  sku("long-lawn-trousers-m-oat", "long-lawn-trousers", { size: "m", color: "oat" }),
  sku("long-lawn-trousers-l-charcoal", "long-lawn-trousers", { size: "l", color: "charcoal" }),
  sku("long-lawn-trousers-l-oat", "long-lawn-trousers", { size: "l", color: "oat" }),
  sku("long-lawn-trousers-xl-charcoal", "long-lawn-trousers", { size: "xl", color: "charcoal" }),
  sku("long-lawn-trousers-xl-oat", "long-lawn-trousers", { size: "xl", color: "oat" }),

  // Apparel — Keeper Bermuda Shorts
  sku("keeper-bermuda-shorts-xs-field-stone", "keeper-bermuda-shorts", { size: "xs", color: "field-stone" }),
  sku("keeper-bermuda-shorts-xs-moss", "keeper-bermuda-shorts", { size: "xs", color: "moss" }),
  sku("keeper-bermuda-shorts-s-field-stone", "keeper-bermuda-shorts", { size: "s", color: "field-stone" }),
  sku("keeper-bermuda-shorts-s-moss", "keeper-bermuda-shorts", { size: "s", color: "moss" }),
  sku("keeper-bermuda-shorts-m-field-stone", "keeper-bermuda-shorts", { size: "m", color: "field-stone" }),
  sku("keeper-bermuda-shorts-m-moss", "keeper-bermuda-shorts", { size: "m", color: "moss" }),
  sku("keeper-bermuda-shorts-l-field-stone", "keeper-bermuda-shorts", { size: "l", color: "field-stone" }),
  sku("keeper-bermuda-shorts-l-moss", "keeper-bermuda-shorts", { size: "l", color: "moss" }),
  sku("keeper-bermuda-shorts-xl-field-stone", "keeper-bermuda-shorts", { size: "xl", color: "field-stone" }),
  sku("keeper-bermuda-shorts-xl-moss", "keeper-bermuda-shorts", { size: "xl", color: "moss" }),

  // Apparel — Walled Garden Dress
  sku("walled-garden-dress-xs-oxblood", "walled-garden-dress", { size: "xs", color: "oxblood" }),
  sku("walled-garden-dress-xs-fern", "walled-garden-dress", { size: "xs", color: "fern" }),
  sku("walled-garden-dress-s-oxblood", "walled-garden-dress", { size: "s", color: "oxblood" }),
  sku("walled-garden-dress-s-fern", "walled-garden-dress", { size: "s", color: "fern" }),
  sku("walled-garden-dress-m-oxblood", "walled-garden-dress", { size: "m", color: "oxblood" }),
  sku("walled-garden-dress-m-fern", "walled-garden-dress", { size: "m", color: "fern" }),
  sku("walled-garden-dress-l-oxblood", "walled-garden-dress", { size: "l", color: "oxblood" }),
  sku("walled-garden-dress-l-fern", "walled-garden-dress", { size: "l", color: "fern" }),
  sku("walled-garden-dress-xl-oxblood", "walled-garden-dress", { size: "xl", color: "oxblood" }),
  sku("walled-garden-dress-xl-fern", "walled-garden-dress", { size: "xl", color: "fern" }),

  // Accessories
  sku("bridle-line-belt-80-saddle", "bridle-line-belt", { size: "80", color: "saddle" }),
  sku("bridle-line-belt-80-oxblood", "bridle-line-belt", { size: "80", color: "oxblood" }),
  sku("bridle-line-belt-85-saddle", "bridle-line-belt", { size: "85", color: "saddle" }),
  sku("bridle-line-belt-85-oxblood", "bridle-line-belt", { size: "85", color: "oxblood" }),
  sku("bridle-line-belt-90-saddle", "bridle-line-belt", { size: "90", color: "saddle" }),
  sku("bridle-line-belt-90-oxblood", "bridle-line-belt", { size: "90", color: "oxblood" }),
  sku("bridle-line-belt-95-saddle", "bridle-line-belt", { size: "95", color: "saddle" }),
  sku("bridle-line-belt-95-oxblood", "bridle-line-belt", { size: "95", color: "oxblood" }),
  sku("bridle-line-belt-100-saddle", "bridle-line-belt", { size: "100", color: "saddle" }),
  sku("bridle-line-belt-100-oxblood", "bridle-line-belt", { size: "100", color: "oxblood" }),

  sku("rain-ledger-watch-36mm-walnut", "rain-ledger-watch", { size: "36mm", color: "walnut" }),
  sku("rain-ledger-watch-36mm-black", "rain-ledger-watch", { size: "36mm", color: "black" }),
  sku("rain-ledger-watch-40mm-walnut", "rain-ledger-watch", { size: "40mm", color: "walnut" }, 64000),
  sku("rain-ledger-watch-40mm-black", "rain-ledger-watch", { size: "40mm", color: "black" }, 64000),

  sku("glasshouse-tote-medium-ecru", "glasshouse-tote", { size: "medium", color: "ecru" }),
  sku("glasshouse-tote-medium-olive", "glasshouse-tote", { size: "medium", color: "olive" }),
  sku("glasshouse-tote-large-ecru", "glasshouse-tote", { size: "large", color: "ecru" }, 18800),
  sku("glasshouse-tote-large-olive", "glasshouse-tote", { size: "large", color: "olive" }, 18800),

  sku("estate-dispatch-briefcase-slim-bracken", "estate-dispatch-briefcase", { format: "slim", color: "bracken" }),
  sku("estate-dispatch-briefcase-slim-oxblood", "estate-dispatch-briefcase", { format: "slim", color: "oxblood" }),
  sku("estate-dispatch-briefcase-standard-bracken", "estate-dispatch-briefcase", { format: "standard", color: "bracken" }, 36000),
  sku("estate-dispatch-briefcase-standard-oxblood", "estate-dispatch-briefcase", { format: "standard", color: "oxblood" }, 36000),

  sku("south-lawn-sunglasses-tortoise-green", "south-lawn-sunglasses", { color: "tortoise", finish: "green" }),
  sku("south-lawn-sunglasses-tortoise-brown", "south-lawn-sunglasses", { color: "tortoise", finish: "brown" }),
  sku("south-lawn-sunglasses-deep-olive-green", "south-lawn-sunglasses", { color: "deep-olive", finish: "green" }),
  sku("south-lawn-sunglasses-deep-olive-brown", "south-lawn-sunglasses", { color: "deep-olive", finish: "brown" }),

  sku("long-table-tie-claret", "long-table-tie", { color: "claret" }),
  sku("long-table-tie-olive", "long-table-tie", { color: "olive" }),
  sku("long-table-tie-midnight", "long-table-tie", { color: "midnight" }),

  sku("evening-sheer-tights-s-m-smoke", "evening-sheer-tights", { size: "s-m", color: "smoke" }),
  sku("evening-sheer-tights-s-m-black", "evening-sheer-tights", { size: "s-m", color: "black" }),
  sku("evening-sheer-tights-l-xl-smoke", "evening-sheer-tights", { size: "l-xl", color: "smoke" }),
  sku("evening-sheer-tights-l-xl-black", "evening-sheer-tights", { size: "l-xl", color: "black" }),

  sku("dewdrop-earrings-petite-soft-gold", "dewdrop-earrings", { size: "petite", finish: "soft-gold" }),
  sku("dewdrop-earrings-petite-silver", "dewdrop-earrings", { size: "petite", finish: "silver" }),
  sku("dewdrop-earrings-classic-soft-gold", "dewdrop-earrings", { size: "classic", finish: "soft-gold" }, 14800),
  sku("dewdrop-earrings-classic-silver", "dewdrop-earrings", { size: "classic", finish: "silver" }, 14800),

  // Home
  sku("hearth-number-four-candle-cedar-embers-220g", "hearth-number-four-candle", { scent: "cedar-embers", capacity: "220g" }),
  sku("hearth-number-four-candle-black-tea-fig-220g", "hearth-number-four-candle", { scent: "black-tea-fig", capacity: "220g" }),
  sku("hearth-number-four-candle-cedar-embers-420g", "hearth-number-four-candle", { scent: "cedar-embers", capacity: "420g" }, 5200),
  sku("hearth-number-four-candle-black-tea-fig-420g", "hearth-number-four-candle", { scent: "black-tea-fig", capacity: "420g" }, 5200),

  sku("wet-cedar-diffuser-wet-cedar-150ml", "wet-cedar-diffuser", { scent: "wet-cedar", capacity: "150ml" }),
  sku("wet-cedar-diffuser-orris-paper-150ml", "wet-cedar-diffuser", { scent: "orris-paper", capacity: "150ml" }),
  sku("wet-cedar-diffuser-wet-cedar-250ml", "wet-cedar-diffuser", { scent: "wet-cedar", capacity: "250ml" }, 6800),
  sku("wet-cedar-diffuser-orris-paper-250ml", "wet-cedar-diffuser", { scent: "orris-paper", capacity: "250ml" }, 6800),

  sku("guest-wing-bed-linen-double-warm-ivory", "guest-wing-bed-linen", { size: "double", color: "warm-ivory" }),
  sku("guest-wing-bed-linen-double-mist-grey", "guest-wing-bed-linen", { size: "double", color: "mist-grey" }),
  sku("guest-wing-bed-linen-queen-warm-ivory", "guest-wing-bed-linen", { size: "queen", color: "warm-ivory" }, 14800),
  sku("guest-wing-bed-linen-queen-mist-grey", "guest-wing-bed-linen", { size: "queen", color: "mist-grey" }, 14800),
  sku("guest-wing-bed-linen-king-warm-ivory", "guest-wing-bed-linen", { size: "king", color: "warm-ivory" }, 16000),
  sku("guest-wing-bed-linen-king-mist-grey", "guest-wing-bed-linen", { size: "king", color: "mist-grey" }, 16000),

  sku("stable-door-throw-heather", "stable-door-throw", { color: "heather" }),
  sku("stable-door-throw-deep-olive", "stable-door-throw", { color: "deep-olive" }),
  sku("stable-door-throw-claret", "stable-door-throw", { color: "claret" }),

  sku("breakfast-room-mug-300ml-cream", "breakfast-room-mug", { capacity: "300ml", color: "cream" }),
  sku("breakfast-room-mug-300ml-forest", "breakfast-room-mug", { capacity: "300ml", color: "forest" }),
  sku("breakfast-room-mug-420ml-cream", "breakfast-room-mug", { capacity: "420ml", color: "cream" }, 2600),
  sku("breakfast-room-mug-420ml-forest", "breakfast-room-mug", { capacity: "420ml", color: "forest" }, 2600),

  sku("long-table-glasses-two", "long-table-glasses", { set: "two" }),
  sku("long-table-glasses-four", "long-table-glasses", { set: "four" }, 9800),
  sku("long-table-glasses-six", "long-table-glasses", { set: "six" }, 13800),

  sku("library-service-tray-small-natural", "library-service-tray", { size: "small", finish: "natural" }),
  sku("library-service-tray-small-smoked", "library-service-tray", { size: "small", finish: "smoked" }),
  sku("library-service-tray-large-natural", "library-service-tray", { size: "large", finish: "natural" }, 9800),
  sku("library-service-tray-large-smoked", "library-service-tray", { size: "large", finish: "smoked" }, 9800),

  sku("conservatory-stem-vase-low-chalk", "conservatory-stem-vase", { size: "low", finish: "chalk" }),
  sku("conservatory-stem-vase-low-moss", "conservatory-stem-vase", { size: "low", finish: "moss" }),
  sku("conservatory-stem-vase-tall-chalk", "conservatory-stem-vase", { size: "tall", finish: "chalk" }, 11800),
  sku("conservatory-stem-vase-tall-moss", "conservatory-stem-vase", { size: "tall", finish: "moss" }, 11800),

  // Stationery
  sku("estate-ledger-notebook-a5-walnut", "estate-ledger-notebook", { size: "a5", color: "walnut" }),
  sku("estate-ledger-notebook-a5-deep-olive", "estate-ledger-notebook", { size: "a5", color: "deep-olive" }),
  sku("estate-ledger-notebook-a4-walnut", "estate-ledger-notebook", { size: "a4", color: "walnut" }, 7800),
  sku("estate-ledger-notebook-a4-deep-olive", "estate-ledger-notebook", { size: "a4", color: "deep-olive" }, 7800),

  sku("correspondence-pen-satin-black", "correspondence-pen", { finish: "satin", ink: "black" }),
  sku("correspondence-pen-satin-blue", "correspondence-pen", { finish: "satin", ink: "blue" }),
  sku("correspondence-pen-aged-black", "correspondence-pen", { finish: "aged", ink: "black" }),
  sku("correspondence-pen-aged-blue", "correspondence-pen", { finish: "aged", ink: "blue" }),

  sku("valet-desk-tray-small-natural", "valet-desk-tray", { size: "small", finish: "natural" }),
  sku("valet-desk-tray-small-smoked", "valet-desk-tray", { size: "small", finish: "smoked" }),
  sku("valet-desk-tray-large-natural", "valet-desk-tray", { size: "large", finish: "natural" }, 8800),
  sku("valet-desk-tray-large-smoked", "valet-desk-tray", { size: "large", finish: "smoked" }, 8800),

  sku("estate-almanac-journal-ivory", "estate-almanac", { format: "journal", color: "ivory" }, 3200),
  sku("estate-almanac-journal-olive", "estate-almanac", { format: "journal", color: "olive" }, 3200),
  sku("estate-almanac-monthly-ivory", "estate-almanac", { format: "monthly", color: "ivory" }),
  sku("estate-almanac-monthly-olive", "estate-almanac", { format: "monthly", color: "olive" }),
] as const satisfies readonly SKU[];

export interface ProductPriceRange {
  readonly min: number;
  readonly max: number;
  readonly isRange: boolean;
}

const productById = new Map<string, Product>();
const productBySlug = new Map<string, Product>();
const skuById = new Map<string, SKU>();
const skusByProductId = new Map<string, SKU[]>();
const categoryById = new Map<string, CategoryMetadata>();
const collectionById = new Map<string, CollectionMetadata>();

for (const category of categoryMetadata) {
  categoryById.set(category.id, category);
}

for (const collection of collections) {
  collectionById.set(collection.id, collection);
}

for (const product of products) {
  productById.set(product.id, product);
  productBySlug.set(product.slug, product);
  skusByProductId.set(product.id, []);
}

for (const catalogSku of skus) {
  skuById.set(catalogSku.id, catalogSku);
  const productSkus = skusByProductId.get(catalogSku.productId);
  if (productSkus) productSkus.push(catalogSku);
}

/** Non-throwing lookup helpers for route and persisted-state boundaries. */
export const getProductById = (id: string): Product | undefined => productById.get(id);

export const getProductBySlug = (slug: string): Product | undefined => productBySlug.get(slug);

export const getSkuById = (id: string): SKU | undefined => skuById.get(id);

export const getCategoryById = (id: string): CategoryMetadata | undefined => categoryById.get(id);

export const getCollectionById = (id: string): CollectionMetadata | undefined =>
  collectionById.get(id);

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

export const getProductsByCollection = (collectionId: CollectionId): readonly Product[] =>
  products.filter((product) => product.collectionId === collectionId);

export const getRelatedProducts = (productId: string): readonly Product[] => {
  const product = getProductById(productId);
  if (!product) return [];

  return product.relatedProductIds.flatMap((relatedId) => {
    const related = getProductById(relatedId);
    return related ? [related] : [];
  });
};

export const getMaterialConceptLabel = (id: string): string | undefined =>
  isMaterialConceptId(id) ? materialConceptMetadata[id].label : undefined;

export const getEffectiveSkuPrice = (skuOrId: SKU | string): number | undefined => {
  const catalogSku = typeof skuOrId === "string" ? getSkuById(skuOrId) : skuOrId;
  if (!catalogSku) return undefined;

  const product = getProductById(catalogSku.productId);
  if (!product) return undefined;

  return catalogSku.priceTwd ?? product.basePriceTwd;
};

export const getProductPriceRange = (productId: string): ProductPriceRange | undefined => {
  const productSkus = getSkusForProduct(productId);
  if (productSkus.length === 0) return undefined;

  const prices = productSkus
    .map((catalogSku) => getEffectiveSkuPrice(catalogSku))
    .filter((price): price is number => price !== undefined);

  if (prices.length === 0) return undefined;

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return { min, max, isRange: min !== max };
};

/**
 * Resolves a SKU only when every option axis has been selected and the exact
 * combination exists. It never invents a SKU from an unsupported combination.
 */
export const findSkuForOptions = (
  productId: string,
  selected: Readonly<Partial<Record<ProductOptionKey, string>>>,
): SKU | undefined => {
  const product = getProductById(productId);
  if (!product) return undefined;

  const requiredKeys = product.optionAxes.map((axis) => axis.key);
  const selectedKeys = Object.keys(selected) as ProductOptionKey[];
  if (
    selectedKeys.length !== requiredKeys.length ||
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
  const materialLabels = product.materialConcepts
    .map(getMaterialConceptLabel)
    .filter((label): label is string => label !== undefined);

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
      ...materialLabels,
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

const expectedKinds: readonly ProductKind[] = [
  "polo-shirt",
  "oxford-shirt",
  "knitwear",
  "blazer",
  "tailored-trousers",
  "bermuda-shorts",
  "long-dress",
  "belt",
  "watch",
  "tote",
  "briefcase",
  "sunglasses",
  "tie",
  "hosiery",
  "earrings",
  "scented-candle",
  "diffuser",
  "bed-linen",
  "throw",
  "mug",
  "glassware",
  "wooden-tray",
  "vase",
  "notebook",
  "ballpoint-pen",
  "desk-tray",
  "journal-planner",
];

const expectedCategoryCounts: Readonly<Record<CategoryId, number>> = {
  apparel: 7,
  accessories: 8,
  home: 8,
  stationery: 4,
};

const priceBounds: Readonly<Record<CategoryId, readonly [number, number]>> = {
  apparel: [6800, 32000],
  accessories: [4800, 120000],
  home: [1800, 16000],
  stationery: [1200, 9800],
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

/**
 * Returns all integrity problems without throwing. Tests and build tooling may
 * also call this with alternate fixtures to prove the guards.
 */
export const validateCatalog = (
  candidateProducts: readonly Product[] = products,
  candidateSkus: readonly SKU[] = skus,
): readonly string[] => {
  const errors: string[] = [];
  const candidateProductById = new Map(candidateProducts.map((product) => [product.id, product]));
  const candidateSkuById = new Map(candidateSkus.map((catalogSku) => [catalogSku.id, catalogSku]));
  const validCategoryIds = new Set(categoryMetadata.map((category) => category.id));
  const validCollectionIds = new Set(collections.map((collection) => collection.id));
  const validStatuses = new Set<SkuDisplayStatus>(["preview", "available", "unavailable"]);

  if (candidateProducts.length !== 27) {
    errors.push(`Expected exactly 27 products; received ${candidateProducts.length}.`);
  }

  for (const duplicate of duplicateValues(candidateProducts.map((product) => product.id))) {
    errors.push(`Duplicate product id: ${duplicate}.`);
  }
  for (const duplicate of duplicateValues(candidateProducts.map((product) => product.slug))) {
    errors.push(`Duplicate product slug: ${duplicate}.`);
  }
  for (const duplicate of duplicateValues(candidateProducts.map((product) => product.image.assetId))) {
    errors.push(`Duplicate product asset id: ${duplicate}.`);
  }
  for (const duplicate of duplicateValues(candidateProducts.map((product) => product.image.path))) {
    errors.push(`Duplicate product image path: ${duplicate}.`);
  }
  for (const duplicate of duplicateValues(candidateSkus.map((catalogSku) => catalogSku.id))) {
    errors.push(`Duplicate SKU id: ${duplicate}.`);
  }

  for (const category of categoryMetadata) {
    const actual = candidateProducts.filter((product) => product.category === category.id).length;
    const expected = expectedCategoryCounts[category.id];
    if (actual !== expected) {
      errors.push(`Category ${category.id} must contain ${expected} products; received ${actual}.`);
    }
  }

  for (const kind of expectedKinds) {
    const count = candidateProducts.filter((product) => product.kind === kind).length;
    if (count !== 1) errors.push(`Product kind ${kind} must occur exactly once; received ${count}.`);
  }

  for (const product of candidateProducts) {
    const prefix = `Product ${product.id}`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.id)) {
      errors.push(`${prefix} has an unsafe id.`);
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug)) {
      errors.push(`${prefix} has an unsafe slug.`);
    }
    if (!product.name.trim() || !product.subtitle.trim() || !product.description.trim()) {
      errors.push(`${prefix} is missing required display copy.`);
    }
    if (!product.story.trim() || !product.sizing.trim() || !product.care.trim()) {
      errors.push(`${prefix} is missing story, sizing, or care copy.`);
    }
    if (!validCategoryIds.has(product.category)) {
      errors.push(`${prefix} references unknown category ${product.category}.`);
    }
    if (!validCollectionIds.has(product.collectionId)) {
      errors.push(`${prefix} references unknown collection ${product.collectionId}.`);
    }
    if (!Number.isSafeInteger(product.basePriceTwd) || product.basePriceTwd <= 0) {
      errors.push(`${prefix} has an invalid base TWD price.`);
    }
    if (product.image.path !== `/images/products/${product.id}.webp`) {
      errors.push(`${prefix} image must use /images/products/<product-id>.webp.`);
    }
    if (product.image.assetId !== `${product.id}-main`) {
      errors.push(`${prefix} has a non-canonical main asset id.`);
    }
    if (!product.image.alt.trim()) errors.push(`${prefix} has empty image alt text.`);

    const axisKeys = product.optionAxes.map((axis) => axis.key);
    for (const duplicate of duplicateValues(axisKeys)) {
      errors.push(`${prefix} repeats option axis ${duplicate}.`);
    }
    if (product.optionAxes.length === 0) errors.push(`${prefix} has no selectable option axes.`);

    for (const axis of product.optionAxes) {
      if (!axis.label.trim() || axis.values.length === 0) {
        errors.push(`${prefix} has an incomplete ${axis.key} option axis.`);
      }
      for (const duplicate of duplicateValues(axis.values.map((value) => value.value))) {
        errors.push(`${prefix} repeats ${axis.key} option value ${duplicate}.`);
      }
      for (const optionValue of axis.values) {
        if (!optionValue.value.trim() || !optionValue.label.trim()) {
          errors.push(`${prefix} has a blank ${axis.key} option value or label.`);
        }
      }
    }

    if (product.materialConcepts.length === 0) {
      errors.push(`${prefix} has no material concept.`);
    }
    for (const materialId of product.materialConcepts) {
      if (!(materialId in materialConceptMetadata)) {
        errors.push(`${prefix} references unknown material concept ${materialId}.`);
      }
    }
    for (const duplicate of duplicateValues(product.materialConcepts)) {
      errors.push(`${prefix} repeats material concept ${duplicate}.`);
    }

    for (const duplicate of duplicateValues(product.relatedProductIds)) {
      errors.push(`${prefix} repeats related product ${duplicate}.`);
    }
    for (const relatedId of product.relatedProductIds) {
      if (relatedId === product.id) errors.push(`${prefix} relates to itself.`);
      if (!candidateProductById.has(relatedId)) {
        errors.push(`${prefix} references missing related product ${relatedId}.`);
      }
    }
  }

  const optionSignaturesByProduct = new Map<string, Set<string>>();
  for (const catalogSku of candidateSkus) {
    const prefix = `SKU ${catalogSku.id}`;
    const product = candidateProductById.get(catalogSku.productId);
    if (!product) {
      errors.push(`${prefix} references missing product ${catalogSku.productId}.`);
      continue;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(catalogSku.id)) {
      errors.push(`${prefix} has an unsafe id.`);
    }
    if (!validStatuses.has(catalogSku.displayStatus)) {
      errors.push(`${prefix} has invalid display status ${catalogSku.displayStatus}.`);
    }
    if (catalogSku.representativeAssetId !== product.image.assetId) {
      errors.push(`${prefix} references unknown representative asset ${catalogSku.representativeAssetId}.`);
    }

    const requiredKeys = product.optionAxes.map((axis) => axis.key);
    const actualKeys = Object.keys(catalogSku.options) as ProductOptionKey[];
    if (
      actualKeys.length !== requiredKeys.length ||
      requiredKeys.some((requiredKey) => !actualKeys.includes(requiredKey))
    ) {
      errors.push(`${prefix} does not provide exactly the product's option axes.`);
    }

    for (const [rawKey, rawValue] of Object.entries(catalogSku.options)) {
      const key = rawKey as ProductOptionKey;
      const axis = product.optionAxes.find((candidateAxis) => candidateAxis.key === key);
      if (!axis) {
        errors.push(`${prefix} contains unknown option key ${key}.`);
      } else if (!axis.values.some((candidateValue) => candidateValue.value === rawValue)) {
        errors.push(`${prefix} contains invalid ${key} value ${String(rawValue)}.`);
      }
    }

    if (
      catalogSku.priceTwd !== undefined &&
      (!Number.isSafeInteger(catalogSku.priceTwd) || catalogSku.priceTwd <= 0)
    ) {
      errors.push(`${prefix} has an invalid TWD price override.`);
    }
    const effectivePrice = catalogSku.priceTwd ?? product.basePriceTwd;
    const [minimum, maximum] = priceBounds[product.category];
    if (effectivePrice < minimum || effectivePrice > maximum) {
      errors.push(`${prefix} effective price ${effectivePrice} is outside the ${product.category} range.`);
    }

    const signature = product.optionAxes
      .map((axis) => `${axis.key}:${catalogSku.options[axis.key] ?? ""}`)
      .join("|");
    const signatures = optionSignaturesByProduct.get(product.id) ?? new Set<string>();
    if (signatures.has(signature)) {
      errors.push(`${prefix} duplicates an existing option combination for ${product.id}.`);
    }
    signatures.add(signature);
    optionSignaturesByProduct.set(product.id, signatures);
  }

  for (const product of candidateProducts) {
    const productSkus = candidateSkus.filter((catalogSku) => catalogSku.productId === product.id);
    if (productSkus.length === 0) errors.push(`Product ${product.id} has no SKUs.`);

    for (const axis of product.optionAxes) {
      for (const optionValue of axis.values) {
        const represented = productSkus.some(
          (catalogSku) => catalogSku.options[axis.key] === optionValue.value,
        );
        if (!represented) {
          errors.push(
            `Product ${product.id} option ${axis.key}:${optionValue.value} has no canonical SKU.`,
          );
        }
      }
    }

    const picturedSku = candidateSkuById.get(product.image.picturedSkuId);
    if (!picturedSku || picturedSku.productId !== product.id) {
      errors.push(`Product ${product.id} references an invalid pictured SKU.`);
    } else if (picturedSku.representativeAssetId !== product.image.assetId) {
      errors.push(`Product ${product.id} pictured SKU does not reference its main asset.`);
    }
  }

  const almanac = candidateProductById.get("estate-almanac");
  const almanacFormats = almanac?.optionAxes.find((axis) => axis.key === "format")?.values ?? [];
  if (
    almanac?.kind !== "journal-planner" ||
    !almanacFormats.some((value) => value.value === "journal") ||
    !almanacFormats.some((value) => value.value === "monthly")
  ) {
    errors.push("Estate Almanac must combine journal and monthly planner formats.");
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

// Fail closed during server startup and production builds.
assertCatalogConsistency();

export const catalogStats = Object.freeze({
  productCount: products.length,
  skuCount: skus.length,
  productCountsByCategory: Object.freeze({
    apparel: getProductsByCategory("apparel").length,
    accessories: getProductsByCategory("accessories").length,
    home: getProductsByCategory("home").length,
    stationery: getProductsByCategory("stationery").length,
  }),
});
