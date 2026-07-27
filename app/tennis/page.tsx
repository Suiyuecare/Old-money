import type { Metadata } from "next";

import { CatalogPage } from "@/components/catalog/CatalogPage";
import { getProductsByCategory } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "網球運動",
  description: "The Private Court：LIGNÉE 私人草地球場與會所生活的十件首發系列。",
  robots: { index: false, follow: false },
};

export default function TennisPage() {
  return (
    <CatalogPage
      eyebrow="The Private Court · 10 pieces"
      title="網球運動"
      description="為草地球場、會所露台與午後友誼賽保留活動餘裕。性能、材質與安全規格仍須完成正式驗證。"
      products={getProductsByCategory("tennis")}
      heroCategory="tennis"
    />
  );
}
