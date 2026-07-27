import Link from "next/link";

import type { AdminOrderProjection, AdminProductStatus, OperationalRow } from "@/lib/admin/types";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly action?: { readonly href: string; readonly label: string };
}) {
  return (
    <header className="admin-page-header">
      <div>
        <span className="admin-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <Link className="admin-button" href={action.href}>{action.label}</Link> : null}
    </header>
  );
}

const statusLabels: Readonly<Record<AdminProductStatus, string>> = {
  draft: "草稿",
  review: "審核中",
  ready: "待發布",
  published: "已發布",
  archived: "已封存",
};

export function AdminStatus({
  value,
  label,
}: {
  readonly value: string;
  readonly label?: string;
}) {
  return <span className="admin-status" data-status={value}>{label ?? statusLabels[value as AdminProductStatus] ?? value}</span>;
}

export function AdminMetric({
  label,
  value,
  detail,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}) {
  return (
    <article className="admin-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export function AdminEmpty({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="admin-empty" role="status">
      <span aria-hidden="true">◇</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

export function OperationalTable({ rows }: { readonly rows: readonly OperationalRow[] }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr><th scope="col">項目</th><th scope="col">說明</th><th scope="col">狀態</th><th scope="col">更新時間</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">{row.primary}</th>
              <td>{row.secondary}</td>
              <td><AdminStatus value={row.status} label={row.status} /></td>
              <td><time dateTime={row.updatedAt}>{formatAdminDate(row.updatedAt)}</time></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OrdersTable({
  orders,
  compact = false,
}: {
  readonly orders: readonly AdminOrderProjection[];
  readonly compact?: boolean;
}) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th scope="col">訂單</th>
            <th scope="col">顧客</th>
            <th scope="col">狀態</th>
            {!compact ? <th scope="col">理貨</th> : null}
            <th scope="col">金額</th>
            <th scope="col">建立時間</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <th scope="row"><Link href={`/admin/orders/${encodeURIComponent(order.id)}`}>{order.orderNumber}</Link></th>
              <td>{order.customerName}<small>{order.customerEmailMasked}</small></td>
              <td><AdminStatus value={order.status} label={orderStatusLabel(order.status)} /></td>
              {!compact ? <td>{fulfillmentLabel(order.fulfillmentStatus)}</td> : null}
              <td>{formatTwd(order.totalTwd)}</td>
              <td><time dateTime={order.createdAt}>{formatAdminDate(order.createdAt)}</time></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function formatTwd(value: number): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatAdminDate(value: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function orderStatusLabel(status: AdminOrderProjection["status"]): string {
  return {
    awaiting_payment: "待付款",
    paid: "已付款",
    processing: "處理中",
    shipped: "已出貨",
    delivered: "已送達",
    return_requested: "申請退貨",
    refunded: "已退款",
  }[status];
}

function fulfillmentLabel(status: AdminOrderProjection["fulfillmentStatus"]): string {
  return {
    unfulfilled: "未理貨",
    picking: "揀貨中",
    shipped: "已出貨",
    delivered: "已送達",
  }[status];
}
