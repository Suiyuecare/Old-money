import { redirect } from "next/navigation";

import { AdminEmpty, AdminPageHeader, OrdersTable } from "@/components/admin/AdminUi";
import { getAdminPageIdentity } from "@/lib/admin/auth";
import { getAdminRepository } from "@/lib/admin/repository";

export const metadata = { title: "所有訂單" };

export default async function AdminOrdersPage() {
  if (!await getAdminPageIdentity(["owner", "fulfillment", "support"])) {
    redirect("/admin");
  }
  const orders = await getAdminRepository().listOrders();
  return (
    <div className="admin-main">
      <AdminPageHeader
        eyebrow="Guest Orders"
        title="所有訂單"
        description="集中查看付款、理貨、出貨、退貨與退款投影；顧客 Email 在列表中預設遮罩。"
      />
      {orders.length ? <OrdersTable orders={orders} /> : <AdminEmpty title="目前沒有訂單" description="新訂單通過驗簽並持久化後，會顯示在這裡。" />}
    </div>
  );
}
