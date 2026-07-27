import type { Metadata } from "next";

import { CheckoutClient } from "./CheckoutClient";

export const metadata: Metadata = {
  title: "模擬結帳",
  description: "LIGNÉE 高擬真結帳預覽；不蒐集真實個資、不要求付款資料，也不會扣款。",
};

export default function CheckoutPage() {
  return <CheckoutClient />;
}
