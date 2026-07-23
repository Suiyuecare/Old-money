import type { Metadata } from "next";
import Link from "next/link";
import { FocusedImage } from "@/components/site/FocusedImage";
import { estateCollections } from "@/lib/editorial";
import styles from "@/app/editorial-pages.module.css";

export const metadata: Metadata = {
  title: "莊園篇章",
  description:
    "沿著田野初光、午後溫室、雨後藏書室與長桌晚宴，閱讀 The Lignée Estate 的四個當代生活篇章。",
};

export default function CollectionsPage() {
  return (
    <>
      <header className={`${styles.intro} shell`}>
        <div>
          <span className="eyebrow">One Estate, Four Moments</span>
          <h1>莊園的一天</h1>
        </div>
        <div className={styles.introCopy}>
          <p>
            從草地仍帶露水的清晨，到燭光緩慢落下的晚餐。四個篇章不是對舊時代的重演，而是為當代生活保留的四種節奏。
          </p>
        </div>
      </header>

      <section className={styles.chapterList} aria-label="莊園篇章列表">
        {estateCollections.map((collection, index) => (
          <article className={styles.chapterRow} key={collection.id}>
            <Link
              className={styles.chapterVisual}
              href={collection.href}
              aria-label={`閱讀 ${collection.titleZh}：${collection.title}`}
            >
              <FocusedImage
                src={collection.image}
                alt={collection.imageAlt}
                fill
                priority={index === 0}
                sizes="(max-width: 900px) 100vw, 58vw"
              />
            </Link>
            <div className={styles.chapterCopy}>
              <span className={styles.chapterIndex}>0{index + 1}</span>
              <div>
                <span className="eyebrow">{collection.moment}</span>
                <h2>
                  <Link href={collection.href}>{collection.title}</Link>
                </h2>
                <p>{collection.titleZh} — {collection.summary}</p>
              </div>
              <div className={styles.chapterMeta}>
                <span>Estate Chapter 0{index + 1}</span>
                <br />
                <Link className="text-link" href={collection.href}>
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
