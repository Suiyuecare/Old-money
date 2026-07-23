import {
  audienceMetadata,
  categoryMetadata,
  collections,
  getEffectiveSkuPrice,
  getProductPriceRange,
  getProductSearchDocument,
  getSkusForProduct,
  isAudienceId,
  isCategoryId,
  isCollectionId,
  isMaterialConceptId,
  materialConceptMetadata,
  normalizeCatalogSearchText,
  products as canonicalProducts,
  type AudienceId,
  type CategoryId,
  type CollectionId,
  type MaterialConceptId,
  type Product,
} from "@/lib/catalog";

export const catalogSortOptions = [
  { value: "featured", label: "莊園選品順序" },
  { value: "price-asc", label: "價格：低至高" },
  { value: "price-desc", label: "價格：高至低" },
  { value: "name-asc", label: "名稱：A–Z" },
] as const;

export type CatalogSort = (typeof catalogSortOptions)[number]["value"];

export interface CatalogQueryState {
  readonly q: string;
  readonly category: readonly CategoryId[];
  readonly audience: readonly AudienceId[];
  readonly collection: readonly CollectionId[];
  readonly color: readonly string[];
  readonly material: readonly MaterialConceptId[];
  readonly min?: number;
  readonly max?: number;
  readonly sort: CatalogSort;
}

export type CatalogQueryMutation = (
  current: CatalogQueryState,
) => CatalogQueryState;

export interface CatalogQueryCommit {
  readonly state: CatalogQueryState;
  readonly serialized: string;
}

export type CatalogQueryReconciliation =
  | { readonly kind: "unchanged" | "ignored" }
  | {
      readonly kind: "settled" | "restored";
      readonly state: CatalogQueryState;
    };

type SearchParamReader = Pick<URLSearchParams, "get" | "getAll">;

const categoryOrder = categoryMetadata.map(({ id }) => id);
const audienceOrder = Object.keys(audienceMetadata) as AudienceId[];
const collectionOrder = collections.map(({ id }) => id);
export const catalogColorOptions = canonicalProducts.reduce<
  { readonly value: string; readonly label: string }[]
>((options, product) => {
  const colorAxis = product.optionAxes.find((axis) => axis.key === "color");
  for (const value of colorAxis?.values ?? []) {
    if (!options.some((option) => option.value === value.value)) options.push(value);
  }
  return options;
}, []);
const colorOrder = catalogColorOptions.map(({ value }) => value);
const colorValues = new Set(colorOrder);
const materialOrder = Object.keys(materialConceptMetadata) as MaterialConceptId[];
const sortValues = new Set<CatalogSort>(catalogSortOptions.map(({ value }) => value));
const canonicalProductOrder = new Map<string, number>(
  canonicalProducts.map((product, index) => [product.id, index]),
);

function orderedUnique<T extends string>(
  values: readonly string[],
  valid: (value: string) => value is T,
  order: readonly T[],
): T[] {
  const selected = new Set(values.filter(valid));
  return order.filter((value) => selected.has(value));
}

function parseInclusiveInteger(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ");
}

function cloneCatalogQueryState(state: CatalogQueryState): CatalogQueryState {
  return {
    ...state,
    category: [...state.category],
    audience: [...state.audience],
    collection: [...state.collection],
    color: [...state.color],
    material: [...state.material],
  };
}

export function parseCatalogQuery(params: SearchParamReader): CatalogQueryState {
  const requestedSort = params.get("sort");

  return {
    q: normalizeQuery(params.get("q") ?? ""),
    category: orderedUnique(params.getAll("category"), isCategoryId, categoryOrder),
    audience: orderedUnique(params.getAll("audience"), isAudienceId, audienceOrder),
    collection: orderedUnique(params.getAll("collection"), isCollectionId, collectionOrder),
    color: orderedUnique(
      params.getAll("color"),
      (value): value is string => colorValues.has(value),
      colorOrder,
    ),
    material: orderedUnique(
      params.getAll("material"),
      isMaterialConceptId,
      materialOrder,
    ),
    min: parseInclusiveInteger(params.get("min")),
    max: parseInclusiveInteger(params.get("max")),
    sort:
      requestedSort && sortValues.has(requestedSort as CatalogSort)
        ? (requestedSort as CatalogSort)
        : "featured",
  };
}

