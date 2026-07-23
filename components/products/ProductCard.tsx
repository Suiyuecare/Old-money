"use client";

import Image from "next/image";
import Link from "next/link";
import { useStore } from "@/components/store/StoreProvider";
import type { Product } from "@/lib/catalog";
import {
  categoryMetadata,
  collections,
  formatTwd,
  getProductPriceRange,
} from "@/lib/catalog";
import styles from "./products.module.css";

export function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  const { hydrated, isWishlisted, toggleWishlist } = useStore();
  const range = getProductPriceRange(product.id);
  const price = range
    ? range.min === range.max
      ? formatTwd(range.min)
      : `${formatTwd(range.min)} – ${formatTwd(range.max)}`
    : formatTwd(product.basePriceTwd);
  const wishlisted = hydrated && isWishlisted(product.id);
  const category = categoryMetadata.find((item) => item.id === product.category);
  const collection = collections.find((item) => item.id === product.collectionId);
  const colorOptions = product.optionAxes.find((axis) => axis.key === "color")?.values ?? [];

  return (
    <article className={styles.card}>
      <div className={styles.imageWrap}>
        <Link className={styles.imageLink} href={`/product/${product.slug}`}>
          <Image
            src={product.image.path}
            alt={product.image.alt}
            fill
            priority={priority}
            sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw"
            className={styles.image}
          />
          <span className={styles.collection}>
            {category?.englishLabel ?? "LIGNÉE"} · {collection?.name ?? "Estate Edit"}
          </span>
        </Link>
        <button
          className={styles.wishlist}
          type="button"
          disabled={!hydrated}
          aria-pressed={wishlisted}
          aria-label={wishlisted ? `從收藏移除 ${product.name}` : `收藏 ${product.name}`}
          onClick={() => toggleWishlist(product.id)}
        >
          <span aria-hidden="true">{wishlisted ? "♥" : "♡"}</span>
        </button>
      </div>
      <div className={styles.meta}>
        <div>
          <Link href={`/product/${product.slug}`}>
            <h3>{product.name}</h3>
          </Link>
          <p>{product.subtitle}</p>
          {colorOptions.length > 0 ? (
            <p className={styles.colorHints}>
              <span>Colours · </span>
              {colorOptions.map(({ value, label }, index) => (
                <span key={value}>
                  {index > 0 ? " / " : ""}{label}
                </span>
              ))}
            </p>
          ) : null}
        </div>
        <p className={styles.price}>{price}</p>
      </div>
    </article>
  );
}
