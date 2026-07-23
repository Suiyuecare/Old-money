import type { Metadata } from "next";
import { CatalogPage } from "@/components/catalog/CatalogPage";
import { products } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "全部選品",
  description: "瀏覽 LIGNÉE 當代英倫莊園生活系列的完整概念選品。",
};

export default function ShopPage() {
  return (
    <CatalogPage
      eyebrow="The complete estate collection"
      title="全部選品"
      description="從田野衣著、溫室配件，到藏書室與長桌上的日常器物。二十七件首發作品，共同構成一座當代莊園的生活節奏。"
      products={products}
    />
  );
}
