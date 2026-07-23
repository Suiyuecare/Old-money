import type { Metadata } from "next";

import { CheckoutCompleteClient } from "./CheckoutCompleteClient";

export const metadata: Metadata = {
  title: "模擬結帳結果",
  description: "LIGNÉE 結帳原型結果頁；不代表真實訂單或付款。",
};

export default function CheckoutCompletePage() {
  return <CheckoutCompleteClient />;
}
