import type { Metadata } from "next";
import { CatalogPage } from "@/components/catalog/CatalogPage";
import { createCatalogSnapshotIndex } from "@/lib/catalog-runtime";
import { getCatalogSnapshot } from "@/lib/commerce/container";

export const metadata: Metadata = {
  title: "男士",
  description: "LIGNÉE 男士與共用的當代莊園服飾。",
};

export default async function MenPage() {
  const catalog = createCatalogSnapshotIndex(
    await getCatalogSnapshot(),
  );
  const mensEdit = catalog.selectProducts({
    category: "apparel",
    audience: "men",
    includeUnisexForAudience: true,
  });

  return (
    <CatalogPage
      eyebrow="The field wardrobe"
      title="男士"
      description="為晨間田野與城市日程保留同一份從容。俐落領型、適度份量，以及可長久穿著的克制剪裁。"
      products={mensEdit}
    />
  );
}
