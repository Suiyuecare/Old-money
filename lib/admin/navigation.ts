import type { AdminRole } from "./types";

export interface AdminNavItem {
  readonly href: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly roles: readonly AdminRole[];
}

export interface AdminNavGroup {
  readonly label: string;
  readonly items: readonly AdminNavItem[];
}

const allRoles: readonly AdminRole[] = ["owner", "merchandiser", "fulfillment", "support"];

export const adminNavigation: readonly AdminNavGroup[] = [
  {
    label: "總覽",
    items: [
      { href: "/admin", label: "營運儀表板", shortLabel: "儀表板", roles: allRoles },
    ],
  },
  {
    label: "商品",
    items: [
      { href: "/admin/products", label: "商品目錄", shortLabel: "商品", roles: ["owner", "merchandiser"] },
      { href: "/admin/categories", label: "分類與篇章", shortLabel: "分類", roles: ["owner", "merchandiser"] },
      { href: "/admin/inventory", label: "庫存 movement", shortLabel: "庫存", roles: ["owner", "fulfillment"] },
    ],
  },
  {
    label: "訂單",
    items: [
      { href: "/admin/orders", label: "所有訂單", shortLabel: "訂單", roles: ["owner", "fulfillment", "support"] },
      { href: "/admin/fulfillment", label: "揀貨與包裹", shortLabel: "理貨", roles: ["owner", "fulfillment"] },
      { href: "/admin/returns", label: "退貨驗收", shortLabel: "退貨", roles: ["owner", "fulfillment", "support"] },
      { href: "/admin/refunds", label: "退款作業", shortLabel: "退款", roles: ["owner", "support"] },
    ],
  },
  {
    label: "財務",
    items: [
      { href: "/admin/payments", label: "付款事件", shortLabel: "付款", roles: ["owner", "support"] },
      { href: "/admin/invoices", label: "電子發票", shortLabel: "發票", roles: ["owner", "support"] },
      { href: "/admin/reconciliation", label: "每日對帳", shortLabel: "對帳", roles: ["owner"] },
    ],
  },
  {
    label: "客戶",
    items: [
      { href: "/admin/support", label: "客服案件", shortLabel: "客服", roles: ["owner", "support"] },
      { href: "/admin/appointments", label: "私人預約", shortLabel: "預約", roles: ["owner", "support"] },
      { href: "/admin/newsletter", label: "Estate Letters／Consent", shortLabel: "電子報", roles: ["owner", "merchandiser", "support"] },
    ],
  },
  {
    label: "系統",
    items: [
      { href: "/admin/provider-events", label: "Provider Events", shortLabel: "事件", roles: ["owner", "support"] },
      { href: "/admin/dead-letters", label: "Dead Letters", shortLabel: "異常", roles: ["owner"] },
      { href: "/admin/staff", label: "人員與角色", shortLabel: "人員", roles: ["owner"] },
      { href: "/admin/audit", label: "Audit Log", shortLabel: "稽核", roles: ["owner"] },
      { href: "/admin/settings", label: "Runtime Controls", shortLabel: "設定", roles: ["owner"] },
    ],
  },
];

export const adminScreenCopy: Readonly<Record<string, {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly empty: string;
}>> = {
  categories: {
    eyebrow: "Catalog Architecture",
    title: "分類與篇章",
    description: "管理商品分類、男士／女士適用對象與 Estate 發布篇章。",
    empty: "尚未建立分類。",
  },
  fulfillment: {
    eyebrow: "Fulfillment",
    title: "揀貨與包裹",
    description: "依付款與庫存狀態建立揀貨工作，並追蹤每一個包裹。",
    empty: "目前沒有待理貨訂單。",
  },
  returns: {
    eyebrow: "Returns",
    title: "退貨驗收",
    description: "依 14 日退貨政策記錄申請、到貨與商品驗收結果。",
    empty: "目前沒有待處理退貨。",
  },
  refunds: {
    eyebrow: "Refunds",
    title: "退款作業",
    description: "追蹤退款申請與 Provider 結果；正式退款僅限 Owner。",
    empty: "目前沒有退款案件。",
  },
  payments: {
    eyebrow: "Payments",
    title: "付款事件",
    description: "檢視綠界 callback、驗簽結果及未知付款的查詢狀態。",
    empty: "目前沒有付款事件。",
  },
  invoices: {
    eyebrow: "Invoices",
    title: "電子發票",
    description: "追蹤 B2C 發票開立、作廢與折讓流程。",
    empty: "目前沒有發票作業。",
  },
  support: {
    eyebrow: "Client Services",
    title: "客服案件",
    description: "集中處理訂單、商品、配送、照護與退貨詢問。",
    empty: "目前沒有待回覆案件。",
  },
  appointments: {
    eyebrow: "Private Appointments",
    title: "私人預約",
    description: "管理高端客戶的私人鑑賞、量身與到店時段。",
    empty: "目前沒有預約。",
  },
  newsletter: {
    eyebrow: "Estate Letters",
    title: "電子報",
    description: "準備品牌內容與寄送排程；正式寄送前仍需 Owner 核准。",
    empty: "尚未建立電子報。",
  },
  "provider-events": {
    eyebrow: "Provider Inbox",
    title: "Provider Events",
    description: "檢視付款、發票、物流與 Email webhook 的持久化事件。",
    empty: "目前沒有 Provider event。",
  },
  "dead-letters": {
    eyebrow: "Recovery",
    title: "Dead Letters",
    description: "隔離超過重試預算的遠端操作，等待人工判讀與復原。",
    empty: "很好，目前沒有 dead letter。",
  },
  reconciliation: {
    eyebrow: "Reconciliation",
    title: "每日對帳",
    description: "比對訂單、付款、退款、發票與物流 Provider 的最終狀態。",
    empty: "尚未產生對帳批次。",
  },
  staff: {
    eyebrow: "Access Control",
    title: "人員與角色",
    description: "管理 Owner、Merchandiser、Fulfillment 與 Support membership。",
    empty: "尚未邀請後台人員。",
  },
  audit: {
    eyebrow: "Append-only",
    title: "Audit Log",
    description: "所有高風險動作只追加記錄，不允許修改或刪除。",
    empty: "尚無稽核事件。",
  },
  settings: {
    eyebrow: "Fail Closed",
    title: "Runtime Controls",
    description: "查看發布、收款與 Provider 開關；Production 預設全部關閉。",
    empty: "Runtime controls 尚未綁定。",
  },
};
