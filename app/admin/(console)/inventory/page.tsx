import { redirect } from "next/navigation";

import { InventoryAdjustmentForm } from "@/components/admin/AdminForms";
import { AdminEmpty, AdminPageHeader } from "@/components/admin/AdminUi";
import { getAdminPageIdentity } from "@/lib/admin/auth";
import { getAdminRepository } from "@/lib/admin/repository";

export const metadata = { title: "庫存 movement" };

export default async function AdminInventoryPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly q?: string }>;
}) {
  if (!await getAdminPageIdentity(["owner", "fulfillment"])) redirect("/admin");
  const { q = "" } = await searchParams;
  const inventory = await getAdminRepository().listInventory(q);
  return (
    <div className="admin-main">
      <AdminPageHeader
        eyebrow="Append-only Ledger"
        title="庫存 movement"
        description="庫存僅能以 movement 調整；不直接覆寫現貨數量，所有操作保留 actor 與 idempotency。"
      />
      <form className="admin-search" method="get" role="search">
        <label className="sr-only" htmlFor="admin-inventory-search">搜尋庫存</label>
        <input defaultValue={q} id="admin-inventory-search" name="q" placeholder="搜尋 SKU、商品或規格" />
        <button type="submit">搜尋</button>
      </form>
      {inventory.length ? <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th scope="col">SKU</th><th scope="col">商品／規格</th><th scope="col">現貨</th><th scope="col">預留</th><th scope="col">安全庫存</th><th scope="col">可售</th><th scope="col">記錄 movement</th></tr></thead>
          <tbody>
            {inventory.slice(0, q ? 80 : 30).map((item) => (
              <tr key={item.skuId}>
                <th scope="row">{item.skuCode}</th>
                <td>{item.productName}<small>{item.optionLabel}</small></td>
                <td>{item.onHand}</td>
                <td>{item.reserved}</td>
                <td>{item.safetyStock}</td>
                <td>{item.available}</td>
                <td><InventoryAdjustmentForm item={item} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div> : <AdminEmpty title="找不到 SKU" description="請調整搜尋條件；新商品須先建立規格後才會出現在庫存帳。" />}
      {!q && inventory.length > 30 ? <p className="admin-form-help">目前顯示前 30 筆；請使用搜尋找到指定 SKU。</p> : null}
    </div>
  );
}
