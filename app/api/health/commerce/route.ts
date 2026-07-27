import { getCommerceEnvironment } from "@/lib/commerce/config";
import { canCreateCheckout } from "@/lib/commerce/readiness";
import { noStoreJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const environment = getCommerceEnvironment();
  const checkout = canCreateCheckout(environment, false);
  return noStoreJson({
    mode: environment.mode,
    commerceCapable: environment.commerceCapable,
    controlsSource: environment.controlsSource,
    controlsRevision: environment.controls.revision,
    checkout: {
      allowed: checkout.allowed,
      code: checkout.code,
    },
    indexing: false,
    liveProviders: false,
  });
}
