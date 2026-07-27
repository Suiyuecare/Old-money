import { redirect } from "next/navigation";

import { AdminTaxonomyWorkbench } from "@/components/admin/AdminTaxonomyForms";
import { AdminReleaseBatchWorkbench } from "@/components/admin/AdminReleaseBatchForms";
import { AdminPageHeader } from "@/components/admin/AdminUi";
import { getAdminPageIdentity } from "@/lib/admin/auth";
import { listAdminTaxonomy } from "@/lib/admin/taxonomy";
import { getAdminRepository } from "@/lib/admin/repository";
import { listAdminReleaseBatches } from "@/lib/admin/release-batches";
import type { AdminReleaseBatch } from "@/lib/admin/release-batches";

export const metadata = { title: "分類與篇章" };

export default async function AdminCategoriesPage() {
  const identity = await getAdminPageIdentity(["owner", "merchandiser"]);
  if (!identity) redirect("/admin");
  const [categories, chapters, products] = await Promise.all([
    listAdminTaxonomy("category"),
    listAdminTaxonomy("chapter"),
    getAdminRepository().listProducts(),
  ]);
  let batches: readonly AdminReleaseBatch[] = [];
  let batchError: string | undefined;
  try {
    batches = [...await listAdminReleaseBatches()];
  } catch (error) {
    batchError = error instanceof Error
      ? error.message
      : "系列批次發布 RPC 尚未就緒；功能已保持 fail-closed。";
  }
  return (
    <div className="admin-main">
      <AdminPageHeader
        description="管理商品分類、男士／女士適用脈絡與 Estate 發布篇章。"
        eyebrow="Catalog Architecture"
        title="分類與篇章"
      />
      <AdminTaxonomyWorkbench
        canArchive={identity.role === "owner"}
        items={categories}
        kind="category"
        title="商品分類"
      />
      <AdminTaxonomyWorkbench
        canArchive={identity.role === "owner"}
        items={chapters}
        kind="chapter"
        title="Estate 篇章"
      />
      <AdminReleaseBatchWorkbench
        batches={batches}
        canPublish={identity.role === "owner"}
        chapters={chapters}
        products={products}
        unavailableMessage={batchError}
      />
    </div>
  );
}
