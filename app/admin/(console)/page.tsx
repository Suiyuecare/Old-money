import Link from "next/link";

import {
  AdminMetric,
  AdminPageHeader,
  AdminStatus,
  OrdersTable,
  formatAdminDate,
  formatTwd,
} from "@/components/admin/AdminUi";
import { getAdminPageIdentity } from "@/lib/admin/auth";
import { getAdminRepository } from "@/lib/admin/repository";
import { redirect } from "next/navigation";

export const metadata = { title: "營運儀表板" };

export default async function AdminDashboardPage() {
  const identity = await getAdminPageIdentity([
    "owner",
    "merchandiser",
    "fulfillment",
    "support",
  ]);
  if (!identity) {
    redirect("/admin/sign-in");
  }
  const dashboard = await getAdminRepository().getDashboard();
  const canSeeCatalog =
    identity.role === "owner" || identity.role === "merchandiser";
  const canSeeInventory =
    identity.role === "owner" || identity.role === "fulfillment";
  const canSeeOrders =
    identity.role === "owner"
    || identity.role === "fulfillment"
    || identity.role === "support";
  const canSeeRevenue = identity.role === "owner";

  return (
    <div className="admin-main">
      <AdminPageHeader
        eyebrow="Estate Operations"
        title="營運儀表板"
        description="掌握商品發布、庫存、訂單與上市準備；正式交易開關仍保持關閉。"
        action={canSeeCatalog
          ? { href: "/admin/products/new", label: "新增商品" }
          : undefined}
      />
      <section className="admin-metrics" aria-label="營運摘要">
        {canSeeCatalog ? (
          <>
            <AdminMetric label="全部商品" value={String(dashboard.productCount)} detail={`${dashboard.publishedProductCount} 件已發布`} />
            <AdminMetric label="待完成商品" value={String(dashboard.draftProductCount)} detail={`${dashboard.pendingReadinessCount} 項 readiness 未完成`} />
          </>
        ) : null}
        {canSeeInventory ? (
          <AdminMetric label="低庫存 SKU" value={String(dashboard.lowStockSkuCount)} detail="可售數量小於或等於 1" />
        ) : null}
        {canSeeOrders ? (
          <AdminMetric label="進行中訂單" value={String(dashboard.openOrderCount)} detail={`${dashboard.orderCount} 張訂單可查詢`} />
        ) : null}
        {canSeeRevenue ? (
          <AdminMetric label="Sandbox 營收" value={formatTwd(dashboard.revenueTwd)} detail="僅 Owner 可見" />
        ) : null}
      </section>
      <div className="admin-panels">
        {canSeeOrders ? (
          <section className="admin-panel" aria-labelledby="recent-orders-title">
            <header className="admin-panel__header">
              <h2 id="recent-orders-title">近期訂單</h2>
              <Link href="/admin/orders">查看全部</Link>
            </header>
            <OrdersTable compact orders={dashboard.recentOrders} />
          </section>
        ) : null}
        {canSeeCatalog ? (
          <section className="admin-panel" aria-labelledby="recent-products-title">
            <header className="admin-panel__header">
              <h2 id="recent-products-title">近期商品</h2>
              <Link href="/admin/products">商品目錄</Link>
            </header>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th scope="col">商品</th><th scope="col">狀態</th><th scope="col">更新</th></tr></thead>
                <tbody>
                  {dashboard.recentProducts.map((product) => (
                    <tr key={product.id}>
                      <th scope="row"><Link href={`/admin/products/${product.id}`}>{product.subtitle}<small>{product.productCode}</small></Link></th>
                      <td><AdminStatus value={product.status} /></td>
                      <td>{formatAdminDate(product.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
