import type { Metadata } from "next";
import Link from "next/link";
import { FocusedImage } from "@/components/site/FocusedImage";
import { brandStory } from "@/lib/editorial";
import styles from "@/app/editorial-pages.module.css";

export const metadata: Metadata = {
  title: "品牌故事",
  description:
    "走進 The Lignée Estate：一座為當代生活創作的虛構英倫莊園，以及 LIGNÉE 對時間、使用與傳承的想像。",
};

export default function StoryPage() {
  return (
    <>
      <header className={styles.storyHero}>
        <div className={styles.storyTitle}>
          <span className="eyebrow">{brandStory.eyebrow}</span>
          <h1>{brandStory.title}</h1>
          <p>{brandStory.lead}</p>
        </div>
        <div className={styles.storyImage}>
          <FocusedImage
            src="/images/editorial/dinner-at-the-long-table.webp"
            alt="當代英倫莊園的長桌晚餐，燭光映照正在交談的成熟賓客"
            fill
            priority
            sizes="(max-width: 900px) 100vw, 57vw"
          />
        </div>
      </header>

      <section className={`${styles.storyBody} shell section`}>
        <h2>Made to<br />Be Inherited.</h2>
        <div className={styles.storyProse}>
          {brandStory.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </section>

      <section className={`${styles.principles} section`} aria-labelledby="principles-title">
        <div className="shell">
          <div className={styles.sectionHeading}>
            <div>
              <span className="eyebrow">A House Philosophy</span>
              <h2 id="principles-title">留下來的，不只是物件</h2>
            </div>
          </div>
          <div className={styles.principleGrid}>
            {brandStory.principles.map((principle, index) => (
              <article className={styles.principle} key={principle.title}>
                <span>Principle 0{index + 1}</span>
                <h3>{principle.title}</h3>
                <p><strong>{principle.titleZh}</strong></p>
                <p>{principle.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="shell section--tight" aria-label="虛構世界觀說明">
        <p className={styles.notice}>{brandStory.fictionNotice}</p>
      </section>

      <section className="shell section">
        <article className={styles.feature}>
          <div className={styles.featureImage}>
            <FocusedImage
              src="/images/editorial/after-rain-the-library.webp"
              alt="雨後的莊園藏書室，木桌與書頁在窗邊柔光中保持安靜"
              fill
              sizes="(max-width: 680px) 100vw, 56vw"
            />
          </div>
          <div className={styles.featureCopy}>
            <span className="eyebrow">The Estate, in Chapters</span>
            <h2>從一天的節奏開始</h2>
            <p>田野、溫室、藏書室與長桌，構成 LIGNÉE 首發系列的四個生活章節。</p>
            <Link className="text-link" href="/collections">
              閱讀莊園篇章
            </Link>
          </div>
        </article>
      </section>
    </>
  );
}
