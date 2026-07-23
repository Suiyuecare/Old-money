import Link from "next/link";
import { FocusedImage } from "@/components/site/FocusedImage";
import { products } from "@/lib/catalog";
import { estateCollections, estateJournalEntries, brandStory } from "@/lib/editorial";
import { ProductGrid } from "@/components/products/ProductGrid";
import styles from "./home.module.css";

export default function HomePage() {
  return (
    <>
      <section className={styles.hero} aria-labelledby="home-title">
        <FocusedImage
          src="/images/editorial/first-light-in-the-field.webp"
          alt="清晨薄霧中的英國莊園草地，一對當代成熟男女與獵犬同行"
          fill
          priority
          fetchPriority="high"
          loading="eager"
          quality={50}
          sizes="100vw"
          className={styles.heroImage}
        />
        <div className={styles.heroShade} />
        <div className={styles.heroContent}>
          <span className="eyebrow">The Lignée Estate · Chapter I</span>
          <h1 id="home-title" className="display-xl">Made to<br />Be Inherited.</h1>
          <p>為當代生活而作，讓衣著與物件在時間裡留下自己的光澤。</p>
          <Link className="button-secondary" href="/shop">探索首發系列</Link>
        </div>
        <p className={styles.heroNote}>06:40 — First light across the grounds</p>
      </section>

      <section className={`${styles.statement} shell section`}>
        <span className="eyebrow">A House of Contemporary Rituals</span>
        <p className="display-lg">我們不販售一段出身。<br />我們選擇，什麼值得留下。</p>
        <div className={styles.statementCopy}>
          <p>{brandStory.lead}</p>
          <Link className="text-link" href="/story">進入品牌故事</Link>
        </div>
      </section>

      <section className={`${styles.featured} section`}>
        <div className="shell">
          <div className={styles.sectionHeading}>
            <div>
              <span className="eyebrow">The First Edit</span>
              <h2>值得反覆使用的日常</h2>
            </div>
            <Link className="text-link" href="/shop">瀏覽全部 27 件</Link>
          </div>
          <ProductGrid products={products.slice(0, 6)} />
        </div>
      </section>

      <section className={styles.stewardship} aria-labelledby="stewardship-title">
        <div className={styles.stewardshipVisual}>
          <FocusedImage
            src="/images/products/estate-ledger-notebook.webp"
            alt="深棕色筆記本與書寫工具置於藏書室木桌上的概念商品照"
            fill
            sizes="(max-width: 800px) 100vw, 50vw"
          />
        </div>
        <div className={styles.stewardshipCopy}>
          <span className="eyebrow">Material &amp; Stewardship</span>
          <h2 id="stewardship-title">讓使用，成為最後一道工序。</h2>
          <p>
            我們先從觸感、比例與可被照料的方式想像每一件物品。原型中的材質皆是開發方向，待供應與打樣確認；真正的價值，必須經得起日常反覆使用。
          </p>
          <dl>
            <div>
              <dt>01 · Keep</dt>
              <dd>選擇不急著被替換的輪廓與用途。</dd>
            </div>
            <div>
              <dt>02 · Care</dt>
              <dd>以清潔、收納與修整，讓使用痕跡成為物件的一部分。</dd>
            </div>
            <div>
              <dt>03 · Pass on</dt>
              <dd>在材質與規格完成驗證後，才談得上值得被留下。</dd>
            </div>
          </dl>
          <Link className="text-link" href="/shipping-returns">閱讀概念服務與照護說明</Link>
        </div>
      </section>

      <section className={styles.chapters} aria-labelledby="chapters-title">
        <div className={`${styles.sectionHeading} shell`}>
          <div>
            <span className="eyebrow">One Estate, Four Moments</span>
            <h2 id="chapters-title">莊園的一天</h2>
          </div>
          <Link className="text-link" href="/collections">閱讀所有篇章</Link>
        </div>
        <div className={styles.chapterGrid}>
          {estateCollections.map((collection, index) => (
            <Link className={styles.chapter} href={collection.href} key={collection.id}>
              <FocusedImage
                src={collection.image}
                alt={collection.imageAlt}
                fill
                sizes="(max-width: 800px) 100vw, 50vw"
              />
              <div className={styles.chapterShade} />
              <span className={styles.chapterIndex}>0{index + 1}</span>
              <div>
                <span>{collection.moment}</span>
                <h3>{collection.title}</h3>
                <p>{collection.titleZh}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className={`${styles.journal} shell section`}>
        <div className={styles.sectionHeading}>
          <div>
            <span className="eyebrow">Estate Journal</span>
            <h2>寫給緩慢生活的筆記</h2>
          </div>
          <Link className="text-link" href="/journal">前往 Journal</Link>
        </div>
        <div className={styles.journalGrid}>
          {estateJournalEntries.map((entry) => (
            <article key={entry.id}>
              <Link className={styles.journalImage} href={entry.href}>
                <FocusedImage src={entry.image} alt={entry.imageAlt} fill sizes="(max-width: 800px) 100vw, 25vw" />
              </Link>
              <span>{entry.readingTime}</span>
              <h3><Link href={entry.href}>{entry.title}</Link></h3>
              <p>{entry.titleZh}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.service}>
        <div className="shell">
          <span className="eyebrow">Private Appointment</span>
          <h2>讓選擇保有餘裕</h2>
          <p>預約一場私人選品或送禮諮詢。我們從使用情境開始，而不是從數量開始。</p>
          <Link className="button-secondary" href="/private-appointment">預約示範諮詢</Link>
        </div>
      </section>
    </>
  );
}
