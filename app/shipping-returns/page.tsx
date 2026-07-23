import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/app/editorial-pages.module.css";

export const metadata: Metadata = {
  title: "配送與退換貨",
  description: "LIGNÉE 概念預覽的配送、14 日退貨服務與商品照料政策草案。",
};

const sections = [
  { id: "preview", label: "原型說明" },
  { id: "shipping", label: "配送方式" },
  { id: "returns", label: "14 日退貨" },
  { id: "exceptions", label: "例外與瑕疵" },
  { id: "preparation", label: "退回準備" },
];

export default function ShippingReturnsPage() {
  return (
    <>
      <header className={styles.policyIntro}>
        <div className="shell">
          <span className="eyebrow">Client Care</span>
          <h1>配送與退換貨</h1>
          <p>
            一件物品值得被留下，也值得在做出決定以前被充分理解。以下為概念原型的服務政策草案，並非已啟用的交易服務。
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
          <section className={styles.policySection} id="preview">
            <h2>目前是概念展示</h2>
            <p>
              本站不收款、不建立訂單，也不安排真實出貨。頁面中的運費、門檻與退貨流程用來呈現預計的顧客體驗；正式營運前仍會依供應鏈、物流與專業法律審閱結果更新。
            </p>
          </section>

          <section className={styles.policySection} id="shipping">
            <h2>台灣配送</h2>
            <ul>
              <li>第一階段預計配送台灣本島與離島，國際配送尚未開放。</li>
              <li>單次商品小計滿 NT$12,000，預計提供免運服務。</li>
              <li>未達免運門檻時，展示運費為 NT$250。</li>
              <li>出貨時程、承運商與離島限制將在正式營運、庫存與物流合作確認後公布。</li>
            </ul>
            <p>購物袋與模擬結帳會依商品小計即時呈現上述運費規則，但不會建立配送委託。</p>
          </section>

          <section className={styles.policySection} id="returns">
            <h2>14 日品牌退貨服務</h2>
            <p>
              LIGNÉE 規劃提供到貨後 14 日內提出退貨申請的品牌服務。此較長的考慮期不會限制消費者依法享有的權利；正式適用範圍、起算方式與申請管道，將在真實銷售前完成專業審閱並清楚揭露。
            </p>
            <h3>預計可退回的狀態</h3>
            <ul>
              <li>商品保持未使用、未洗滌，並保留吊牌、配件與原包裝。</li>
              <li>鞋履、服飾與配件僅作室內合理試穿，不留下香氣、污漬或人為損傷。</li>
              <li>成套物件、贈品與包裝一併完整退回。</li>
            </ul>
          </section>

          <section className={styles.policySection} id="exceptions">
            <h2>例外與商品狀況</h2>
            <p>
              貼身絲襪、耳環等可能涉及個人衛生的商品，是否構成合理退貨例外，必須視商品封裝、告知方式與適用法規判斷；本原型不先行宣稱排除。正式上線前會由台灣法律專業人員審閱。
            </p>
            <p>
              若收到品項錯誤、運送損傷或與正式商品說明不符的物件，未來客服流程將與一般改變心意的退貨分開處理。概念展示目前不接受案件或上傳照片。
            </p>
          </section>

          <section className={styles.policySection} id="preparation">
            <h2>妥善準備退回物件</h2>
            <ol>
              <li>停止使用並保留所有隨附內容。</li>
              <li>以能避免擠壓、受潮與碰撞的方式重新包裝。</li>
              <li>正式服務啟用後，僅使用訂單頁公布的申請與退回管道。</li>
            </ol>
            <p>
              本站沒有真實訂單編號或客服收件地址。請勿寄送任何商品或個人資料。你可以返回 <Link className="text-link" href="/shop">概念商店</Link> 繼續體驗。
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
