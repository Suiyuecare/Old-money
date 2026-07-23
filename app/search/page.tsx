import type { Metadata } from "next";
import { CatalogPage } from "@/components/catalog/CatalogPage";
import { products } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "搜尋選品",
  description: "搜尋 LIGNÉE 商品、系列與概念材質。",
};

export default function SearchPage() {
  return (
    <CatalogPage
      eyebrow="Search the estate"
      title="搜尋選品"
      description="以商品名稱、莊園篇章或概念材質，尋找一件適合此刻生活的物件。"
      products={products}
    />
  );
}
