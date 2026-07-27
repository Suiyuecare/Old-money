import { Suspense } from "react";
import type { CategoryId } from "@/lib/catalog";
import type { PublishedProduct } from "@/lib/catalog-runtime";
import { CatalogBrowser } from "./CatalogBrowser";
import { CategoryHero } from "./CategoryHero";
import styles from "./catalog.module.css";

interface CatalogPageProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly products: readonly PublishedProduct[];
  readonly heroCategory?: CategoryId;
}

export function CatalogPage({
  eyebrow,
  title,
  description,
  products,
  heroCategory,
}: CatalogPageProps) {
  return (
    <>
      <header className={`${heroCategory ? styles.withHero : ""} page-intro`}>
        {heroCategory ? (
          <CategoryHero
            category={heroCategory}
            alt={`${title}系列的 LIGNÉE Sandbox 分類編輯影像，正式攝影待核准`}
          />
        ) : null}
        <div className="page-intro__inner">
          <span className="eyebrow">{eyebrow}</span>
          <h1 tabIndex={-1}>{title}</h1>
          <p className="lede">{description}</p>
        </div>
      </header>
      <Suspense
        fallback={
          <div className={`shell ${styles.loading}`} role="status">
            正在整理莊園選品…
          </div>
        }
      >
        <CatalogBrowser products={products} />
      </Suspense>
    </>
  );
}
