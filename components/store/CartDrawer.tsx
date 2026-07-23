"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { formatTwd } from "@/lib/catalog";
import { MAX_CART_QUANTITY, MIN_CART_QUANTITY, useStore } from "./StoreProvider";
import styles from "./store-ui.module.css";

export function CartDrawer() {
  const {
    amountUntilFreeShippingTwd,
    announcement,
    announcementId,
    cartDrawerOpen,
    cartItemCount,
    cartLines,
    closeCartDrawer,
    freeShippingThresholdTwd,
    hydrated,
    removeFromCart,
    shippingTwd,
    subtotalTwd,
    totalTwd,
    updateCartQuantity,
  } = useStore();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (cartDrawerOpen) {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!dialog.open) dialog.showModal();
      closeButtonRef.current?.focus();
      return;
    }

    if (dialog.open) dialog.close();
    returnFocusRef.current?.focus();
    returnFocusRef.current = null;
  }, [cartDrawerOpen]);

  const progressValue = Math.min(subtotalTwd, freeShippingThresholdTwd);

  return (
    <>
      <p className="sr-only" aria-live="polite" key={announcementId}>
        {announcement}
      </p>
      <dialog
        className={styles.drawerDialog}
        ref={dialogRef}
        aria-labelledby="cart-drawer-title"
        onCancel={(event) => {
          event.preventDefault();
          closeCartDrawer();
        }}
        onClose={closeCartDrawer}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeCartDrawer();
        }}
      >
        <div className={styles.drawerPanel}>
          <header className={styles.drawerHeader}>
            <div>
              <span>Estate bag</span>
              <h2 id="cart-drawer-title">購物袋</h2>
            </div>
            <button
              className={styles.iconButton}
              ref={closeButtonRef}
              type="button"
              onClick={closeCartDrawer}
            >
              <span aria-hidden="true">×</span>
              <span className="sr-only">關閉購物袋</span>
            </button>
          </header>

          {!hydrated ? (
            <div className={styles.drawerEmpty} role="status">
              <p>正在讀取購物袋…</p>
            </div>
          ) : cartLines.length === 0 ? (
            <div className={styles.drawerEmpty}>
              <p className={styles.emptyKicker}>The estate awaits</p>
              <h3>購物袋仍是空的</h3>
              <p>從一件值得長久使用的日常物件開始。</p>
              <Link className={styles.secondaryLink} href="/shop" onClick={closeCartDrawer}>
                瀏覽全部商品
              </Link>
            </div>
          ) : (
            <>
              <div className={styles.drawerLines}>
                {cartLines.map((line) => (
                  <article className={styles.drawerLine} key={line.skuId}>
                    <Link href={`/product/${line.productSlug}`} onClick={closeCartDrawer}>
                      <Image
                        src={line.imagePath}
                        alt={line.imageAlt}
                        width={112}
                        height={140}
                        sizes="112px"
                        className={styles.lineImage}
                      />
                    </Link>
                    <div className={styles.lineBody}>
                      <div>
                        <Link href={`/product/${line.productSlug}`} onClick={closeCartDrawer}>
                          <h3>{line.name}</h3>
                        </Link>
                        <p>{line.subtitle}</p>
                        <p className={styles.lineOptions}>
                          {line.options.map((option) => option.valueLabel).join(" · ")}
                        </p>
                      </div>
                      <div className={styles.lineControls}>
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
                        <strong>{formatTwd(line.lineTotalTwd)}</strong>
                      </div>
                      <button
                        className={styles.removeButton}
                        type="button"
                        onClick={() => removeFromCart(line.skuId)}
                      >
                        移除
                        <span className="sr-only"> {line.name}</span>
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <footer className={styles.drawerFooter}>
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
                <dl className={styles.compactTotals}>
                  <div>
                    <dt>商品小計（{cartItemCount} 件）</dt>
                    <dd>{formatTwd(subtotalTwd)}</dd>
                  </div>
                  <div>
                    <dt>配送</dt>
                    <dd>{shippingTwd === 0 ? "免運" : formatTwd(shippingTwd)}</dd>
                  </div>
                  <div>
                    <dt>合計</dt>
                    <dd>{formatTwd(totalTwd)}</dd>
                  </div>
                </dl>
                <Link className={styles.primaryLink} href="/checkout" onClick={closeCartDrawer}>
                  前往模擬結帳
                </Link>
                <Link className={styles.drawerTextLink} href="/cart" onClick={closeCartDrawer}>
                  查看完整購物袋
                </Link>
                <p className={styles.prototypeFinePrint}>概念預覽，不會進行真實交易或扣款。</p>
              </footer>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
