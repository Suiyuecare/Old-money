"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { ProductGrid } from "@/components/products/ProductGrid";
import { useStore } from "@/components/store/StoreProvider";
import {
  findSkuForOptions,
  formatTwd,
  getCategoryById,
  getCollectionById,
  getEffectiveSkuPrice,
  getMaterialConceptLabel,
  getProductPriceRange,
  getSkuById,
  type Product,
  type ProductOptionAxis,
  type ProductOptionKey,
} from "@/lib/catalog";

import styles from "./product-detail.module.css";

interface ProductDetailClientProps {
  readonly product: Product;
  readonly relatedProducts: readonly Product[];
}

type SelectedOptions = Partial<Record<ProductOptionKey, string>>;

const optionGroupId = (productId: string, axis: ProductOptionAxis) =>
  `option-${productId}-${axis.key}`;

export function ProductDetailClient({
  product,
  relatedProducts,
}: ProductDetailClientProps) {
  const {
    addToCart,
    hydrated,
    isWishlisted,
    toggleWishlist,
  } = useStore();
  const [selectedOptions, setSelectedOptions] = useState<SelectedOptions>({});
  const [submitted, setSubmitted] = useState(false);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [addedSkuId, setAddedSkuId] = useState<string | null>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  const collection = getCollectionById(product.collectionId);
  const category = getCategoryById(product.category);
  const priceRange = getProductPriceRange(product.id);
  const selectedSku = useMemo(
    () => findSkuForOptions(product.id, selectedOptions),
    [product.id, selectedOptions],
  );
  const missingAxes = product.optionAxes.filter(
    (axis) => selectedOptions[axis.key] === undefined,
  );
  const hasEverySelection = missingAxes.length === 0;
  const hasUnsupportedCombination = hasEverySelection && selectedSku === undefined;
  const hasValidationErrors = missingAxes.length > 0 || hasUnsupportedCombination;
  const wishlisted = hydrated && isWishlisted(product.id);

  const priceText = (() => {
    if (selectedSku) {
      const exactPrice = getEffectiveSkuPrice(selectedSku);
      return exactPrice === undefined ? formatTwd(product.basePriceTwd) : formatTwd(exactPrice);
    }
    if (!priceRange) return formatTwd(product.basePriceTwd);
    return priceRange.isRange
      ? `${formatTwd(priceRange.min)} – ${formatTwd(priceRange.max)}`
      : formatTwd(priceRange.min);
  })();

  const picturedSku = getSkuById(product.image.picturedSkuId);
  const colorAxis = product.optionAxes.find((axis) => axis.key === "color");
  const picturedColorValue = picturedSku?.options.color;
  const picturedColorLabel = colorAxis?.values.find(
    (option) => option.value === picturedColorValue,
  )?.label;

  useEffect(() => {
    if (validationAttempt > 0 && hasValidationErrors) errorSummaryRef.current?.focus();
  }, [hasValidationErrors, validationAttempt]);

  const selectOption = (key: ProductOptionKey, value: string) => {
    setSelectedOptions((current) => ({ ...current, [key]: value }));
    setAddedSkuId(null);
  };

  const handleAddToCart = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);

    // The catalog resolver is the sole authority for a purchasable option set.
    const canonicalSku = findSkuForOptions(product.id, selectedOptions);
    if (!canonicalSku) {
      setValidationAttempt((attempt) => attempt + 1);
      return;
    }

    if (addToCart(canonicalSku.id)) {
      setAddedSkuId(canonicalSku.id);
      setSubmitted(false);
    }
  };

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumbs} aria-label="麵包屑導覽">
        <Link href="/">首頁</Link>
        <span aria-hidden="true">/</span>
        <Link href="/shop">全部商品</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{product.subtitle}</span>
      </nav>

      <article className={styles.product}>
        <div className={styles.visualColumn}>
          <div className={styles.imageFrame}>
            <Image
              src={product.image.path}
              alt={product.image.alt}
              fill
              priority
              sizes="(max-width: 900px) 100vw, 58vw"
              className={styles.productImage}
            />
            <span className={styles.imageStamp}>LIGNÉE · Concept 01</span>
          </div>

          {colorAxis ? (
            <p
              className={styles.representativeNotice}
              id={`${product.id}-representative-color-notice`}
            >
              <span aria-hidden="true">◌</span>
              影像為{picturedColorLabel ? `「${picturedColorLabel}」` : "所示款式"}代表色；
              選擇其他顏色時，影像不會切換，實際色澤仍待打樣確認。
            </p>
          ) : null}
        </div>

        <div className={styles.purchaseColumn}>
          <p className="eyebrow">
            {collection?.name ?? "The Lignée Estate"}
          </p>
          <h1>{product.name}</h1>
          <p className={styles.subtitle}>{product.subtitle}</p>
          <p className={styles.story}>{product.story}</p>

          <div className={styles.priceBlock} aria-live="polite">
            <span>{selectedSku ? "所選規格" : "概念售價"}</span>
            <strong>{priceText}</strong>
          </div>

          <aside className={styles.conceptNotice} aria-label="概念商品告知">
            <strong>Concept specification</strong>
            <p>
              本頁為品牌原型；材質、色澤、尺寸與產地皆為開發方向，尚非經驗證的銷售聲明，亦不會進行真實扣款。
            </p>
          </aside>

          <form className={styles.purchaseForm} noValidate onSubmit={handleAddToCart}>
            {submitted && hasValidationErrors ? (
              <div
                className={styles.errorSummary}
                ref={errorSummaryRef}
                role="alert"
                tabIndex={-1}
              >
                <strong>請先完成規格選擇</strong>
                <ul>
                  {missingAxes.map((axis) => (
                    <li key={axis.key}>
                      <a href={`#${optionGroupId(product.id, axis)}`}>
                        請選擇{axis.label}
                      </a>
                    </li>
                  ))}
                  {hasUnsupportedCombination ? (
                    <li>此規格組合尚未建立，請重新選擇。</li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            <div className={styles.optionGroups}>
              {product.optionAxes.map((axis) => {
                const axisHasError =
                  submitted && selectedOptions[axis.key] === undefined;
                const errorId = `${optionGroupId(product.id, axis)}-error`;
                const describedBy = [
                  axis.key === "color"
                    ? `${product.id}-representative-color-notice`
                    : undefined,
                  axisHasError ? errorId : undefined,
                ]
                  .filter((id): id is string => id !== undefined)
                  .join(" ");

                return (
                  <fieldset
                    className={styles.optionGroup}
                    id={optionGroupId(product.id, axis)}
                    key={axis.key}
                    aria-describedby={describedBy || undefined}
                    aria-invalid={axisHasError || undefined}
                    tabIndex={-1}
                  >
                    <legend>
                      {axis.label}
                      <span>必選</span>
                    </legend>
                    <div className={styles.optionChoices}>
                      {axis.values.map((option) => {
                        const inputId = `${product.id}-${axis.key}-${option.value}`;
                        return (
                          <label className={styles.optionChoice} key={option.value}>
                            <input
                              id={inputId}
                              name={`${product.id}-${axis.key}`}
                              type="radio"
                              value={option.value}
                              checked={selectedOptions[axis.key] === option.value}
                              onChange={() => selectOption(axis.key, option.value)}
                              required
                            />
                            <span>{option.label}</span>
                          </label>
                        );
                      })}
                    </div>
                    {axisHasError ? (
                      <p className={styles.fieldError} id={errorId}>
                        請選擇{axis.label}。
                      </p>
                    ) : null}
                  </fieldset>
                );
              })}
            </div>

            {selectedSku ? (
              <p className={styles.selectionConfirmation} aria-live="polite">
                已選定：
                {product.optionAxes
                  .map((axis) => {
                    const value = selectedSku.options[axis.key];
                    return axis.values.find((option) => option.value === value)?.label;
                  })
                  .filter((label): label is string => label !== undefined)
                  .join(" · ")}
              </p>
            ) : (
              <p className={styles.selectionPrompt}>完整選擇後將顯示此規格的確切價格。</p>
            )}

            <div className={styles.actions}>
              <button className={styles.addButton} type="submit" disabled={!hydrated}>
                {hydrated ? "加入購物車" : "正在準備購物資料…"}
              </button>
              <button
                className={styles.wishlistButton}
                type="button"
                aria-pressed={wishlisted}
                disabled={!hydrated}
                onClick={() => toggleWishlist(product.id)}
              >
                <span aria-hidden="true">{wishlisted ? "♥" : "♡"}</span>
                {wishlisted ? "已收藏" : "加入收藏"}
              </button>
            </div>

            {addedSkuId ? (
              <p className={styles.addedNotice} role="status">
                已加入概念購物車。<Link href="/cart">前往查看</Link>
              </p>
            ) : null}
          </form>

          <div className={styles.serviceNote}>
            <div>
              <strong>Delivery concept</strong>
              <span>原型配送規劃：台灣地區滿 NT$12,000 免運；未滿 NT$250。</span>
            </div>
            <div>
              <strong>Returns policy draft</strong>
              <span>原型服務草案以到貨後 14 日內提出申請為方向；例外尚未定案，正式上線前須經法律審閱並明示。</span>
            </div>
          </div>
        </div>
      </article>

      <section className={styles.information} aria-labelledby="product-information-title">
        <div className={styles.informationIntro}>
          <span className="eyebrow">In quiet detail</span>
          <h2 id="product-information-title">為長久使用而想像</h2>
          <p>{product.description}</p>
        </div>

        <div className={styles.accordions}>
          <details open>
            <summary>材質與細節</summary>
            <div className={styles.accordionBody}>
              <p>{product.description}</p>
              <p>
                概念材質：
                {product.materialConcepts
                  .map((material) => getMaterialConceptLabel(material))
                  .filter((label): label is string => label !== undefined)
                  .join("、")}
                。所有材質資訊均待實際供應鏈與打樣確認。
              </p>
              <p>
                系列：{collection?.name ?? "LIGNÉE Estate Collection"} · 分類：
                {category?.label ?? "選品"}
              </p>
            </div>
          </details>
          <details>
            <summary>尺寸與規格</summary>
            <div className={styles.accordionBody}>
              <p>{product.sizing}</p>
              <p>第一版為概念規格；正式尺寸表將於版型與樣品完成後更新。</p>
            </div>
          </details>
          <details>
            <summary>保養方式</summary>
            <div className={styles.accordionBody}>
              <p>{product.care}</p>
              <p>正式保養方式應以最終商品洗標或隨附說明為準。</p>
            </div>
          </details>
        </div>
      </section>

      {relatedProducts.length > 0 ? (
        <section className={styles.related} aria-labelledby="related-products-title">
          <div className={styles.relatedHeader}>
            <div>
              <span className="eyebrow">From the same estate</span>
              <h2 id="related-products-title">延續這段日常</h2>
            </div>
            <Link className="text-link" href="/shop">
              瀏覽全部商品
            </Link>
          </div>
          <ProductGrid products={relatedProducts} />
        </section>
      ) : null}
    </div>
  );
}
