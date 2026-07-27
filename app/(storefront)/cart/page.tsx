import type { Metadata } from "next";

import { CartPageClient } from "./CartPageClient";

export const metadata: Metadata = {
  title: "購物袋",
  description: "檢視 LIGNÉE 概念購物袋中的商品與規格。此頁不提供真實交易。",
};

export default function CartPage() {
  return <CartPageClient />;
}
