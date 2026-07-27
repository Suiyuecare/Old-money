import { canCreateCheckout } from "@/lib/commerce/readiness";
import { getCommerceEnvironmentWithRuntimeControls } from "@/lib/commerce/runtime-environment";
import { noStoreJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const environment =
    await getCommerceEnvironmentWithRuntimeControls();
  const checkout = canCreateCheckout(environment, false);
  return noStoreJson({
    mode: environment.mode,
    commerceCapable: environment.commerceCapable,
    controlsSource: environment.controlsSource,
    controlsRevision: environment.controls.revision,
    operationalFactsConfigured: environment.operationalFactsConfigured,
    workerAuthorizationConfigured: environment.workerAuthorizationConfigured,
    catalogFactsApproved: environment.catalogFactsApproved,
    legalFactsApproved: environment.legalFactsApproved,
    productionCanaryCompleted: environment.productionCanaryCompleted,
    checkout: {
      allowed: checkout.allowed,
      code: checkout.code,
    },
    indexing: environment.controls.searchIndexEnabled,
    liveProviders: false,
  });
}
