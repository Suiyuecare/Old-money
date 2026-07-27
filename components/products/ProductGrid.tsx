import type { PublishedProduct } from "@/lib/catalog-runtime";
import { ProductCard } from "./ProductCard";
import styles from "./products.module.css";

export function ProductGrid({ products, prioritize = 0 }: { products: readonly PublishedProduct[]; prioritize?: number }) {
  return (
    <div className={styles.grid}>
      {products.map((product, index) => (
        <ProductCard key={product.id} product={product} priority={index < prioritize} />
      ))}
    </div>
  );
}
