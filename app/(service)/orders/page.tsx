import type { Metadata } from "next";
import Link from "next/link";

import { OrderAccessRequestForm } from "./OrderAccessRequestForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "安全訂單查詢",
  description: "以短效安全連結查詢 LIGNÉE 訂單。",
  robots: { index: false, follow: false },
};

export default async function OrdersPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly state?: string }>;
}) {
  const { state } = await searchParams;
  const paymentConfirming = state === "payment-confirming";
  return (
    <section className="shell section" aria-labelledby="orders-title">
      <span className="eyebrow">Private order access</span>
      <h1 className="display-lg" id="orders-title">安全訂單查詢</h1>
      {paymentConfirming ? (
        <div className="notice-card" role="status">
          <strong>付款狀態確認中</strong>
          <p>
            瀏覽器返回資料不代表付款成功。請稍後透過安全訂單連結查詢；本頁不會依返回欄位改變訂單狀態。
          </p>
        </div>
      ) : null}
      <p className="lede">
        訂單號與 Email 不足以讀取訂單。正式服務只會透過短效、單次安全連結建立限單一訂單的 HttpOnly 工作階段。
      </p>
      <OrderAccessRequestForm />
      <Link className="text-link" href="/shipping-returns">閱讀配送與 14 日退貨草案</Link>
    </section>
  );
}
