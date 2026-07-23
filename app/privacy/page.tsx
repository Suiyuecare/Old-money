import type { Metadata } from "next";
import styles from "@/app/editorial-pages.module.css";

export const metadata: Metadata = {
  title: "隱私條款",
  description: "LIGNÉE 概念預覽如何處理購物袋、收藏與展示表單資料。",
};

const sections = [
  { id: "scope", label: "適用範圍" },
  { id: "forms", label: "展示表單" },
  { id: "browser", label: "瀏覽器儲存" },
  { id: "infrastructure", label: "技術服務" },
  { id: "future", label: "正式營運" },
];

export default function PrivacyPage() {
  return (
    <>
      <header className={styles.policyIntro}>
        <div className="shell">
          <span className="eyebrow">Prototype Privacy</span>
          <h1>隱私條款</h1>
          <p>
            本頁只說明 LIGNÉE 概念原型目前的資料邊界。它不是未來正式商店的完整隱私政策，也不應被用來提交真實個人資料。
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
          <section className={styles.policySection} id="scope">
            <h2>適用範圍</h2>
            <p>
              LIGNÉE 目前是一個無法交易的高擬真概念網站。原型不建立會員帳戶、不處理付款、不建立真實訂單，也未串接行銷分析、客服、電子報寄送或預約系統。
            </p>
            <p>請只使用頁面預填的虛構資料，例如以 <code>.invalid</code> 結尾的示範信箱。</p>
          </section>

          <section className={styles.policySection} id="forms">
            <h2>展示表單不會送出資料</h2>
            <p>
              電子報、私人預約與結帳表單會在你的瀏覽器中阻止一般提交。欄位值只存在目前頁面的 React 記憶體，不寫入網址、localStorage、cookie 或訂單系統；重新整理頁面後即清除。
            </p>
            <p>
              表單的成功畫面只是一種本地互動狀態，不代表有人收到訊息、建立預約、完成訂閱或接受訂單。
            </p>
          </section>

          <section className={styles.policySection} id="browser">
            <h2>購物袋與收藏</h2>
            <p>為了讓展示流程能跨頁延續，瀏覽器可能在你的裝置上保存：</p>
            <ul>
              <li>購物袋中的概念 SKU 識別碼與數量。</li>
              <li>收藏商品的概念商品識別碼。</li>
            </ul>
            <p>
              這些資料不包含姓名、地址、電話、信箱或付款內容，價格與商品資訊每次均從網站的本地目錄重新取得。你可透過瀏覽器網站資料設定清除它們。
            </p>
          </section>

          <section className={styles.policySection} id="infrastructure">
            <h2>技術服務與例行紀錄</h2>
            <p>
              網站主機與網路基礎設施在提供頁面時，可能依各自的服務條款處理必要的連線資訊與例行技術紀錄，例如 IP 位址、請求時間與錯誤狀態。LIGNÉE 原型不把展示表單欄位加入這些請求，也不將其作為顧客名單使用。
            </p>
          </section>

          <section className={styles.policySection} id="future">
            <h2>正式營運以前</h2>
            <p>
              若未來加入真實購物、付款、配送、帳戶、電子報或預約服務，LIGNÉE 將在啟用前公布新的隱私政策，說明資料控制者、處理目的、法源、保存期間、合作服務、跨境傳輸、安全措施與聯絡／權利行使方式。
            </p>
            <p>目前原型沒有可受理隱私請求的正式客服管道，請勿在任何展示欄位留下真實資料。</p>
          </section>
        </div>
      </div>
    </>
  );
}
