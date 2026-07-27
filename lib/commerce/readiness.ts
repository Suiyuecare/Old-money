import type { CommerceEnvironment } from "./config";

export interface ReadinessResult {
  readonly allowed: boolean;
  readonly code: string;
  readonly reasons: readonly string[];
}

const result = (
  code: string,
  conditions: readonly (readonly [condition: boolean, reason: string])[],
): ReadinessResult => {
  const reasons = conditions.filter(([condition]) => !condition).map(([, reason]) => reason);
  return Object.freeze({ allowed: reasons.length === 0, code, reasons });
};

export const canCreateCheckout = (
  environment: CommerceEnvironment,
  canonicalRequest: boolean,
): ReadinessResult =>
  environment.mode === "demo"
    ? result("DEMO_CHECKOUT_READY", [])
    : result("CHECKOUT_DISABLED", [
        [environment.mode === "live", "runtime mode is not live"],
        [environment.commerceCapable, "deployment upper bound is disabled"],
        [canonicalRequest, "request is not on the canonical HTTPS host"],
        [environment.controlsSource !== "fail-closed-env", "shared runtime controls are unavailable"],
        [environment.controls.commerceLive, "commerce_live is false"],
        [environment.controls.checkoutEnabled, "checkout_enabled is false"],
        [environment.providerCredentialsConfigured, "payment credentials are unavailable"],
        [environment.databaseConfigured, "production database binding is unavailable"],
        [environment.operationalFactsConfigured, "company and customer-service facts are incomplete"],
      ]);

export const canAcceptPaymentCallback = (
  environment: CommerceEnvironment,
): ReadinessResult =>
  result("PAYMENT_CALLBACK_DISABLED", [
    [environment.mode === "demo" || environment.commerceCapable, "deployment cannot process provider callbacks"],
    [environment.mode === "demo" || environment.providerCredentialsConfigured, "callback verification keys are unavailable"],
    [environment.mode === "demo" || environment.databaseConfigured, "durable callback inbox is unavailable"],
  ]);

export const canFulfillExistingOrder = (
  environment: CommerceEnvironment,
  order: { readonly paymentAtRisk: boolean; readonly parcelCustodyConsistent: boolean },
): ReadinessResult =>
  result("FULFILLMENT_DISABLED", [
    [environment.mode === "demo" || environment.databaseConfigured, "existing-order repository is unavailable"],
    [!order.paymentAtRisk, "order payment is at risk"],
    [order.parcelCustodyConsistent, "parcel custody is inconsistent"],
  ]);

export const canRefund = (
  environment: CommerceEnvironment,
  recovery: { readonly budgetAvailable: boolean; readonly openOperation: boolean },
): ReadinessResult =>
  result("REFUND_DISABLED", [
    [environment.mode === "demo" || environment.databaseConfigured, "refund repository is unavailable"],
    [environment.mode === "demo" || environment.providerCredentialsConfigured, "refund provider is unavailable"],
    [recovery.budgetAvailable, "receipt recovery budget is exhausted"],
    [!recovery.openOperation, "another refund outcome remains possible"],
  ]);

export const canInvoice = (environment: CommerceEnvironment): ReadinessResult =>
  result("INVOICE_DISABLED", [
    [environment.mode === "demo" || environment.databaseConfigured, "invoice outbox is unavailable"],
    [environment.mode === "demo" || environment.providerCredentialsConfigured, "invoice provider is unavailable"],
  ]);

export const canAccessAdmin = (
  environment: CommerceEnvironment,
  session: { readonly authenticated: boolean; readonly aal2: boolean; readonly activeMembership: boolean },
): ReadinessResult =>
  result("ADMIN_ACCESS_DENIED", [
    [session.authenticated, "no authenticated admin session"],
    [session.aal2, "AAL2 is required"],
    [session.activeMembership, "active database membership is required"],
    [environment.mode === "demo" || environment.databaseConfigured, "admin data boundary is unavailable"],
  ]);

export const canServePublicMedia = (
  environment: CommerceEnvironment,
  asset: {
    readonly edgeBeforeCacheVerified: boolean;
    readonly revisionMatches: boolean;
    readonly status: string;
    readonly tombstoned: boolean;
  },
): ReadinessResult =>
  result("MEDIA_NOT_SERVABLE", [
    [asset.edgeBeforeCacheVerified, "edge-before-cache verification is absent"],
    [asset.revisionMatches, "media safety revision mismatch"],
    [asset.status === "live_approved", "asset is not live_approved"],
    [!asset.tombstoned, "asset SHA is tombstoned"],
  ]);

export const canCallPrivilegedBroker = (
  environment: CommerceEnvironment,
  binding: {
    readonly status: "candidate" | "active" | "draining" | "revoked";
    readonly scopeApproved: boolean;
    readonly generationActive: boolean;
    readonly capabilityValid: boolean;
    readonly dpopValid: boolean;
  },
): ReadinessResult =>
  result("PRIVILEGED_BROKER_DENIED", [
    [environment.mode !== "demo", "privileged brokers are never called from demo"],
    [binding.status === "candidate" || binding.status === "active", "deployment binding is not eligible"],
    [binding.scopeApproved, "scope is not approved"],
    [binding.generationActive, "binding generation is revoked"],
    [binding.capabilityValid, "capability is missing or invalid"],
    [binding.dpopValid, "DPoP proof does not match"],
  ]);

export const canCreateProductionCanary = (
  environment: CommerceEnvironment,
  context: {
    readonly canonicalRequest: boolean;
    readonly recentAal2Owner: boolean;
    readonly csrfValid: boolean;
    readonly testerAllowlisted: boolean;
    readonly deviceAllowlisted: boolean;
    readonly breakfastMugApprovedAt2200: boolean;
    readonly isolatedStockAvailable: boolean;
    readonly inFlightCount: number;
    readonly dailyCount: number;
  },
): ReadinessResult =>
  result("PRODUCTION_CANARY_DISABLED", [
    [environment.commerceCapable, "deployment upper bound is disabled"],
    [context.canonicalRequest, "request is not on the canonical HTTPS host"],
    [environment.controls.productionCanaryEnabled, "production_canary_enabled is false"],
    [!environment.controls.commerceLive, "public commerce must remain off"],
    [!environment.controls.checkoutEnabled, "public checkout must remain off"],
    [context.recentAal2Owner, "recent AAL2 Owner session is required"],
    [context.csrfValid, "CSRF validation failed"],
    [context.testerAllowlisted && context.deviceAllowlisted, "tester or device is not allowlisted"],
    [context.breakfastMugApprovedAt2200, "approved canary SKU/price gate is absent"],
    [context.isolatedStockAvailable, "isolated canary stock is unavailable"],
    [context.inFlightCount === 0, "another canary is in flight"],
    [context.dailyCount < 2, "daily canary limit reached"],
  ]);