export function serializeCatalogQuery(state: CatalogQueryState): string {
  const params = new URLSearchParams();
  const normalized = normalizeCatalogQueryState(state);

  if (normalized.q) params.set("q", normalized.q);
  for (const value of normalized.category) params.append("category", value);
  for (const value of normalized.audience) params.append("audience", value);
  for (const value of normalized.collection) params.append("collection", value);
  for (const value of normalized.color) params.append("color", value);
  for (const value of normalized.material) params.append("material", value);
  if (normalized.min !== undefined) params.set("min", String(normalized.min));
  if (normalized.max !== undefined) params.set("max", String(normalized.max));
  if (normalized.sort !== "featured") params.set("sort", normalized.sort);

  return params.toString();
}

export function normalizeCatalogQueryState(state: CatalogQueryState): CatalogQueryState {
  return {
    q: normalizeQuery(state.q),
    category: orderedUnique(state.category, isCategoryId, categoryOrder),
    audience: orderedUnique(state.audience, isAudienceId, audienceOrder),
    collection: orderedUnique(state.collection, isCollectionId, collectionOrder),
    color: orderedUnique(
      state.color,
      (value): value is string => colorValues.has(value),
      colorOrder,
    ),
    material: orderedUnique(state.material, isMaterialConceptId, materialOrder),
    min:
      state.min !== undefined && Number.isSafeInteger(state.min) && state.min >= 0
        ? state.min
        : undefined,
    max:
      state.max !== undefined && Number.isSafeInteger(state.max) && state.max >= 0
        ? state.max
        : undefined,
    sort: sortValues.has(state.sort) ? state.sort : "featured",
  };
}

export function emptyCatalogQuery(): CatalogQueryState {
  return {
    q: "",
    category: [],
    audience: [],
    collection: [],
    color: [],
    material: [],
    sort: "featured",
  };
}

/**
 * Owns the catalog's URL-query contract, including the one intentionally
 * uncommitted field: the debounced search draft. Immediate mutations always
 * consume that latest draft before producing one complete, canonical query.
 */
export class CatalogQueryCoordinator {
  private draft: CatalogQueryState;
  private committedState: CatalogQueryState;
  private committedKey: string;
  private settledKey: string;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private sequence = 0;
  private listener: ((commit: CatalogQueryCommit) => void) | undefined;

  constructor(
    initialState: CatalogQueryState,
    initialUrlKey = serializeCatalogQuery(initialState),
    private readonly debounceMs = 200,
  ) {
    const normalized = normalizeCatalogQueryState(initialState);
    this.draft = cloneCatalogQueryState(normalized);
    this.committedState = cloneCatalogQueryState(normalized);
    this.committedKey = initialUrlKey;
    this.settledKey = initialUrlKey;
  }

  setCommitListener(listener: ((commit: CatalogQueryCommit) => void) | undefined): void {
    this.listener = listener;
  }

  getLatestDraft(): CatalogQueryState {
    return cloneCatalogQueryState(this.draft);
  }

  scheduleSearch(query: string): void {
    this.draft = normalizeCatalogQueryState({ ...this.draft, q: query });
    this.cancelPendingSearch();

    if (this.draft.q === this.committedState.q) return;

    const scheduledSequence = this.sequence;
    this.timeout = setTimeout(() => {
      if (scheduledSequence !== this.sequence) return;
      this.timeout = null;
      this.emitDraft();
    }, this.debounceMs);
  }

  commit(mutation: CatalogQueryMutation): CatalogQueryCommit {
    this.cancelPendingSearch();
    this.draft = normalizeCatalogQueryState(
      mutation(cloneCatalogQueryState(this.draft)),
    );
    return this.emitDraft();
  }

