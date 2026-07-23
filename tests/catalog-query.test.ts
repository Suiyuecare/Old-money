import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CatalogQueryCoordinator,
  emptyCatalogQuery,
  filterAndSortProducts,
  parseCatalogQuery,
  serializeCatalogQuery,
  type CatalogQueryState,
} from "@/components/catalog/catalog-query";
import { products, type Product } from "@/lib/catalog";

function queryState(
  overrides: Partial<CatalogQueryState> = {},
): CatalogQueryState {
  return { ...emptyCatalogQuery(), ...overrides };
}

function productIds(
  state: CatalogQueryState,
  source: readonly Product[] = products,
): string[] {
  return filterAndSortProducts(source, state).map((product) => product.id);
}

describe("catalog query parsing and canonical serialization", () => {
  it("ignores invalid values, de-duplicates facets, and emits every field in fixed order", () => {
    const parsed = parseCatalogQuery(
      new URLSearchParams(
        [
          "ignored=prototype",
          "q=++Rain+++Ledger++",
          "category=home",
          "category=unknown",
          "category=apparel",
          "category=home",
          "audience=unisex",
          "audience=men",
          "audience=men",
          "collection=dinner-at-the-long-table",
          "collection=first-light-in-the-field",
          "color=not-a-color",
          "color=deep-olive",
          "material=brass-concept",
          "material=cotton-pique",
          "min=0007800",
          "max=12.5",
          "sort=not-a-sort",
        ].join("&"),
      ),
    );

    expect(parsed).toEqual({
      q: "Rain Ledger",
      category: ["apparel", "home"],
      audience: ["men", "unisex"],
      collection: ["first-light-in-the-field", "dinner-at-the-long-table"],
      color: ["deep-olive"],
      material: ["cotton-pique", "brass-concept"],
      min: 7800,
      max: undefined,
      sort: "featured",
    });
    expect(serializeCatalogQuery(parsed)).toBe(
      "q=Rain+Ledger" +
        "&category=apparel&category=home" +
        "&audience=men&audience=unisex" +
        "&collection=first-light-in-the-field" +
        "&collection=dinner-at-the-long-table" +
        "&color=deep-olive" +
        "&material=cotton-pique&material=brass-concept" +
        "&min=7800",
    );
  });

  it("rejects negative, unsafe, and unknown single-value parameters", () => {
    expect(
      parseCatalogQuery(
        new URLSearchParams(
          "min=-1&max=9007199254740992&sort=lowest&category=prototype",
        ),
      ),
    ).toEqual(emptyCatalogQuery());
  });
});

describe("catalog search, facet, range, and sort semantics", () => {
  it("normalizes diacritics and requires every search token", () => {
    expect(productIds(queryState({ q: "  FÍELD   PÓLO  " }))).toEqual([
      "field-house-polo",
    ]);
    expect(productIds(queryState({ q: "field conservatory" }))).toEqual([]);
  });

  it("uses OR within a facet and AND across facets", () => {
    expect(
      productIds(
        queryState({
          category: ["apparel", "accessories"],
          audience: ["men"],
        }),
      ),
    ).toEqual([
      "field-house-polo",
      "alder-oxford-shirt",
      "keeper-bermuda-shorts",
      "long-table-tie",
    ]);

    expect(
      productIds(
        queryState({
          category: ["accessories"],
          material: ["leather-concept", "silk-weave"],
        }),
      ),
    ).toEqual([
      "bridle-line-belt",
      "rain-ledger-watch",
      "glasshouse-tote",
      "estate-dispatch-briefcase",
      "long-table-tie",
    ]);
  });

  it("includes both price boundaries and matches when any effective SKU price is in range", () => {
    expect(productIds(queryState({ min: 64_000, max: 64_000 }))).toContain(
      "rain-ledger-watch",
    );
    expect(productIds(queryState({ min: 64_001 }))).not.toContain(
      "rain-ledger-watch",
    );
    expect(productIds(queryState({ max: 58_000 }))).toContain("rain-ledger-watch");
    expect(productIds(queryState({ max: 57_999 }))).not.toContain(
      "rain-ledger-watch",
    );
  });

  it("sorts ascending by minimum SKU price and descending by maximum SKU price", () => {
    const notebook = products.find(({ id }) => id === "estate-ledger-notebook");
    const belt = products.find(({ id }) => id === "bridle-line-belt");
    expect(notebook).toBeDefined();
    expect(belt).toBeDefined();
    if (!notebook || !belt) return;

    const source = [belt, notebook];
    expect(productIds(queryState({ sort: "price-asc" }), source)).toEqual([
      "estate-ledger-notebook",
      "bridle-line-belt",
    ]);
    expect(productIds(queryState({ sort: "price-desc" }), source)).toEqual([
      "estate-ledger-notebook",
      "bridle-line-belt",
    ]);
  });
});

