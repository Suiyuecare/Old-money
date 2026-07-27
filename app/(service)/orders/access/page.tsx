import type { Metadata } from "next";

import { OrderAccessClient } from "./OrderAccessClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "交換安全訂單連結",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function OrderAccessPage() {
  return (
    <section className="shell section" aria-labelledby="order-access-title">
      <span className="eyebrow">Secure exchange</span>
      <h1 className="display-lg" id="order-access-title">訂單安全連結</h1>
      <OrderAccessClient />
    </section>
  );
}
