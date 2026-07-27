import { notFound, redirect } from "next/navigation";

import { ProductEditor, ProductLifecycleActions } from "@/components/admin/AdminForms";
import {
  ProductMediaWorkbench,
  ProductReadinessChecklist,
  ProductVariantWorkbench,
} from "@/components/admin/AdminPublishingForms";
import { AdminPageHeader, AdminStatus } from "@/components/admin/AdminUi";
import { getAdminPageIdentity } from "@/lib/admin/auth";
import { getAdminRepository } from "@/lib/admin/repository";
import { listAdminTaxonomy } from "@/lib/admin/taxonomy";

export const metadata = { title: "商品編輯" };

export default async function AdminProductDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const identity = await getAdminPageIdentity(["owner", "merchandiser"]);
  if (!identity) redirect("/admin");
  const [product, categories, chapters] = await Promise.all([
    getAdminRepository().getProduct((await params).id),
    listAdminTaxonomy("category"),
    listAdminTaxonomy("chapter"),
  ]);
  if (!product) notFound();
  return (
    <div className="admin-main">
      <AdminPageHeader
        eyebrow={product.productCode}
        title={product.subtitle}
        description={`${product.name} · 版本 ${product.version}`}
      />
      <p><AdminStatus value={product.status} /> {product.publishedAt ? "此商品已有公開發布版本；下方編輯只影響草稿。" : "此商品尚未公開。"}</p>
      <ProductLifecycleActions canApprove={identity.role === "owner"} product={product} />
      <ProductEditor categories={categories} chapters={chapters} product={product} />
      <ProductVariantWorkbench canApprove={identity.role === "owner"} product={product} />
      <ProductMediaWorkbench product={product} role={identity.role} />
      <ProductReadinessChecklist canApprove={identity.role === "owner"} product={product} />
    </div>
  );
}
