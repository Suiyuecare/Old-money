import type { Metadata } from "next";
import { CatalogPage } from "@/components/catalog/CatalogPage";
import { createCatalogSnapshotIndex } from "@/lib/catalog-runtime";
import { getCatalogSnapshot } from "@/lib/commerce/container";

export const metadata: Metadata = {
  title: "女士",
  description: "LIGNÉE 女士與共用的當代莊園服飾。",
};

export default async function WomenPage() {
  const catalog = createCatalogSnapshotIndex(
    await getCatalogSnapshot(),
  );
  const womensEdit = catalog.selectProducts({
    category: "apparel",
    audience: "women",
    includeUnisexForAudience: true,
  });

  return (
    <CatalogPage
      eyebrow="The conservatory wardrobe"
      title="女士"
      description="柔和輪廓不等於脆弱。從溫室午後到長桌晚餐，以克制剪裁與微光配件留下自己的步調。"
      products={womensEdit}
    />
  );
}
