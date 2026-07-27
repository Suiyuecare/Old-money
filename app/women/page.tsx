import type { Metadata } from "next";
import { CatalogPage } from "@/components/catalog/CatalogPage";
import { getApparelByAudience } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "女士",
  description: "LIGNÉE 女士與共用的當代莊園服飾。",
};

const womensEdit = getApparelByAudience("women");

export default function WomenPage() {
  return (
    <CatalogPage
      eyebrow="The conservatory wardrobe"
      title="女士"
      description="柔和輪廓不等於脆弱。從溫室午後到長桌晚餐，以克制剪裁與微光配件留下自己的步調。"
      products={womensEdit}
    />
  );
}
