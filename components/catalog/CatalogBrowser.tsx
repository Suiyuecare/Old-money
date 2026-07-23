"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ProductGrid } from "@/components/products/ProductGrid";
import {
  audienceMetadata,
  categoryMetadata,
  collections,
  formatTwd,
  materialConceptMetadata,
  type Product,
} from "@/lib/catalog";
import {
  catalogColorOptions,
  catalogSortOptions,
  CatalogQueryCoordinator,
  countActiveCatalogFilters,
  emptyCatalogQuery,
  filterAndSortProducts,
  parseCatalogQuery,
  type CatalogQueryCommit,
  type CatalogQueryMutation,
  type CatalogQueryState,
} from "./catalog-query";
import styles from "./catalog.module.css";

interface CatalogBrowserProps {
  readonly products: readonly Product[];
}

type MultiValueKey = "category" | "audience" | "collection" | "color" | "material";

const dialogFocusableSelector = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function numberDraft(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

export function CatalogBrowser({ products }: CatalogBrowserProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlKey = searchParams.toString();
  const urlQuery = useMemo(
    () => parseCatalogQuery(new URLSearchParams(urlKey)),
    [urlKey],
  );
  const [query, setQuery] = useState<CatalogQueryState>(urlQuery);
  const [searchDraft, setSearchDraft] = useState(urlQuery.q);
  const [minDraft, setMinDraft] = useState(numberDraft(urlQuery.min));
  const [maxDraft, setMaxDraft] = useState(numberDraft(urlQuery.max));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [usesMobileFilters, setUsesMobileFilters] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const mobileFilterDialogId = useId();
  const mobileFilterDialogLabelId = useId();
  const filterDialogRef = useRef<HTMLDialogElement>(null);
  const mobileFilterTriggerRef = useRef<HTMLButtonElement>(null);
  const [coordinator] = useState(() => new CatalogQueryCoordinator(urlQuery, urlKey));

  const applyCoordinatorCommit = useCallback(
    ({ state, serialized }: CatalogQueryCommit) => {
      setQuery(state);
      router.replace(serialized ? `${pathname}?${serialized}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router],
  );

  useEffect(() => {
    coordinator.setCommitListener(applyCoordinatorCommit);
    return () => coordinator.dispose();
  }, [applyCoordinatorCommit, coordinator]);

  const applyUrlReconciliation = useEffectEvent(
    (reconciliation: Extract<
      ReturnType<CatalogQueryCoordinator["reconcileUrl"]>,
      { readonly state: CatalogQueryState }
    >) => {
      setQuery(reconciliation.state);
      if (reconciliation.kind === "restored") {
        setSearchDraft(reconciliation.state.q);
        setMinDraft(numberDraft(reconciliation.state.min));
        setMaxDraft(numberDraft(reconciliation.state.max));
      }
    },
  );

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 900px)");

    const syncFilterMode = () => {
      if (!mobileQuery.matches && filterDialogRef.current?.open) {
        filterDialogRef.current.close();
      }
      if (!mobileQuery.matches) setMobileFiltersOpen(false);
      setUsesMobileFilters(mobileQuery.matches);
    };

    syncFilterMode();
    mobileQuery.addEventListener("change", syncFilterMode);
    return () => mobileQuery.removeEventListener("change", syncFilterMode);
  }, []);

  useEffect(() => {
    if (!mobileFiltersOpen) return;
    const dialog = filterDialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, [mobileFiltersOpen, usesMobileFilters]);

  useEffect(() => {
    const syncRestoredDialogState = () => {
      if (!filterDialogRef.current?.open) setMobileFiltersOpen(false);
    };

    window.addEventListener("pageshow", syncRestoredDialogState);
    return () => window.removeEventListener("pageshow", syncRestoredDialogState);
  }, []);

  useEffect(() => {
    const reconciliation = coordinator.reconcileUrl(urlKey, urlQuery);
    if (!("state" in reconciliation)) return;

    const frame = requestAnimationFrame(() => applyUrlReconciliation(reconciliation));
    return () => cancelAnimationFrame(frame);
  }, [coordinator, urlKey, urlQuery]);

  const commit = useCallback(
    (mutation: CatalogQueryMutation) => coordinator.commit(mutation).state,
    [coordinator],
  );

  const available = useMemo(
    () => ({
      category: new Set(products.map((product) => product.category)),
      audience: new Set(products.map((product) => product.audience)),
      collection: new Set(products.map((product) => product.collectionId)),
      color: new Set(
        products.flatMap(
          (product) =>
            product.optionAxes.find((axis) => axis.key === "color")?.values.map(({ value }) => value) ?? [],
        ),
      ),
      material: new Set(products.flatMap((product) => product.materialConcepts)),
    }),
    [products],
  );

  const results = useMemo(() => filterAndSortProducts(products, query), [products, query]);
  const activeCount = countActiveCatalogFilters(query);

  const toggleValue = (key: MultiValueKey, value: string, checked: boolean) => {
    commit((current) => {
      const values = new Set<string>(current[key]);
      if (checked) values.add(value);
      else values.delete(value);
      return { ...current, [key]: [...values] } as CatalogQueryState;
    });
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = commit((current) => ({ ...current, q: searchDraft }));
    setSearchDraft(next.q);
  };

  const updateSearchDraft = (value: string) => {
    setSearchDraft(value);
    coordinator.scheduleSearch(value);
  };

  const submitPrice = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parseDraft = (value: string) => {
      if (!/^\d+$/.test(value)) return undefined;
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) ? parsed : undefined;
    };
    const next = commit((current) => ({
      ...current,
      min: parseDraft(minDraft),
      max: parseDraft(maxDraft),
    }));
    setMinDraft(numberDraft(next.min));
    setMaxDraft(numberDraft(next.max));
  };

  const clearAll = () => {
    const cleared = emptyCatalogQuery();
    setSearchDraft("");
    setMinDraft("");
    setMaxDraft("");
    commit(() => cleared);
  };

  const openMobileFilters = () => {
    if (!usesMobileFilters) setUsesMobileFilters(true);
    const dialog = filterDialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    setMobileFiltersOpen(true);
  };

  const closeMobileFilters = () => {
    if (filterDialogRef.current?.open) filterDialogRef.current.close();
    else setMobileFiltersOpen(false);
  };

  const handleMobileFiltersClosed = () => {
    setMobileFiltersOpen(false);
    requestAnimationFrame(() => mobileFilterTriggerRef.current?.focus());
  };

  const handleMobileDialogKeyDown = (event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(dialogFocusableSelector),
    ).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
    const first = focusable.at(0);
    const last = focusable.at(-1);
    if (!first || !last) return;

    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const filterControls = (
    <div className={styles.filterBody}>
      <FilterGroup legend="類別">
        {categoryMetadata
          .filter(({ id }) => available.category.has(id))
          .map((item) => (
            <FilterCheckbox
              key={item.id}
              id={`category-${item.id}`}
              label={item.label}
              checked={query.category.includes(item.id)}
              onChange={(checked) => toggleValue("category", item.id, checked)}
            />
          ))}
      </FilterGroup>

      <FilterGroup legend="適用對象">
        {Object.entries(audienceMetadata)
          .filter(([id]) => available.audience.has(id as keyof typeof audienceMetadata))
          .map(([id, item]) => (
            <FilterCheckbox
              key={id}
              id={`audience-${id}`}
              label={item.label}
              checked={query.audience.includes(id as keyof typeof audienceMetadata)}
              onChange={(checked) => toggleValue("audience", id, checked)}
            />
          ))}
      </FilterGroup>

      <FilterGroup legend="莊園篇章">
        {collections
          .filter(({ id }) => available.collection.has(id))
          .map((item) => (
            <FilterCheckbox
              key={item.id}
              id={`collection-${item.id}`}
              label={item.subtitle}
              checked={query.collection.includes(item.id)}
              onChange={(checked) => toggleValue("collection", item.id, checked)}
            />
          ))}
      </FilterGroup>

      <FilterGroup legend="顏色">
        {catalogColorOptions
          .filter(({ value }) => available.color.has(value))
          .map((item) => (
            <FilterCheckbox
              key={item.value}
              id={`color-${item.value}`}
              label={item.label}
              checked={query.color.includes(item.value)}
              onChange={(checked) => toggleValue("color", item.value, checked)}
            />
          ))}
      </FilterGroup>

      <FilterGroup legend="概念材質">
        {Object.entries(materialConceptMetadata)
          .filter(([id]) =>
            available.material.has(id as keyof typeof materialConceptMetadata),
          )
          .map(([id, item]) => (
            <FilterCheckbox
              key={id}
              id={`material-${id}`}
              label={item.label}
              checked={query.material.includes(id as keyof typeof materialConceptMetadata)}
              onChange={(checked) => toggleValue("material", id, checked)}
            />
          ))}
      </FilterGroup>

      <form className={styles.priceFilter} onSubmit={submitPrice}>
        <fieldset>
          <legend>價格範圍</legend>
          <div className={styles.priceFields}>
            <label>
              <span>最低價</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                placeholder="0"
                value={minDraft}
                onChange={(event) => setMinDraft(event.target.value)}
              />
            </label>
            <span aria-hidden="true">—</span>
            <label>
              <span>最高價</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                placeholder="120000"
                value={maxDraft}
                onChange={(event) => setMaxDraft(event.target.value)}
              />
            </label>
          </div>
          <p>含價格上下限；以任一可選規格價格計算。</p>
          <button type="submit">套用價格</button>
        </fieldset>
      </form>

      <button
        className={styles.clearButton}
        type="button"
        onClick={clearAll}
        disabled={activeCount === 0 && query.sort === "featured"}
      >
        清除全部條件
      </button>
    </div>
  );

  return (
    <section className={`shell ${styles.catalog}`} aria-labelledby="catalog-results-heading">
      <form className={styles.search} role="search" onSubmit={submitSearch}>
        <label htmlFor="catalog-search">搜尋 LIGNÉE 選品</label>
        <div className={styles.searchRow}>
          <input
            id="catalog-search"
            name="q"
            type="search"
            value={searchDraft}
            placeholder="輸入商品、系列或材質"
            onChange={(event) => updateSearchDraft(event.target.value)}
          />
          <button type="submit">搜尋</button>
        </div>
      </form>

      <div className={styles.toolbar}>
        <h2 id="catalog-results-heading" className={styles.resultCount} aria-live="polite" aria-atomic="true">
          找到 <strong>{results.length}</strong> 件選品
        </h2>
        <label className={styles.sort}>
          <span>排序</span>
          <select
            value={query.sort}
            onChange={(event) =>
              commit((current) => ({
                ...current,
                sort: event.target.value as CatalogQueryState["sort"],
              }))
            }
          >
            {catalogSortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.layout}>
        <aside className={styles.filterColumn} aria-label="商品篩選">
          <div className={styles.mobileFilters}>
            <button
              ref={mobileFilterTriggerRef}
              className={styles.mobileFilterTrigger}
              type="button"
              aria-controls={mobileFilterDialogId}
              aria-expanded={mobileFiltersOpen}
              aria-haspopup="dialog"
              disabled={!usesMobileFilters}
              onClick={openMobileFilters}
            >
              <span>篩選商品</span>
              <span>{activeCount > 0 ? `${activeCount} 個條件` : "全部"}</span>
            </button>
          </div>

          {usesMobileFilters ? (
              <dialog
                ref={filterDialogRef}
                id={mobileFilterDialogId}
                className={styles.mobileFilterDialog}
                aria-labelledby={mobileFilterDialogLabelId}
                onClose={handleMobileFiltersClosed}
                onKeyDown={handleMobileDialogKeyDown}
              >
                <div className={styles.mobileDialogHeader}>
                  <div>
                    <span className="eyebrow">Refine the edit</span>
                    <h2 id={mobileFilterDialogLabelId}>篩選商品</h2>
                  </div>
                  <button type="button" autoFocus onClick={closeMobileFilters}>
                    關閉篩選
                  </button>
                </div>
                <div className={styles.mobileDialogScroll}>{filterControls}</div>
                <div className={styles.mobileDialogFooter}>
                  <button type="button" onClick={closeMobileFilters}>
                    查看 {results.length} 件選品
                  </button>
                </div>
              </dialog>
          ) : (
            <details
              className={`${styles.filterDisclosure} ${styles.desktopFilters}`}
              open={filtersOpen}
              onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
            >
              <summary>
                <span>篩選商品</span>
                <span>{activeCount > 0 ? `${activeCount} 個條件` : "全部"}</span>
              </summary>
              {filterControls}
            </details>
          )}
        </aside>

        <div className={styles.results}>
          {results.length > 0 ? (
            <ProductGrid products={results} prioritize={3} />
          ) : (
            <div className={styles.empty}>
              <span className="eyebrow">No pieces found</span>
              <h2>沒有符合條件的選品</h2>
              <p>試著移除部分篩選條件，或以更簡短的關鍵字搜尋。</p>
              <button className="button-secondary" type="button" onClick={clearAll}>
                查看全部選品
              </button>
            </div>
          )}
          {results.length > 0 && (
            <p className={styles.priceNote}>
              所有價格皆為新台幣概念定價；目前網站不提供真實交易。價格示例：{formatTwd(12000)}。
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function FilterGroup({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className={styles.filterGroup}>
      <legend>{legend}</legend>
      <div className={styles.filterOptions}>{children}</div>
    </fieldset>
  );
}

function FilterCheckbox({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={styles.checkbox} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span aria-hidden="true" />
      {label}
    </label>
  );
}
