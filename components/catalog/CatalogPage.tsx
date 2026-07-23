import { Suspense } from "react";
import type { Product } from "@/lib/catalog";
import { CatalogBrowser } from "./CatalogBrowser";
import styles from "./catalog.module.css";

interface CatalogPageProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly products: readonly Product[];
}

export function CatalogPage({ eyebrow, title, description, products }: CatalogPageProps) {
  return (
    <>
      <header className="page-intro">
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
