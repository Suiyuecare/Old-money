import { redirect } from "next/navigation";

import { ProductEditor } from "@/components/admin/AdminForms";
import { AdminPageHeader } from "@/components/admin/AdminUi";
import { getAdminPageIdentity } from "@/lib/admin/auth";
import { listAdminTaxonomy } from "@/lib/admin/taxonomy";

export const metadata = { title: "新增商品" };

export default async function AdminNewProductPage() {
  if (!await getAdminPageIdentity(["owner", "merchandiser"])) redirect("/admin");
  const [categories, chapters] = await Promise.all([
    listAdminTaxonomy("category"),
    listAdminTaxonomy("chapter"),
  ]);
  return (
    <div className="admin-main">
      <AdminPageHeader
        eyebrow="New Draft"
        title="新增商品"
        description="建立草稿後再補齊圖片、SKU、價格、庫存與發布檢查。"
      />
      <ProductEditor categories={categories} chapters={chapters} />
    </div>
  );
}
