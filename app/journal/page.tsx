import type { Metadata } from "next";
import Link from "next/link";
import { FocusedImage } from "@/components/site/FocusedImage";
import { estateCollections, estateJournalEntries } from "@/lib/editorial";
import styles from "@/app/editorial-pages.module.css";

export const metadata: Metadata = {
  title: "Estate Journal",
  description:
    "LIGNÉE 關於季節衣著、書寫、款待與當代莊園生活的四篇安靜筆記。",
};

export default function JournalPage() {
  return (
    <>
      <header className={`${styles.intro} shell`}>
        <div>
          <span className="eyebrow">Estate Journal</span>
          <h1>寫給緩慢生活的筆記</h1>
        </div>
        <div className={styles.introCopy}>
          <p>
            關於晨間步行、溫室留白、雨後書寫與一張長桌。這些文字不教人複製某種出身，只記錄日常如何因為留心而變得長久。
          </p>
        </div>
      </header>

      <section className="shell section" aria-label="Estate Journal 文章">
        <div className={styles.journalGrid}>
          {estateJournalEntries.map((entry, index) => {
            const collection = estateCollections.find(
              (item) => item.id === entry.collectionId,
            );

            return (
              <article className={styles.journalCard} key={entry.id}>
                <Link
                  className={styles.journalCardImage}
                  href={entry.href}
                  aria-label={`閱讀 ${entry.titleZh}：${entry.title}`}
                >
                  <FocusedImage
                    src={entry.image}
                    alt={entry.imageAlt}
                    fill
                    priority={index < 2}
                    sizes="(max-width: 680px) 100vw, 50vw"
                  />
                </Link>
                <span className={styles.cardMeta}>
                  {collection?.titleZh ?? "Estate Journal"} · {entry.readingTime}
                </span>
                <h2>
                  <Link href={entry.href}>{entry.title}</Link>
                </h2>
                <p>{entry.titleZh} — {entry.excerpt}</p>
                <Link className="text-link" href={entry.href}>
                  閱讀文章
                </Link>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
