import type { Metadata } from "next";
import { CatalogPage } from "@/components/catalog/CatalogPage";
import { getProductsByCategory } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "文具",
  description: "LIGNÉE 筆記、書寫與桌面整理概念選品。",
};

export default function StationeryPage() {
  return (
    <CatalogPage
      eyebrow="The writing desk"
      title="文具"
      description="讓紙張、書寫與收納成為安靜的儀式。不是為了填滿每一頁，而是替值得記住的事保留位置。"
      products={getProductsByCategory("stationery")}
    />
  );
}
