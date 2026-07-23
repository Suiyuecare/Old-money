import type { ReactNode } from "react";

import { CheckoutSessionProvider } from "./CheckoutSessionProvider";

export default function CheckoutLayout({ children }: { readonly children: ReactNode }) {
  return <CheckoutSessionProvider>{children}</CheckoutSessionProvider>;
}
