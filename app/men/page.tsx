import type { Metadata } from "next";
import { CatalogPage } from "@/components/catalog/CatalogPage";
import { getApparelByAudience } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "男士",
  description: "LIGNÉE 男士與共用的當代莊園服飾。",
};

const mensEdit = getApparelByAudience("men");

export default function MenPage() {
  return (
    <CatalogPage
      eyebrow="The field wardrobe"
      title="男士"
      description="為晨間田野與城市日程保留同一份從容。俐落領型、適度份量，以及可長久穿著的克制剪裁。"
      products={mensEdit}
    />
  );
}
