import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

import sharp from "sharp";

const workspace = resolve(import.meta.dirname, "..");
const publicRoot = join(workspace, "public");
const privateRoot = join(workspace, ".private");
const productSourceRoot = join(privateRoot, "product-source-sheets");
const lifestyleSourceRoot = join(privateRoot, "lifestyle-source-sheets");
const reviewRoot = join(workspace, "artifacts", "asset-review");

const productGroups = {
  apparel: [
    ["field-house-polo", "Field House Polo"],
    ["alder-oxford-shirt", "Alder Oxford Shirt"],
    ["conservatory-knit", "Conservatory Knit"],
    ["bracken-riding-blazer", "Bracken Riding Blazer"],
    ["long-lawn-trousers", "Long Lawn Trousers"],
    ["keeper-bermuda-shorts", "Keeper Bermuda Shorts"],
    ["walled-garden-dress", "Walled Garden Dress"],
    ["hawthorn-trench", "Hawthorn Trench"],
    ["moorland-wax-jacket", "Moorland Wax Jacket"],
    ["north-hall-overcoat", "North Hall Overcoat"],
    ["morning-room-cardigan", "Morning Room Cardigan"],
    ["orchard-roll-neck", "Orchard Roll-Neck"],
    ["estate-silk-blouse", "Estate Silk Blouse"],
    ["cedar-pleated-skirt", "Cedar Pleated Skirt"],
    ["paddock-waistcoat", "Paddock Waistcoat"],
    ["garden-shirt-dress", "Garden Shirt Dress"],
  ],
  accessories: [
    ["bridle-line-belt", "Bridle Line Belt"],
    ["glasshouse-tote", "Glasshouse Tote"],
    ["estate-dispatch-briefcase", "Estate Dispatch Briefcase"],
    ["south-lawn-sunglasses", "South Lawn Sunglasses"],
    ["long-table-tie", "Long Table Tie"],
    ["bridle-loafers", "Bridle Loafers"],
    ["keeper-riding-boots", "Keeper Riding Boots"],
    ["house-colours-silk-scarf", "House Colours Silk Scarf"],
    ["ash-walking-umbrella", "Ash Walking Umbrella"],
    ["signet-cufflinks", "Signet Cufflinks"],
  ],
  home: [
    ["hearth-number-four-candle", "Hearth No. 4 Candle"],
    ["wet-cedar-diffuser", "Wet Cedar Diffuser"],
    ["stable-door-throw", "Stable Door Throw"],
    ["breakfast-room-mug", "Breakfast Room Mug"],
    ["library-service-tray", "Library Service Tray"],
    ["manor-table-linen", "Manor Table Linen"],
    ["long-hall-candlesticks", "Long Hall Candlesticks"],
    ["drawing-room-cushion", "Drawing Room Cushion"],
    ["library-bookends", "Library Bookends"],
  ],
  stationery: [
    ["estate-ledger-notebook", "Estate Ledger Notebook"],
    ["correspondence-pen", "Correspondence Pen"],
    ["valet-desk-tray", "Valet Desk Tray"],
    ["house-correspondence-cards", "House Correspondence Cards"],
    ["brass-letter-opener", "Brass Letter Opener"],
  ],
  tennis: [
    ["ash-tone-tennis-racquet", "Ash-Tone Tennis Racquet"],
    ["baseline-tennis-dress", "Baseline Tennis Dress"],
    ["pavilion-pleated-skirt", "Pavilion Pleated Skirt"],
    ["match-point-cable-vest", "Match Point Cable Vest"],
    ["house-championship-tennis-balls", "House Championship Tennis Balls"],
    ["bridle-leather-racquet-cover", "Bridle Leather Racquet Cover"],
    ["clubhouse-tailored-shorts", "Clubhouse Tailored Shorts"],
    ["centre-court-performance-polo", "Centre Court Performance Polo"],
    ["centre-line-court-shoes", "Centre Line Court Shoes"],
    ["clubhouse-racquet-tote", "Clubhouse Racquet Tote"],
  ],
};

