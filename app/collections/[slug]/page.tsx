import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductGrid } from "@/components/products/ProductGrid";
import { FocusedImage } from "@/components/site/FocusedImage";
import { getProductsByCollection } from "@/lib/catalog";
import {
  estateCollections,
  estateJournalEntries,
  getEstateCollection,
} from "@/lib/editorial";
import styles from "@/app/editorial-pages.module.css";

type CollectionPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return estateCollections.map((collection) => ({ slug: collection.slug }));
}

export async function generateMetadata({
  params,
}: CollectionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const collection = getEstateCollection(slug);

  if (!collection) return { title: "找不到篇章" };

  const socialDescription = `${collection.summary} LIGNÉE 概念展示，不提供真實交易。`;

  return {
    title: `${collection.titleZh}｜${collection.title}`,
    description: socialDescription,
    openGraph: {
      type: "website",
      locale: "zh_TW",
      siteName: "LIGNÉE",
      title: `${collection.title} — ${collection.titleZh}｜LIGNÉE`,
      description: socialDescription,
      images: [{ url: collection.image, alt: collection.imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${collection.title} — ${collection.titleZh}｜LIGNÉE`,
      description: socialDescription,
      images: [collection.image],
    },
  };
}

export default async function CollectionDetailPage({ params }: CollectionPageProps) {
  const { slug } = await params;
  const collection = getEstateCollection(slug);
  if (!collection) notFound();

  const products = getProductsByCollection(collection.id);
  const journal = estateJournalEntries.find(
    (entry) => entry.collectionId === collection.id,
  );

  return (
    <>
      <header className={styles.cinematicHero}>
        <FocusedImage
          src={collection.image}
          alt={collection.imageAlt}
          fill
          priority
          sizes="100vw"
        />
        <div className={styles.heroVeil} />
        <div className={`${styles.cinematicContent} shell`}>
          <span className="eyebrow">{collection.moment}</span>
          <h1>{collection.title}</h1>
          <p>{collection.titleZh} — {collection.summary}</p>
        </div>
      </header>

      <section className={`${styles.collectionNarrative} shell section`}>
        <aside aria-label="篇章資訊">
          <span className="eyebrow">The Estate, in Sequence</span>
          <p>{collection.moment}</p>
        </aside>
        <div className={styles.narrativeCopy}>
          {collection.description.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </section>

      <section className={`${styles.productSection} section`} aria-labelledby="collection-products">
        <div className="shell">
          <div className={styles.sectionHeading}>
            <div>
              <span className="eyebrow">The Chapter Edit</span>
              <h2 id="collection-products">本章選品</h2>
            </div>
            <Link className="text-link" href={`/shop?collection=${collection.id}`}>
              在商店中檢視
            </Link>
          </div>
          <ProductGrid products={products} prioritize={3} />
        </div>
      </section>

      {journal ? (
        <section className="shell section" aria-labelledby="collection-journal">
          <article className={styles.feature}>
            <Link className={styles.featureImage} href={journal.href}>
              <FocusedImage
                src={journal.image}
                alt={journal.imageAlt}
                fill
                sizes="(max-width: 680px) 100vw, 56vw"
              />
            </Link>
            <div className={styles.featureCopy}>
              <span className="eyebrow">Estate Journal · {journal.readingTime}</span>
              <h2 id="collection-journal">{journal.title}</h2>
              <p>{journal.titleZh} — {journal.excerpt}</p>
              <Link className="text-link" href={journal.href}>
                繼續閱讀
              </Link>
            </div>
          </article>
        </section>
      ) : null}
    </>
  );
}
