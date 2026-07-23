import type { Metadata } from "next";
import { CatalogPage } from "@/components/catalog/CatalogPage";
import { getProductsByCategory } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "居家生活",
  description: "從溫室、藏書室到長桌晚宴的 LIGNÉE 莊園生活器物。",
};

export default function HomeCollectionPage() {
  return (
    <CatalogPage
      eyebrow="The rooms we return to"
      title="居家生活"
      description="香氣、織物與餐桌器物讓屋內重新聚攏。為日常使用而準備，也願意陪伴一次次款待。"
      products={getProductsByCategory("home")}
    />
  );
}