const products = Object.entries(productGroups).flatMap(([category, entries]) =>
  entries.map(([id, name]) => ({ id, name, category })),
);
const productById = new Map(products.map((product) => [product.id, product]));
const panelOrder = ["tl", "tr", "bl", "br"];

const lifestyleScenes = [
  {
    role: "estate-lifestyle",
    source: "estate-01.png",
    panel: "tl",
    personReferenceIds: ["anchor-male-01"],
    alt: "男士於晨霧中的莊園碎石路步行",
  },
  {
    role: "estate-lifestyle",
    source: "estate-01.png",
    panel: "tr",
    personReferenceIds: ["anchor-female-01"],
    alt: "女士在長桌前整理亞麻餐巾與黃銅燭台",
  },
  {
    role: "estate-lifestyle",
    source: "estate-01.png",
    panel: "bl",
    personReferenceIds: ["anchor-male-03"],
    alt: "男士在雨後藏書室窗邊閱讀",
  },
  {
    role: "estate-lifestyle",
    source: "estate-01.png",
    panel: "br",
    personReferenceIds: ["anchor-female-03"],
    alt: "女士於晨霧果園中步行",
  },
  {
    role: "estate-lifestyle",
    source: "estate-02.png",
    panel: "tl",
    personReferenceIds: ["anchor-male-04"],
    alt: "男士在玻璃溫室照料盆栽橄欖樹",
  },
  {
    role: "estate-lifestyle",
    source: "estate-02.png",
    panel: "tr",
    personReferenceIds: ["anchor-female-04"],
    alt: "女士於溫室工作桌書寫空白簿冊",
  },
  {
    role: "estate-lifestyle",
    source: "estate-02.png",
    panel: "bl",
    personReferenceIds: ["anchor-male-02"],
    alt: "男士牽著單車穿過莊園馬房庭院",
  },
  {
    role: "estate-lifestyle",
    source: "estate-02.png",
    panel: "br",
    personReferenceIds: ["anchor-female-02"],
    alt: "女士在花房整理白色庭園玫瑰",
  },
  {
    role: "estate-lifestyle",
    source: "estate-03.png",
    panel: "tl",
    personReferenceIds: ["anchor-male-01", "anchor-female-01"],
    alt: "兩位賓客於雨後石造露台交談步行",
  },
  {
    role: "estate-lifestyle",
    source: "estate-03.png",
    panel: "tr",
    personReferenceIds: ["anchor-male-03", "anchor-female-02"],
    alt: "兩位賓客在藏書室地圖桌前討論",
  },
  {
    role: "estate-lifestyle",
    source: "estate-03.png",
    panel: "bl",
    personReferenceIds: ["anchor-male-03", "anchor-female-02"],
    alt: "兩位賓客於圍牆菜園採集香草",
  },
  {
    role: "estate-lifestyle",
    source: "estate-03.png",
    panel: "br",
    personReferenceIds: ["anchor-male-01", "anchor-female-01"],
    alt: "兩位賓客在溫室茶桌前安靜交談",
  },
  {
    role: "estate-lifestyle",
    source: "estate-04.png",
    panel: "tl",
    personReferenceIds: ["anchor-male-01"],
    alt: "男士於雨後靴室取用長柄傘",
  },
  {
    role: "estate-lifestyle",
    source: "estate-04.png",
    panel: "tr",
    personReferenceIds: ["anchor-female-01"],
    alt: "女士在明亮餐室擦拭黃銅燭台",
  },
  {
    role: "estate-lifestyle",
    source: "estate-04.png",
    panel: "bl",
    personReferenceIds: ["anchor-male-03"],
    alt: "男士於藏書室書桌檢視空白書信卡",
  },
  {
    role: "estate-lifestyle",
    source: "estate-04.png",
    panel: "br",
    personReferenceIds: ["anchor-female-03"],
    alt: "女士在晨霧中開啟果園鐵門",
  },
  {
    role: "estate-lifestyle",
    source: "estate-05.png",
    panel: "tl",
    personReferenceIds: ["anchor-male-04", "anchor-female-04"],
    alt: "兩位賓客在溫室檢視柑橘盆栽",
  },
  {
    role: "estate-lifestyle",
    source: "estate-18-override.png",
    personReferenceIds: ["anchor-male-02", "anchor-female-02"],
    alt: "兩位賓客在長桌前整理白花與素色餐巾",
  },
  {
    role: "estate-lifestyle",
    source: "estate-05.png",
    panel: "bl",
    personReferenceIds: ["anchor-male-02", "anchor-female-02"],
    alt: "兩位賓客攜著野餐亞麻與藤籃走過草坪",
  },
  {
    role: "estate-lifestyle",
    source: "estate-05.png",
    panel: "br",
    personReferenceIds: ["anchor-male-04", "anchor-female-04"],
    alt: "兩位賓客在晨間室檢視植物圖畫",
  },
  {
    role: "estate-lifestyle",
    source: "estate-06.png",
    panel: "tl",
    personReferenceIds: [],
    alt: "雨後靴室裡的長柄傘、騎士靴與羊毛毯",
  },
  {
    role: "estate-lifestyle",
    source: "estate-06.png",
    panel: "tr",
    personReferenceIds: [],
    alt: "橡木衣櫃中的莊園外套與針織衣物",
  },
  {
    role: "estate-lifestyle",
    source: "estate-06.png",
    panel: "bl",
    personReferenceIds: ["anchor-male-03", "anchor-female-04"],
    alt: "兩位賓客於早餐室分享咖啡與水果",
  },
  {
    role: "estate-lifestyle",
    source: "estate-06.png",
    panel: "br",
    personReferenceIds: ["anchor-male-01", "anchor-female-03"],
    alt: "兩位賓客在雨後藏書室整理簿冊",
  },
  {
    role: "tennis-lifestyle",
    source: "tennis-01.png",
    panel: "tl",
    personReferenceIds: ["anchor-male-02"],
    alt: "男士在私人草地球場完成發球動作",
  },
  {
    role: "tennis-lifestyle",
    source: "tennis-01.png",
    panel: "tr",
    personReferenceIds: ["anchor-female-02"],
    alt: "女士在草地球場底線完成雙手反拍",
  },
  {
    role: "tennis-lifestyle",
    source: "tennis-01.png",
    panel: "bl",
    personReferenceIds: ["anchor-male-01"],
    alt: "男士在草地球場網前進行截擊",
  },
  {
    role: "tennis-lifestyle",
    source: "tennis-01.png",
    panel: "br",
    personReferenceIds: ["anchor-female-03"],
    alt: "女士在草地球場邊長椅休息",
  },
  {
    role: "tennis-lifestyle",
    source: "tennis-05-override.png",
    personReferenceIds: ["anchor-male-04", "anchor-female-04"],
    alt: "一對搭檔在草地球場網前準備雙打",
  },
  {
    role: "tennis-lifestyle",
    source: "tennis-02.png",
    panel: "tr",
    personReferenceIds: ["anchor-male-03", "anchor-female-01"],
    alt: "兩位球員在會所露台整理球拍與網球",
  },
  {
    role: "tennis-lifestyle",
    source: "tennis-02.png",
    panel: "bl",
    personReferenceIds: [],
    alt: "草地球場邊的球拍、網球、毛巾與球袋",
  },
  {
    role: "tennis-lifestyle",
    source: "tennis-02.png",
    panel: "br",
    personReferenceIds: ["anchor-male-03", "anchor-female-01"],
    alt: "兩位球員在草地球場換邊時休息",
  },
  {
    role: "tennis-lifestyle",
    source: "tennis-09-override.png",
    publicFilename: "tennis-scene-09-v3",
    width: 2880,
    height: 1920,
    version: 3,
    promptVersion: 4,
    sourceRevision: "imagegen-private-anchor-source-v4",
    personReferenceIds: ["anchor-male-02", "anchor-female-02"],
    alt: "兩位球員在完整草地球場進行單打",
  },
  {
    role: "tennis-lifestyle",
    source: "tennis-03.png",
    panel: "tr",
    personReferenceIds: ["anchor-female-04"],
    alt: "女士在草地球場進行低角度發球",
  },
  {
    role: "tennis-lifestyle",
    source: "tennis-03.png",
    panel: "bl",
    personReferenceIds: ["anchor-male-04"],
    alt: "男士在草地球場中場完成正拍回球",
  },
  {
    role: "tennis-lifestyle",
    source: "tennis-03.png",
    panel: "br",
    personReferenceIds: [],
    alt: "會所露台上的球拍、球袋、網球與毛巾",
  },
].map((scene, index) => {
  const filename = `${scene.role === "tennis-lifestyle" ? "tennis" : "estate"}-scene-${String(
    scene.role === "tennis-lifestyle" ? index - 23 : index + 1,
  ).padStart(2, "0")}`;
  return {
    ...scene,
    filename,
    publicFilename: scene.publicFilename ?? filename,
    containsPeople: scene.personReferenceIds.length > 0,
  };
});

