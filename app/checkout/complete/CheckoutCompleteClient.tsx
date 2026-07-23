"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import styles from "@/components/store/store-ui.module.css";
import { formatTwd } from "@/lib/catalog";
import { useCheckoutSession } from "../CheckoutSessionProvider";

export function CheckoutCompleteClient() {
  const checkout = useCheckoutSession();
  const [completion] = useState(() => checkout.completion);

  useEffect(() => {
    if (!completion) return;
    // Consume the ephemeral eligibility after this page captures it. A refresh,
    // direct URL visit, or later navigation cannot recreate a mock order.
    queueMicrotask(checkout.consumeCompletion);
  }, [checkout.consumeCompletion, completion]);

  if (!completion) {
    return (
      <section className={styles.invalidCompletePage}>
        <span className="eyebrow">No valid checkout session</span>
        <h1>沒有真實訂單</h1>
        <p>
          這個網址不能建立或找回訂單。只有在同一個分頁完成模擬流程時，才會暫時顯示完成狀態；重新整理後即失效。
        </p>
        <div className={styles.completeActions}>
          <Link className={styles.primaryLink} href="/shop">返回商店</Link>
          <Link className={styles.secondaryLink} href="/cart">查看購物袋</Link>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.completePage}>
      <div className={styles.completionMark} aria-hidden="true">L</div>
      <span className="eyebrow">A quiet conclusion</span>
      <h1>模擬結帳已完成</h1>
      <p>
        這段前端體驗已結束，購物袋已清空。沒有傳送個資、沒有扣款，也沒有建立真實訂單或訂單編號。
      </p>
      <dl className={styles.completionSummary}>
        <div><dt>概念商品</dt><dd>{completion.itemCount} 件</dd></div>
        <div><dt>概念小計</dt><dd>{formatTwd(completion.subtotalTwd)}</dd></div>
        <div><dt>配送示意</dt><dd>{completion.shippingTwd === 0 ? "免運" : formatTwd(completion.shippingTwd)}</dd></div>
        <div><dt>概念合計</dt><dd>{formatTwd(completion.totalTwd)}</dd></div>
      </dl>
      <div className={styles.completeActions}>
        <Link className={styles.primaryLink} href="/shop">繼續瀏覽莊園選品</Link>
        <Link className={styles.secondaryLink} href="/">返回首頁</Link>
      </div>
      <p className={styles.prototypeFinePrint}>離開或重新整理此頁後，本次暫存摘要即不再有效。</p>
    </section>
  );
}
