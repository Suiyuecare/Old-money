"use client";

import Image from "next/image";
import Link from "next/link";

import {
  MAX_CART_QUANTITY,
  MIN_CART_QUANTITY,
  useStore,
} from "@/components/store/StoreProvider";
import styles from "@/components/store/store-ui.module.css";
import { formatTwd } from "@/lib/catalog";

export function CartPageClient() {
  const {
    amountUntilFreeShippingTwd,
    cartItemCount,
    cartLines,
    clearCart,
    freeShippingThresholdTwd,
    hydrated,
    removeFromCart,
    shippingTwd,
    subtotalTwd,
    totalTwd,
    updateCartQuantity,
  } = useStore();
  const progressValue = Math.min(subtotalTwd, freeShippingThresholdTwd);

  if (!hydrated) {
    return (
      <section className={styles.loadingPage} aria-busy="true" aria-live="polite">
        <span className="eyebrow">Your estate bag</span>
        <h1>購物袋</h1>
        <p>正在安全讀取這個瀏覽器中的概念購物資料…</p>
      </section>
    );
  }

  if (cartLines.length === 0) {
    return (
      <section className={styles.emptyPage}>
        <span className="eyebrow">Your estate bag</span>
        <h1>購物袋仍是空的</h1>
        <p>從衣櫥、藏書室或長桌上的一件日常物件開始。</p>
        <Link className={styles.primaryLink} href="/shop">
          探索全部商品
        </Link>
      </section>
    );
  }

  return (
    <div className={styles.commercePage}>
      <header className={styles.commerceHeader}>
        <span className="eyebrow">Your estate bag</span>
        <h1>購物袋</h1>
        <p>{cartItemCount} 件概念商品，所有價格均由目前規格重新計算。</p>
      </header>

      <div className={styles.cartLayout}>
        <section className={styles.cartList} aria-labelledby="cart-lines-title">
          <div className={styles.sectionBar}>
            <h2 id="cart-lines-title">商品</h2>
            <button type="button" onClick={clearCart}>清空購物袋</button>
          </div>
          {cartLines.map((line) => (
            <article className={styles.cartLine} key={line.skuId}>
              <Link className={styles.cartImageLink} href={`/product/${line.productSlug}`}>
                <Image
                  src={line.imagePath}
                  alt={line.imageAlt}
                  fill
                  sizes="(max-width: 600px) 32vw, 180px"
                  className={styles.lineImage}
                />
              </Link>
              <div className={styles.cartLineBody}>
                <div className={styles.cartLineTop}>
                  <div>
                    <Link href={`/product/${line.productSlug}`}>
                      <h3>{line.name}</h3>
                    </Link>
                    <p>{line.subtitle}</p>
                    <dl className={styles.optionList}>
                      {line.options.map((option) => (
                        <div key={option.key}>
                          <dt>{option.label}</dt>
                          <dd>{option.valueLabel}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  <strong>{formatTwd(line.lineTotalTwd)}</strong>
                </div>
                <div className={styles.cartLineBottom}>
                  <div className={styles.quantityControl} aria-label={`${line.name} 數量`}>
                    <button
                      type="button"
                      disabled={line.quantity <= MIN_CART_QUANTITY}
                      onClick={() => updateCartQuantity(line.skuId, line.quantity - 1)}
                    >
                      <span aria-hidden="true">−</span>
                      <span className="sr-only">減少一件</span>
                    </button>
                    <span aria-live="polite">{line.quantity}</span>
                    <button
                      type="button"
                      disabled={line.quantity >= MAX_CART_QUANTITY}
                      onClick={() => updateCartQuantity(line.skuId, line.quantity + 1)}
                    >
                      <span aria-hidden="true">＋</span>
                      <span className="sr-only">增加一件</span>
                    </button>
                  </div>
                  <span className={styles.unitPrice}>單價 {formatTwd(line.unitPriceTwd)}</span>
                  <button
                    className={styles.removeButton}
                    type="button"
                    onClick={() => removeFromCart(line.skuId)}
                  >
                    移除<span className="sr-only"> {line.name}</span>
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>

        <aside className={styles.orderSummary} aria-labelledby="cart-summary-title">
          <span className={styles.summaryKicker}>Order summary</span>
          <h2 id="cart-summary-title">本次概念選品</h2>
          <div className={styles.shippingProgress}>
            <div>
              <span>
                {amountUntilFreeShippingTwd === 0
                  ? "已享台灣地區免運"
                  : `再選購 ${formatTwd(amountUntilFreeShippingTwd)} 即享免運`}
              </span>
              <span aria-hidden="true">
                {Math.round((progressValue / freeShippingThresholdTwd) * 100)}%
              </span>
            </div>
            <progress
              max={freeShippingThresholdTwd}
              value={progressValue}
              aria-label="免運門檻進度"
            />
          </div>
          <dl className={styles.orderTotals}>
            <div>
              <dt>商品小計</dt>
              <dd>{formatTwd(subtotalTwd)}</dd>
            </div>
            <div>
              <dt>台灣地區配送</dt>
              <dd>{shippingTwd === 0 ? "免運" : formatTwd(shippingTwd)}</dd>
            </div>
            <div>
              <dt>合計</dt>
              <dd>{formatTwd(totalTwd)}</dd>
            </div>
          </dl>
          <Link className={styles.primaryLink} href="/checkout">
            前往模擬結帳
          </Link>
          <p className={styles.prototypeNotice}>
            Prototype only — 不會要求付款資料、不會扣款，也不會建立真實訂單。
          </p>
          <div className={styles.serviceDetails}>
            <p><strong>14 日服務草案</strong> 原型以到貨後 14 日內提出申請為規劃方向；正式條款仍待法律審閱。</p>
            <p><strong>International</strong> 國際配送尚未開放。</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