const storyPaths = [
  "images/editorial/first-light-in-the-field.webp",
  "images/editorial/the-conservatory-hour.webp",
  "images/editorial/after-rain-the-library.webp",
  "images/editorial/dinner-at-the-long-table.webp",
];

const ensureDir = (path) => mkdirSync(path, { recursive: true });
const publicPath = (path) => `/${relative(publicRoot, path).replaceAll("\\", "/")}`;
const sha256 = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

async function extractPanel(path, panel) {
  if (!panel) return readFileSync(path);
  const metadata = await sharp(path).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Cannot read source dimensions for ${path}.`);
  }
  const halfWidth = Math.floor(metadata.width / 2);
  const halfHeight = Math.floor(metadata.height / 2);
  const insetX = Math.max(12, Math.round(metadata.width * 0.018));
  const insetY = Math.max(12, Math.round(metadata.height * 0.018));
  const right = panel === "tr" || panel === "br";
  const bottom = panel === "bl" || panel === "br";
  const left = right ? halfWidth + insetX : insetX;
  const top = bottom ? halfHeight + insetY : insetY;
  const width = (right ? metadata.width : halfWidth) - left - insetX;
  const height = (bottom ? metadata.height : halfHeight) - top - insetY;
  return sharp(path).extract({ left, top, width, height }).png().toBuffer();
}

async function writeVariants(
  input,
  webpPath,
  width,
  height,
  fit = "contain",
  position = "attention",
) {
  ensureDir(dirname(webpPath));
  const avifPath = webpPath.replace(/\.webp$/, ".avif");
  const pipeline = sharp(input)
    .rotate()
    .resize(width, height, {
      fit,
      position,
      background: "#e8e0d3",
      withoutEnlargement: false,
    })
    .sharpen({ sigma: 0.3 });
  await pipeline.clone().webp({ quality: 86, effort: 5 }).toFile(webpPath);
  await pipeline.clone().avif({ quality: 61, effort: 5 }).toFile(avifPath);
}

const sourceSheetForProduct = (index) =>
  join(
    productSourceRoot,
    `products-${String(Math.floor(index / 4) + 1).padStart(2, "0")}.png`,
  );

async function productPanel(product, index, detail = false) {
  if (product.id === "library-bookends") {
    return readFileSync(join(productSourceRoot, "library-bookends-override.png"));
  }
  const source = sourceSheetForProduct(index);
  const panel =
    detail && index >= 48 ? panelOrder[(index % 4) + 2] : panelOrder[index % 4];
  return extractPanel(source, panel);
}

async function createProductImages() {
  for (const [index, product] of products.entries()) {
    const mainSource = await productPanel(product, index);
    const detailSource = await productPanel(product, index, true);
    await writeVariants(
      mainSource,
      join(publicRoot, "images", "products", `${product.id}.webp`),
      1200,
      1500,
      "contain",
    );
    await writeVariants(
      detailSource,
      join(
        publicRoot,
        "images",
        "product-details",
        `${product.id}-detail.webp`,
      ),
      1200,
      1500,
      index >= 48 ? "contain" : "cover",
      "attention",
    );
  }
}

function clearLifestyleDirectory() {
  const directory = join(publicRoot, "images", "lifestyle");
  ensureDir(directory);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      (entry.name.endsWith(".webp") || entry.name.endsWith(".avif"))
    ) {
      unlinkSync(join(directory, entry.name));
    }
  }
}

async function createLifestyleImages() {
  clearLifestyleDirectory();
  for (const scene of lifestyleScenes) {
    const source = await extractPanel(
      join(lifestyleSourceRoot, scene.source),
      scene.panel,
    );
    await writeVariants(
      source,
      join(
        publicRoot,
        "images",
        "lifestyle",
        `${scene.publicFilename}.webp`,
      ),
      scene.width ?? 1440,
      scene.height ?? 960,
      "contain",
    );
  }
}

async function createCategoryImages() {
  const sources = {
    apparel: ["field-house-polo", "walled-garden-dress"],
    accessories: ["bridle-line-belt", "south-lawn-sunglasses"],
    home: ["hearth-number-four-candle", "manor-table-linen"],
    stationery: ["estate-ledger-notebook", "brass-letter-opener"],
    tennis: ["ash-tone-tennis-racquet", "clubhouse-racquet-tote"],
  };
  for (const [category, [desktopId, mobileId]] of Object.entries(sources)) {
    await writeVariants(
      join(publicRoot, "images", "products", `${desktopId}.webp`),
      join(publicRoot, "images", "categories", `${category}-desktop.webp`),
      1600,
      900,
      "cover",
    );
    await writeVariants(
      join(publicRoot, "images", "products", `${mobileId}.webp`),
      join(publicRoot, "images", "categories", `${category}-mobile.webp`),
      900,
      1200,
      "cover",
    );
  }
}

async function ensureStoryVariants() {
  for (const relativePath of storyPaths) {
    const webpPath = join(publicRoot, relativePath);
    await sharp(webpPath)
      .avif({ quality: 61, effort: 5 })
      .toFile(webpPath.replace(/\.webp$/, ".avif"));
  }
}

function categoryForProduct(id) {
  return productById.get(id)?.category;
}

function representativeSkuForProduct(productId) {
  const category = categoryForProduct(productId);
  if (category === "apparel") return `${productId}-s-estate-olive`;
  if (productId === "bridle-line-belt") {
    return `${productId}-85cm-estate-dark`;
  }
  if (["bridle-loafers", "keeper-riding-boots"].includes(productId)) {
    return `${productId}-eu-40-estate-dark`;
  }
  if (productId === "ash-tone-tennis-racquet") return `${productId}-g2`;
  if (
    [
      "baseline-tennis-dress",
      "pavilion-pleated-skirt",
      "match-point-cable-vest",
      "clubhouse-tailored-shorts",
      "centre-court-performance-polo",
    ].includes(productId)
  ) {
    return `${productId}-s-court-ivory`;
  }
  if (productId === "centre-line-court-shoes") {
    return `${productId}-eu-40-court-ivory`;
  }
  if (category === "tennis") return `${productId}-launch-sample`;
  return `${productId}-launch-sample-estate-dark`;
}

function collectWebpPaths(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...collectWebpPaths(path));
    else if (entry.isFile() && extname(entry.name) === ".webp") found.push(path);
  }
  return found;
}

const lifestyleByFilename = new Map(
  lifestyleScenes.map((scene) => [scene.publicFilename, scene]),
);

async function writeInventory() {
  const webpPaths = collectWebpPaths(join(publicRoot, "images")).sort();
  if (webpPaths.length !== 150) {
    throw new Error(
      `Expected exactly 150 public WebP assets; found ${webpPaths.length}.`,
    );
  }
  const entries = [];
  for (const path of webpPaths) {
    const metadata = await sharp(path).metadata();
    const avifPath = path.replace(/\.webp$/, ".avif");
    if (!existsSync(avifPath)) {
      throw new Error(`Missing AVIF variant for ${path}.`);
    }
    const relativePath = publicPath(path);
    const filename = basename(path, ".webp");
    const productId = relativePath.startsWith("/images/products/")
      ? filename
      : relativePath.startsWith("/images/product-details/")
        ? filename.replace(/-detail$/, "")
        : null;
    const role = relativePath.includes("/products/")
      ? "product-main"
      : relativePath.includes("/product-details/")
        ? "product-detail"
        : relativePath.includes("/categories/")
          ? "category"
          : relativePath.includes("/editorial/")
            ? "story-hero"
            : relativePath.includes("/lifestyle/tennis-")
              ? "tennis-lifestyle"
              : "estate-lifestyle";
    const lifestyle = lifestyleByFilename.get(filename);
    const inventoryRelativePath = lifestyle
      ? relativePath.replace(
          `/${filename}.webp`,
          `/${lifestyle.filename}.webp`,
        )
      : relativePath;
    const product = productId ? productById.get(productId) : null;
    const categoryId = relativePath.includes("/categories/")
      ? filename.split("-")[0]
      : product?.category ?? null;
    const collectionId =
      role === "tennis-lifestyle" ||
      categoryId === "tennis" ||
      filename.includes("private-court")
        ? "the-private-court"
        : null;
    const source = role.endsWith("lifestyle")
      ? lifestyle?.sourceRevision ?? "imagegen-private-anchor-source-v3"
      : role === "story-hero"
        ? "existing-local-sandbox-source"
        : "imagegen-product-source-v3";
    const personReferenceIds = lifestyle?.personReferenceIds ?? [];
    entries.push({
      id: `asset-${inventoryRelativePath
        .slice(1)
        .replaceAll("/", "-")
        .replace(/\.webp$/, "")}`,
      version: lifestyle?.version ?? 2,
      source,
      visibility: "public",
      role,
      status: "sandbox_review",
      sha256: sha256(path),
      avifSha256: sha256(avifPath),
      masterReference: "launch-gated-source-master",
      variants: {
        webp: relativePath,
        avif: publicPath(avifPath),
      },
      productId,
      skuId: productId ? representativeSkuForProduct(productId) : null,
      categoryId,
      collectionId,
      containsPeople:
        lifestyle?.containsPeople ??
        (role === "story-hero" && filename === "first-light-in-the-field"),
      personReferenceIds,
      width: metadata.width,
      height: metadata.height,
      aspectRatio: `${metadata.width}:${metadata.height}`,
      focus: { x: 0.5, y: 0.5 },
      alt: product
        ? `${product.name} 的 LIGNÉE Sandbox 商品視覺，正式商品攝影待核准`
        : lifestyle
          ? `${lifestyle.alt}的 LIGNÉE Sandbox 編輯影像`
          : `${filename.replaceAll("-", " ")} 的 LIGNÉE Sandbox 編輯視覺，正式攝影待核准`,
      promptAudit: {
        promptId: lifestyle
          ? `imagegen-lifestyle-${lifestyle.filename}-v${lifestyle.promptVersion ?? 3}`
          : product
            ? `imagegen-product-${product.id}-v3`
            : `local-${role}-${filename}-v2`,
        generatedAt: "2026-07-24",
      },
      rights: {
        state: "internal-sandbox-only",
        finalClearanceRequired: true,
      },
      qa: {
        automatedDimensions: true,
        automatedHash: true,
        humanFinalApproval: false,
        physicalProductMatch: false,
      },
      bytes: statSync(path).size,
      avifBytes: statSync(avifPath).size,
    });
  }
  writeFileSync(
    join(workspace, "content", "asset-inventory.generated.json"),
    `${JSON.stringify(
      {
        generatedAt: "2026-07-24",
        publicAssetCount: entries.length,
        entries,
      },
      null,
      2,
    )}\n`,
  );
}

const escapeXml = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

async function createContactSheet({
  items,
  columns,
  thumbnailWidth,
  thumbnailHeight,
  labelHeight,
  output,
}) {
  const gap = 16;
  const rows = Math.ceil(items.length / columns);
  const cellWidth = thumbnailWidth + gap;
  const cellHeight = thumbnailHeight + labelHeight + gap;
  const width = columns * cellWidth + gap;
  const height = rows * cellHeight + gap;
  const composites = [];
  for (const [index, item] of items.entries()) {
    const left = gap + (index % columns) * cellWidth;
    const top = gap + Math.floor(index / columns) * cellHeight;
    const thumbnail = await sharp(item.path)
      .resize(thumbnailWidth, thumbnailHeight, {
        fit: "contain",
        background: "#e8e0d3",
      })
      .png()
      .toBuffer();
    const label = Buffer.from(
      `<svg width="${thumbnailWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f4efe5"/><text x="8" y="${Math.round(
        labelHeight * 0.64,
      )}" font-family="Arial, sans-serif" font-size="15" fill="#1d2a23">${escapeXml(
        item.label,
      )}</text></svg>`,
    );
    composites.push({ input: thumbnail, left, top });
    composites.push({
      input: label,
      left,
      top: top + thumbnailHeight,
    });
  }
  ensureDir(dirname(output));
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#d8d0c2",
    },
  })
    .composite(composites)
    .png({ compressionLevel: 8 })
    .toFile(output);
}

async function writeReviewContactSheets() {
  rmSync(reviewRoot, { recursive: true, force: true });
  ensureDir(reviewRoot);
  await createContactSheet({
    items: products.map((product) => ({
      path: join(publicRoot, "images", "products", `${product.id}.webp`),
      label: product.name,
    })),
    columns: 5,
    thumbnailWidth: 216,
    thumbnailHeight: 270,
    labelHeight: 44,
    output: join(reviewRoot, "product-main-contact-sheet.png"),
  });
  await createContactSheet({
    items: lifestyleScenes.map((scene) => ({
      path: join(
        publicRoot,
        "images",
        "lifestyle",
        `${scene.publicFilename}.webp`,
      ),
      label: scene.filename,
    })),
    columns: 4,
    thumbnailWidth: 300,
    thumbnailHeight: 200,
    labelHeight: 38,
    output: join(reviewRoot, "lifestyle-contact-sheet.png"),
  });
}

const requiredPrivateSources = [
  ...Array.from({ length: 13 }, (_, index) =>
    join(
      productSourceRoot,
      `products-${String(index + 1).padStart(2, "0")}.png`,
    ),
  ),
  join(productSourceRoot, "library-bookends-override.png"),
  ...[
    "estate-01.png",
    "estate-02.png",
    "estate-03.png",
    "estate-04.png",
    "estate-05.png",
    "estate-06.png",
    "estate-18-override.png",
    "tennis-01.png",
    "tennis-02.png",
    "tennis-03.png",
    "tennis-05-override.png",
    "tennis-09-override.png",
  ].map((filename) => join(lifestyleSourceRoot, filename)),
];

async function writeAssetReviewRecord() {
  const contactSheetPaths = [
    join(reviewRoot, "product-main-contact-sheet.png"),
    join(reviewRoot, "lifestyle-contact-sheet.png"),
  ];
  const contactSheets = await Promise.all(
    contactSheetPaths.map(async (path) => {
      const metadata = await sharp(path).metadata();
      if (!metadata.width || !metadata.height) {
        throw new Error(`Cannot read review contact-sheet dimensions for ${path}.`);
      }
      return {
        ignoredLocalPath: relative(workspace, path).replaceAll("\\", "/"),
        sha256: sha256(path),
        width: metadata.width,
        height: metadata.height,
      };
    }),
  );
  const sourceSheets = requiredPrivateSources.map((path) => ({
    ignoredLocalPath: relative(workspace, path).replaceAll("\\", "/"),
    sha256: sha256(path),
  }));
  writeFileSync(
    join(workspace, "content", "asset-review-record.json"),
    `${JSON.stringify(
      {
        revision: "asset-review-record-v1",
        generatedAt: "2026-07-24",
        inventorySha256: sha256(
          join(workspace, "content", "asset-inventory.generated.json"),
        ),
        contactSheets,
        sourceSheets,
      },
      null,
      2,
    )}\n`,
  );
}

if (requiredPrivateSources.some((path) => !existsSync(path))) {
  throw new Error(
    "Missing one or more ignored native image-generation source sheets.",
  );
}

await createProductImages();
await createLifestyleImages();
await createCategoryImages();
await ensureStoryVariants();
await writeInventory();
await writeReviewContactSheets();
await writeAssetReviewRecord();

console.log(
  "Generated 150 public Sandbox visuals plus hashed private-source and contact-sheet review evidence.",
);