  cancelPendingSearch(): void {
    this.sequence += 1;
    if (this.timeout !== null) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  reconcileUrl(
    urlKey: string,
    urlState: CatalogQueryState,
  ): CatalogQueryReconciliation {
    if (urlKey === this.settledKey) return { kind: "unchanged" };

    const normalized = normalizeCatalogQueryState(urlState);
    if (urlKey === this.committedKey) {
      const pendingSearch = this.timeout !== null ? this.draft.q : undefined;
      this.committedState = cloneCatalogQueryState(normalized);
      this.settledKey = urlKey;
      this.draft = cloneCatalogQueryState(
        pendingSearch === undefined ? normalized : { ...normalized, q: pendingSearch },
      );
      return { kind: "settled", state: cloneCatalogQueryState(normalized) };
    }

    // An unrelated key is browser history/document navigation only when no
    // router.replace commit is still waiting to settle. Stale intermediate
    // keys from rapid replaces are ignored until the newest key arrives.
    if (this.committedKey !== this.settledKey) return { kind: "ignored" };

    this.cancelPendingSearch();
    this.draft = cloneCatalogQueryState(normalized);
    this.committedState = cloneCatalogQueryState(normalized);
    this.committedKey = urlKey;
    this.settledKey = urlKey;
    return { kind: "restored", state: cloneCatalogQueryState(normalized) };
  }

  dispose(): void {
    this.cancelPendingSearch();
    this.listener = undefined;
  }

  private emitDraft(): CatalogQueryCommit {
    const state = normalizeCatalogQueryState(this.draft);
    const commit = {
      state: cloneCatalogQueryState(state),
      serialized: serializeCatalogQuery(state),
    } satisfies CatalogQueryCommit;

    this.draft = cloneCatalogQueryState(state);
    this.committedState = cloneCatalogQueryState(state);
    this.committedKey = commit.serialized;
    this.listener?.(commit);
    return commit;
  }
}

function productHasPriceInRange(
  product: Product,
  min: number | undefined,
  max: number | undefined,
): boolean {
  if (min === undefined && max === undefined) return true;

  const skuPrices = getSkusForProduct(product.id)
    .map(getEffectiveSkuPrice)
    .filter((price): price is number => price !== undefined);
  const prices = skuPrices.length > 0 ? skuPrices : [product.basePriceTwd];

  return prices.some(
    (price) => (min === undefined || price >= min) && (max === undefined || price <= max),
  );
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function stableProductFallback(left: Product, right: Product): number {
  const leftIndex = canonicalProductOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
  const rightIndex = canonicalProductOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;
  return leftIndex - rightIndex || compareText(left.slug, right.slug);
}

export function filterAndSortProducts(
  sourceProducts: readonly Product[],
  rawState: CatalogQueryState,
): Product[] {
  const state = normalizeCatalogQueryState(rawState);
  const tokens = normalizeCatalogSearchText(state.q).split(" ").filter(Boolean);

  const matches = sourceProducts.filter((product) => {
    if (tokens.length > 0) {
      const document = getProductSearchDocument(product);
      if (!tokens.every((token) => document.includes(token))) return false;
    }
    if (state.category.length > 0 && !state.category.includes(product.category)) return false;
    if (state.audience.length > 0 && !state.audience.includes(product.audience)) return false;
    if (state.collection.length > 0 && !state.collection.includes(product.collectionId)) {
      return false;
    }
    if (state.color.length > 0) {
      const colorAxis = product.optionAxes.find((axis) => axis.key === "color");
      if (!colorAxis?.values.some(({ value }) => state.color.includes(value))) return false;
    }
    if (
      state.material.length > 0 &&
      !product.materialConcepts.some((material) => state.material.includes(material))
    ) {
      return false;
    }
    return productHasPriceInRange(product, state.min, state.max);
  });

  return matches.toSorted((left, right) => {
    if (state.sort === "price-asc") {
      const difference =
        (getProductPriceRange(left.id)?.min ?? left.basePriceTwd) -
        (getProductPriceRange(right.id)?.min ?? right.basePriceTwd);
      return difference || stableProductFallback(left, right);
    }
    if (state.sort === "price-desc") {
      const difference =
        (getProductPriceRange(right.id)?.max ?? right.basePriceTwd) -
        (getProductPriceRange(left.id)?.max ?? left.basePriceTwd);
      return difference || stableProductFallback(left, right);
    }
    if (state.sort === "name-asc") {
      return compareText(left.name, right.name) || stableProductFallback(left, right);
    }
    return stableProductFallback(left, right);
  });
}

export function countActiveCatalogFilters(state: CatalogQueryState): number {
  return (
    (state.q ? 1 : 0) +
    state.category.length +
    state.audience.length +
    state.collection.length +
    state.color.length +
    state.material.length +
    (state.min !== undefined ? 1 : 0) +
    (state.max !== undefined ? 1 : 0)
  );
}
