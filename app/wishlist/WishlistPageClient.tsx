"use client";

import Image from "next/image";
import Link from "next/link";

import { useStore } from "@/components/store/StoreProvider";
import styles from "@/components/store/store-ui.module.css";
import { formatTwd, getProductPriceRange } from "@/lib/catalog";

export function WishlistPageClient() {
  const {
    hydrated,
    removeFromWishlist,
    wishlistProducts,
  } = useStore();

  if (!hydrated) {
    return (
      <section className={styles.loadingPage} aria-busy="true" aria-live="polite">
        <span className="eyebrow">Pieces to remember</span>
        <h1>收藏清單</h1>
        <p>正在讀取這個瀏覽器中的收藏…</p>
      </section>
    );
  }

  if (wishlistProducts.length === 0) {
    return (
      <section className={styles.emptyPage}>
        <span className="eyebrow">Pieces to remember</span>
        <h1>尚未收藏作品</h1>
        <p>把想再細看的衣著與日常器物，暫時留在這裡。</p>
        <Link className={styles.primaryLink} href="/shop">
          瀏覽全部商品
        </Link>
      </section>
    );
  }

  return (
    <div className={styles.commercePage}>
      <header className={styles.commerceHeader}>
        <span className="eyebrow">Pieces to remember</span>
        <h1>收藏清單</h1>
        <p>{wishlistProducts.length} 件留待重訪的作品，收藏只保存在這個瀏覽器。</p>
      </header>

      <section className={styles.wishlistGrid} aria-label="已收藏商品">
        {wishlistProducts.map((product) => {
          const range = getProductPriceRange(product.id);
          const price = range
            ? range.isRange
              ? `${formatTwd(range.min)} – ${formatTwd(range.max)}`
              : formatTwd(range.min)
            : formatTwd(product.basePriceTwd);

          return (
            <article className={styles.wishlistCard} key={product.id}>
              <Link className={styles.wishlistImage} href={`/product/${product.slug}`}>
                <Image
                  src={product.image.path}
                  alt={product.image.alt}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 33vw"
                  className={styles.lineImage}
                />
              </Link>
              <div className={styles.wishlistMeta}>
                <div>
                  <Link href={`/product/${product.slug}`}>
                    <h2>{product.name}</h2>
                  </Link>
                  <p>{product.subtitle}</p>
                </div>
                <span>{price}</span>
              </div>
              <div className={styles.wishlistActions}>
                <Link className={styles.primaryLink} href={`/product/${product.slug}`}>
                  選擇規格
                </Link>
                <button type="button" onClick={() => removeFromWishlist(product.id)}>
                  移除收藏<span className="sr-only"> {product.name}</span>
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
