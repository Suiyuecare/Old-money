import type { Metadata } from "next";

import { CatalogPage } from "@/components/catalog/CatalogPage";
import { createCatalogSnapshotIndex } from "@/lib/catalog-runtime";
import { getCatalogSnapshot } from "@/lib/commerce/container";

export const metadata: Metadata = {
  title: "網球運動",
  description: "The Private Court：LIGNÉE 私人草地球場與會所生活的十件首發系列。",
};

export default async function TennisPage() {
  const catalog = createCatalogSnapshotIndex(
    await getCatalogSnapshot(),
  );
  const products = catalog.selectProducts({ category: "tennis" });

  return (
    <CatalogPage
      eyebrow={`The Private Court · ${products.length} pieces`}
      title="網球運動"
      description="為草地球場、會所露台與午後友誼賽保留活動餘裕。性能、材質與安全規格仍須完成正式驗證。"
      products={products}
      heroCategory="tennis"
    />
  );
}
