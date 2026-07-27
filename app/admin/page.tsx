import type { Metadata } from "next";

import { getCommerceEnvironment } from "@/lib/commerce/config";
import { canAccessAdmin } from "@/lib/commerce/readiness";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "營運後台",
  robots: { index: false, follow: false },
};

const surfaces = [
  "商品草稿與 50/50 發布檢查",
  "SKU、版本價格與庫存 movement",
  "訂單、理貨、物流與逐包裹取消",
  "退貨、退款、發票與付款異常",
  "Provider inbox、outbox、dead letter 與 reconciliation",
  "Email、客服、維修、預約與電子報",
  "管理員 membership、AAL2 與 append-only audit",
];

export default function AdminPage() {
  const environment = getCommerceEnvironment();
  const readiness = canAccessAdmin(environment, {
    authenticated: false,
    aal2: false,
    activeMembership: false,
  });
  return (
    <section className="shell section" aria-labelledby="admin-title">
      <span className="eyebrow">Operations · AAL2 required</span>
      <h1 className="display-lg" id="admin-title">LIGNÉE 營運後台</h1>
      <div className="notice-card" role="status">
        <strong>Production disabled</strong>
        <p>{readiness.code}：邀請制 Auth、兩位 Owner 與資料庫 membership 尚未配置。</p>
      </div>
      <ul className="service-list">
        {surfaces.map((surface) => <li key={surface}>{surface}</li>)}
      </ul>
    </section>
  );
}
