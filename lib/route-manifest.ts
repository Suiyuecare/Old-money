import { products } from "@/lib/catalog";
import { estateCollections, estateJournalEntries } from "@/lib/editorial";

export type RouteKind =
  | "static"
  | "catalog"
  | "product"
  | "collection"
  | "journal"
  | "guarded"
  | "not-found";

export interface RouteManifestEntry {
  readonly id: string;
  readonly path: `/${string}`;
  readonly label: string;
  readonly kind: RouteKind;
  readonly expectedStatus: 200 | 404;
  readonly visualQa: boolean;
  readonly sourceId?: string;
  readonly stateNote?: string;
}

const page = (
  id: string,
  path: `/${string}`,
  label: string,
  kind: RouteKind = "static",
  stateNote?: string,
): RouteManifestEntry => ({
  id,
  path,
  label,
  kind,
  expectedStatus: 200,
  visualQa: true,
  stateNote,
});

const staticRoutes: readonly RouteManifestEntry[] = [
  page("home", "/", "首頁"),
  page("shop", "/shop", "全部選品", "catalog"),
  page("men", "/men", "男裝", "catalog"),
  page("women", "/women", "女裝", "catalog"),
  page("accessories", "/accessories", "配件", "catalog"),
  page("home-living", "/home", "居家生活", "catalog"),
  page("stationery", "/stationery", "文具", "catalog"),
  page("search", "/search", "搜尋選品", "catalog"),
  page("collections", "/collections", "莊園篇章"),
  page("journal", "/journal", "Estate Journal"),
  page("wishlist", "/wishlist", "收藏清單", "guarded", "預設顯示空收藏"),
  page("cart", "/cart", "購物袋", "guarded", "預設顯示空購物袋"),
  page("checkout", "/checkout", "模擬結帳", "guarded", "空購物袋時安全阻擋"),
  page(
    "checkout-complete",
    "/checkout/complete",
    "模擬結帳完成",
    "guarded",
    "直接造訪時顯示無有效結帳狀態",
  ),
  page("story", "/story", "品牌故事"),
  page("private-appointment", "/private-appointment", "私人選品預約"),
  page("shipping-returns", "/shipping-returns", "配送與退換貨"),
  page("privacy", "/privacy", "隱私條款"),
  page("terms", "/terms", "使用條款"),
];

const productRoutes: readonly RouteManifestEntry[] = products.map((product) => ({
  id: `product-${product.id}`,
  path: `/product/${product.slug}`,
  label: product.name,
  kind: "product",
  expectedStatus: 200,
  visualQa: true,
  sourceId: product.id,
}));

const collectionRoutes: readonly RouteManifestEntry[] = estateCollections.map(
  (collection) => ({
    id: `collection-${collection.id}`,
    path: collection.href as `/${string}`,
    label: collection.title,
    kind: "collection",
    expectedStatus: 200,
    visualQa: true,
    sourceId: collection.id,
  }),
);

const journalRoutes: readonly RouteManifestEntry[] = estateJournalEntries.map((entry) => ({
  id: `journal-${entry.id}`,
  path: entry.href as `/${string}`,
  label: entry.title,
  kind: "journal",
  expectedStatus: 200,
  visualQa: true,
  sourceId: entry.id,
}));

const notFoundRoute: RouteManifestEntry = {
  id: "not-found",
  path: "/__lignee-route-not-found__",
  label: "404 Not Found",
  kind: "not-found",
  expectedStatus: 404,
  visualQa: true,
  stateNote: "代表任意不存在網址的自訂 404 畫面",
};

/**
 * Canonical list of every user-facing route reachable in the prototype.
 * Dynamic entries are derived from the same catalog/editorial modules as the app,
 * so a new product or chapter cannot silently fall out of route verification.
 */
export const routeManifest: readonly RouteManifestEntry[] = Object.freeze([
  ...staticRoutes,
  ...productRoutes,
  ...collectionRoutes,
  ...journalRoutes,
  notFoundRoute,
]);

export const visualQaRouteManifest = routeManifest.filter((route) => route.visualQa);

export const routeManifestByPath = new Map<string, RouteManifestEntry>(
  routeManifest.map((route) => [route.path, route] as const),
);

export function getRouteManifestEntry(path: string): RouteManifestEntry | undefined {
  return routeManifestByPath.get(path);
}