describe("CatalogQueryCoordinator", () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("debounces rapid search input for 200 ms and emits only the latest draft", () => {
    const listener = vi.fn();
    const coordinator = new CatalogQueryCoordinator(emptyCatalogQuery());
    coordinator.setCommitListener(listener);

    coordinator.scheduleSearch("p");
    vi.advanceTimersByTime(70);
    coordinator.scheduleSearch("po");
    vi.advanceTimersByTime(70);
    coordinator.scheduleSearch("polo");
    vi.advanceTimersByTime(199);
    expect(listener).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      serialized: "q=polo",
      state: { q: "polo" },
    });
  });

  it("cancels pending search and atomically mixes the latest draft with facets and sort", () => {
    const listener = vi.fn();
    const coordinator = new CatalogQueryCoordinator(emptyCatalogQuery());
    coordinator.setCommitListener(listener);

    coordinator.scheduleSearch("p");
    coordinator.scheduleSearch("polo");
    coordinator.commit((current) => ({ ...current, category: ["apparel"] }));
    coordinator.commit((current) => ({ ...current, sort: "price-desc" }));

    expect(listener.mock.calls.map(([commit]) => commit.serialized)).toEqual([
      "q=polo&category=apparel",
      "q=polo&category=apparel&sort=price-desc",
    ]);
    vi.advanceTimersByTime(1_000);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("preserves prior facets and sort when search is the last rapid mutation", () => {
    const listener = vi.fn();
    const coordinator = new CatalogQueryCoordinator(emptyCatalogQuery());
    coordinator.setCommitListener(listener);

    coordinator.commit((current) => ({ ...current, audience: ["men"] }));
    coordinator.commit((current) => ({ ...current, sort: "name-asc" }));
    coordinator.scheduleSearch("p");
    coordinator.scheduleSearch("polo");
    vi.advanceTimersByTime(200);

    expect(listener.mock.calls.at(-1)?.[0].serialized).toBe(
      "q=polo&audience=men&sort=name-asc",
    );
    expect(coordinator.getLatestDraft()).toMatchObject({
      q: "polo",
      audience: ["men"],
      sort: "name-asc",
    });
  });

  it("uses its sequence token to discard a stale callback even when timer cancellation loses", () => {
    vi.spyOn(globalThis, "clearTimeout").mockImplementation(() => undefined);
    const listener = vi.fn();
    const coordinator = new CatalogQueryCoordinator(emptyCatalogQuery());
    coordinator.setCommitListener(listener);

    coordinator.scheduleSearch("stale");
    coordinator.scheduleSearch("polo");
    vi.advanceTimersByTime(200);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0].serialized).toBe("q=polo");
  });

  it("ignores stale replace settlements, then restores settled browser history", () => {
    const coordinator = new CatalogQueryCoordinator(emptyCatalogQuery());
    const first = coordinator.commit((current) => ({
      ...current,
      category: ["apparel"],
    }));
    const latest = coordinator.commit((current) => ({
      ...current,
      sort: "price-desc",
    }));

    expect(
      coordinator.reconcileUrl(first.serialized, first.state),
    ).toEqual({ kind: "ignored" });
    expect(
      coordinator.reconcileUrl(latest.serialized, latest.state),
    ).toEqual({ kind: "settled", state: latest.state });

    const restored = queryState({ category: ["home"] });
    expect(coordinator.reconcileUrl("category=home", restored)).toEqual({
      kind: "restored",
      state: restored,
    });
    expect(coordinator.getLatestDraft()).toEqual(restored);
  });
});
