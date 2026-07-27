import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Care & Repair",
  description: "LIGNÉE 商品照護與售後評估草案。",
};

export default function CareRepairPage() {
  return (
    <section className="shell section" aria-labelledby="care-title">
      <span className="eyebrow">Care &amp; Repair</span>
      <h1 className="display-lg" id="care-title">讓照護延續使用</h1>
      <p className="lede">
        每件商品的正式照護方式將依最終材質、結構與供應商標示核准。V1 只提供售後評估 inquiry，不建立付費維修訂單。
      </p>
      <div className="notice-card">
        <strong>Launch gate</strong>
        <p>目前不承諾終身保固、永久耐用、免費維修或所有商品皆可修復。</p>
      </div>
    </section>
  );
}
