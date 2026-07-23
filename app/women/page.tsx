import type { Metadata } from "next";
import { CatalogPage } from "@/components/catalog/CatalogPage";
import { products } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "女裝",
  description: "LIGNÉE 女士服飾與適合共用的當代莊園配件。",
};

const womensEdit = products.filter(
  (product) =>
    product.audience === "women" ||
    (product.audience === "unisex" &&
      (product.category === "apparel" || product.category === "accessories")),
);

export default function WomenPage() {
  return (
    <CatalogPage
      eyebrow="The conservatory wardrobe"
      title="女裝"
      description="柔和輪廓不等於脆弱。從溫室午後到長桌晚餐，以克制剪裁與微光配件留下自己的步調。"
      products={womensEdit}
    />
  );
}
