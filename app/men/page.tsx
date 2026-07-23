import type { Metadata } from "next";
import { CatalogPage } from "@/components/catalog/CatalogPage";
import { products } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "男裝",
  description: "LIGNÉE 男士服飾與適合共用的當代莊園配件。",
};

const mensEdit = products.filter(
  (product) =>
    product.audience === "men" ||
    (product.audience === "unisex" &&
      (product.category === "apparel" || product.category === "accessories")),
);

export default function MenPage() {
  return (
    <CatalogPage
      eyebrow="The field wardrobe"
      title="男裝"
      description="為晨間田野與城市日程保留同一份從容。俐落領型、適度份量，搭配可長久使用的共用配件。"
      products={mensEdit}
    />
  );
}
