import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "付款與電子發票",
  description: "LIGNÉE Sandbox 付款與電子發票說明。",
};

export default function PaymentPage() {
  return (
    <section className="shell section" aria-labelledby="payment-title">
      <span className="eyebrow">Payment &amp; e-Invoice</span>
      <h1 className="display-lg" id="payment-title">付款與電子發票草案</h1>
      <p className="lede">
        V1 規劃使用綠界 hosted redirect 的信用卡一次付清與經核准後的 Apple Pay。LIGNÉE 不接觸或保存卡號、有效期、安全碼或 Apple Pay token。
      </p>
      <div className="notice-card">
        <strong>Production disabled</strong>
        <p>金流、Apple Pay、B2C 電子發票商戶資格、字軌、載具矩陣與會計審核尚未完成，無法收款或開票。</p>
      </div>
    </section>
  );
}
