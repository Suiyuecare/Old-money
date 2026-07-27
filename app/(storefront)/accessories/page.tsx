import type { Metadata } from "next";
import { CatalogPage } from "@/components/catalog/CatalogPage";
import { createCatalogSnapshotIndex } from "@/lib/catalog-runtime";
import { getCatalogSnapshot } from "@/lib/commerce/container";

export const metadata: Metadata = {
  title: "配件",
  description: "皮件與隨身物件，為每日使用留下安靜而持久的質地。",
};

export default async function AccessoriesPage() {
  const catalog = createCatalogSnapshotIndex(
    await getCatalogSnapshot(),
  );

  return (
    <CatalogPage
      eyebrow="Objects carried well"
      title="配件"
      description="真正貼身的物件不必反覆表明身分；它們只在每日使用中，逐漸留下屬於持有者的時間。"
      products={catalog.selectProducts({ category: "accessories" })}
      heroCategory="accessories"
    />
  );
}
