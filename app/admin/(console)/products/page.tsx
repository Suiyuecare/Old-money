import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminEmpty, AdminPageHeader, AdminStatus, formatAdminDate, formatTwd } from "@/components/admin/AdminUi";
import { getAdminPageIdentity } from "@/lib/admin/auth";
import { getAdminRepository } from "@/lib/admin/repository";

export const metadata = { title: "商品目錄" };

export default async function AdminProductsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly q?: string }>;
}) {
  if (!await getAdminPageIdentity(["owner", "merchandiser"])) redirect("/admin");
  const { q = "" } = await searchParams;
  const products = await getAdminRepository().listProducts(q);
  return (
    <div className="admin-main">
      <AdminPageHeader
        eyebrow="Catalog CMS"
        title="商品目錄"
        description="草稿與已發布版本彼此分離；商品發布後網址代稱將永久鎖定。"
        action={{ href: "/admin/products/new", label: "新增商品" }}
      />
      <form className="admin-search" method="get" role="search">
        <label className="sr-only" htmlFor="admin-product-search">搜尋商品</label>
        <input defaultValue={q} id="admin-product-search" name="q" placeholder="搜尋名稱、商品代碼或網址代稱" />
        <button type="submit">搜尋</button>
      </form>
      {products.length ? <div className="admin-table-wrap">
        <table className="admin-table admin-products-table">
          <thead><tr><th scope="col">商品</th><th scope="col">代碼</th><th scope="col">分類</th><th scope="col">狀態</th><th scope="col">售價</th><th scope="col">SKU</th><th scope="col">更新</th></tr></thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <th scope="row"><Link href={`/admin/products/${product.id}`}>{product.subtitle}<small>{product.name}</small></Link></th>
                <td>{product.productCode}</td>
                <td>{product.category} · {product.audience}</td>
                <td><AdminStatus value={product.status} /></td>
                <td>{formatTwd(product.basePriceTwd)}</td>
                <td>{product.skuCount}</td>
                <td><time dateTime={product.updatedAt}>{formatAdminDate(product.updatedAt)}</time></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div> : <AdminEmpty title="找不到商品" description="請調整搜尋條件，或建立一件新的商品草稿。" />}
    </div>
  );
}
