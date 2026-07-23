import type { Metadata } from "next";
import styles from "@/app/editorial-pages.module.css";

export const metadata: Metadata = {
  title: "使用條款",
  description: "LIGNÉE 非交易概念預覽的使用範圍、內容邊界與重要告知。",
};

const sections = [
  { id: "prototype", label: "原型性質" },
  { id: "commerce", label: "沒有真實交易" },
  { id: "content", label: "故事與商品內容" },
  { id: "conduct", label: "使用方式" },
  { id: "changes", label: "變更與正式條款" },
];

export default function TermsPage() {
  return (
    <>
      <header className={styles.policyIntro}>
        <div className="shell">
          <span className="eyebrow">Terms of the Preview</span>
          <h1>使用條款</h1>
          <p>
            這份說明界定目前網站能做與不能做的事。它服務於設計驗證，不代表 LIGNÉE 已開始接受訂單或提供正式商品服務。
          </p>
        </div>
      </header>

      <div className={`${styles.policyLayout} shell section`}>
        <nav className={styles.policyNav} aria-label="本頁段落">
          <p>On this page</p>
          <ul>
            {sections.map((section) => (
              <li key={section.id}><a href={`#${section.id}`}>{section.label}</a></li>
            ))}
          </ul>
        </nav>

        <div className={styles.policyBody}>
          <section className={styles.policySection} id="prototype">
            <h2>一個可互動的設計原型</h2>
            <p>
              本站呈現 LIGNÉE 的品牌方向、商品概念、編輯內容與模擬購物流程。所有頁面都應與頁首的概念展示告知一併閱讀。網站可能隨測試結果調整、暫停或移除內容。
            </p>
          </section>

          <section className={styles.policySection} id="commerce">
            <h2>沒有真實交易或承諾</h2>
            <ul>
              <li>加入購物袋、填寫結帳與看到完成頁，都不構成訂單、付款或買賣契約。</li>
              <li>本站不收集卡號、不啟用 Apple Pay，也不保留姓名、地址或聯絡資料。</li>
              <li>展示價格、規格、庫存狀態、配送與退貨條件均可能在正式營運前變更。</li>
              <li>請勿依據完成畫面等待出貨、寄送款項或提供任何真實個人資料。</li>
            </ul>
          </section>

          <section className={styles.policySection} id="content">
            <h2>故事與商品事實的界線</h2>
            <p>
              The Lignée Estate 是品牌原創的虛構世界，不代表真實英國莊園、家族譜系、爵位或企業沿革。人物保持匿名，故事用來建立當代生活的情境，不用來主張可查證的歷史來源。
            </p>
            <p>
              商品名稱、影像、價格與概念材質是設計原型。產地、纖維成分、皮革來源、機芯、製程、認證、尺寸、保固與量產外觀皆須在供應鏈確認後，才可成為正式銷售聲明。
            </p>
          </section>

          <section className={styles.policySection} id="conduct">
            <h2>使用本預覽</h2>
            <p>你可以為個人評估與設計回饋瀏覽原型。請不要：</p>
            <ul>
              <li>在展示欄位輸入自己或他人的真實個人資料。</li>
              <li>嘗試把介面完成狀態描述為已成立的真實訂單或預約。</li>
              <li>未經授權大量擷取、重新販售或冒用網站的品牌與內容。</li>
              <li>以干擾網站、其他訪客或基礎設施的方式使用服務。</li>
            </ul>
          </section>

          <section className={styles.policySection} id="changes">
            <h2>正式上線會有新的條款</h2>
            <p>
              真實商務功能啟用前，LIGNÉE 會依實際公司資訊、商品、支付、物流、客服與適用法規制定正式條款與法定揭露。屆時的文件將取代這份原型說明，並標示生效日期與正式聯絡方式。
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
