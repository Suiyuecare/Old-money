import type { Metadata } from "next";
import Link from "next/link";
import { FocusedImage } from "@/components/site/FocusedImage";
import { createCatalogSnapshotIndex } from "@/lib/catalog-runtime";
import { getCatalogSnapshot } from "@/lib/commerce/container";
import { estateCollections } from "@/lib/editorial";
import styles from "@/app/editorial-pages.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const snapshot = await getCatalogSnapshot();
  return {
    title: "莊園篇章",
    description:
      `閱讀 The Lignée Estate 的 ${snapshot.chapters.length} 個當代生活篇章。`,
  };
}

export default async function CollectionsPage() {
  const snapshot = await getCatalogSnapshot();
  const catalog = createCatalogSnapshotIndex(snapshot);
  const chapters = snapshot.chapters
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .map((chapter) => {
      const editorial = estateCollections.find(
        (candidate) => candidate.id === chapter.code,
      );
      const firstProduct = catalog.selectProducts({
        collectionId: chapter.code,
      })[0];
      return {
        ...chapter,
        href: `/collections/${chapter.routeSegment}`,
        image: editorial?.image ?? firstProduct?.image.path,
        imageAlt:
          editorial?.imageAlt ??
          firstProduct?.image.alt ??
          `${chapter.titleZh}篇章`,
        moment: editorial?.moment ?? "The Lignée Estate",
        summary: editorial?.summary ?? chapter.description,
      };
    });

  return (
    <>
      <header className={`${styles.intro} shell`}>
        <div>
          <span className="eyebrow">One Estate, Many Moments</span>
          <h1>莊園的一天</h1>
        </div>
        <div className={styles.introCopy}>
          <p>
            從草地仍帶露水的清晨，到球場午後與燭光晚餐。{chapters.length} 個篇章為當代生活保留不同節奏。
          </p>
        </div>
      </header>

      <section className={styles.chapterList} aria-label="莊園篇章列表">
        {chapters.map((chapter, index) => (
          <article className={styles.chapterRow} key={chapter.code}>
            <Link
              className={styles.chapterVisual}
              href={chapter.href}
              aria-label={`閱讀 ${chapter.titleZh}：${chapter.titleEn}`}
            >
              {chapter.image ? (
                <FocusedImage
                  src={chapter.image}
                  alt={chapter.imageAlt}
                  fill
                  priority={index === 0}
                  sizes="(max-width: 900px) 100vw, 58vw"
                />
              ) : null}
            </Link>
            <div className={styles.chapterCopy}>
              <span className={styles.chapterIndex}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <span className="eyebrow">{chapter.moment}</span>
                <h2>
                  <Link href={chapter.href}>{chapter.titleEn}</Link>
                </h2>
                <p>{chapter.titleZh} — {chapter.summary}</p>
              </div>
              <div className={styles.chapterMeta}>
                <span>Estate Chapter {String(index + 1).padStart(2, "0")}</span>
                <br />
                <Link className="text-link" href={chapter.href}>
                  進入篇章
                </Link>
              </div>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
