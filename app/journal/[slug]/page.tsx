import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductGrid } from "@/components/products/ProductGrid";
import { FocusedImage } from "@/components/site/FocusedImage";
import { getProductsByCollection } from "@/lib/catalog";
import {
  estateCollections,
  estateJournalEntries,
  getEstateJournalEntry,
} from "@/lib/editorial";
import styles from "@/app/editorial-pages.module.css";

type JournalArticleProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return estateJournalEntries.map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata({
  params,
}: JournalArticleProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = getEstateJournalEntry(slug);

  if (!entry) return { title: "找不到文章" };

  const socialDescription = `${entry.excerpt} LIGNÉE 概念展示，不提供真實交易。`;

  return {
    title: `${entry.titleZh}｜Estate Journal`,
    description: socialDescription,
    openGraph: {
      type: "article",
      locale: "zh_TW",
      siteName: "LIGNÉE",
      title: `${entry.title}｜LIGNÉE Estate Journal`,
      description: socialDescription,
      images: [{ url: entry.image, alt: entry.imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${entry.title}｜LIGNÉE Estate Journal`,
      description: socialDescription,
      images: [entry.image],
    },
  };
}

export default async function JournalArticlePage({ params }: JournalArticleProps) {
  const { slug } = await params;
  const entry = getEstateJournalEntry(slug);
  if (!entry) notFound();

  const collection = estateCollections.find(
    (item) => item.id === entry.collectionId,
  );
  const relatedProducts = getProductsByCollection(entry.collectionId).slice(0, 3);

  return (
    <article>
      <header className={styles.articleHeader}>
        <div className={styles.articleTitle}>
          <span className="eyebrow">Estate Journal</span>
          <h1>{entry.title}</h1>
          <p className={styles.articleMeta}>
            {entry.titleZh} · {entry.readingTime}
          </p>
        </div>
        <div className={styles.articleImage}>
          <FocusedImage
            src={entry.image}
            alt={entry.imageAlt}
            fill
            priority
            sizes="(max-width: 900px) 100vw, 55vw"
          />
        </div>
      </header>

      <div className={styles.articleBody}>
        <p className={styles.articleDek}>{entry.excerpt}</p>
        <div className={styles.articleProse}>
          {entry.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </div>

      <footer className={styles.articleFooter}>
        <div className="shell">
          {collection ? (
            <div className={styles.sectionHeading}>
              <div>
                <span className="eyebrow">From This Chapter</span>
                <h2>延續 {collection.titleZh} 的日常</h2>
              </div>
              <Link className="text-link" href={collection.href}>
                閱讀完整篇章
              </Link>
            </div>
          ) : null}
          <ProductGrid products={relatedProducts} />
        </div>
      </footer>
    </article>
  );
}
