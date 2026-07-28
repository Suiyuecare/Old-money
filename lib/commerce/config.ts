import { z } from "zod";

export type CommerceMode = "demo" | "production-disabled" | "live";

const booleanText = z.enum(["true", "false"]).transform((value) => value === "true");

const optionalBoolean = (value: string | undefined): boolean | undefined =>
  value === undefined ? undefined : booleanText.parse(value);

export const isVerifiedVercelPreview = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean => env.VERCEL === "1" && env.VERCEL_ENV === "preview";

export interface RuntimeControls {
  readonly revision: number;
  readonly mediaSafetyRevision: number;
  readonly commerceLive: boolean;
  readonly checkoutEnabled: boolean;
  readonly productionCanaryEnabled: boolean;
  readonly ecpayApplePayEnabled: boolean;
  readonly searchIndexEnabled: boolean;
  readonly catalogEmergencyNoCache: boolean;
  readonly mediaEmergencyNoCache: boolean;
}

export interface CommerceEnvironment {
  readonly mode: CommerceMode;
  readonly commerceCapable: boolean;
  readonly canonicalOrigin: "https://estatelignee.com";
  readonly canonicalHost: "estatelignee.com";
  readonly controls: RuntimeControls;
  readonly controlsSource:
    | "deterministic-demo"
    | "database"
    | "fail-closed-env";
  readonly providerCredentialsConfigured: boolean;
  readonly databaseConfigured: boolean;
  readonly operationalFactsConfigured: boolean;
  readonly workerAuthorizationConfigured: boolean;
  readonly incidentChannelConfigured: boolean;
  readonly deadmanConfigured: boolean;
  readonly catalogFactsApproved: boolean;
  readonly legalFactsApproved: boolean;
  readonly productionCanaryCompleted: boolean;
  readonly expectedCatalogApprovalRevision: string | null;
  readonly expectedLegalApprovalRevision: string | null;
  readonly expectedCanaryEvidenceSha256: string | null;
}

const failClosedControls = Object.freeze({
  revision: 0,
  mediaSafetyRevision: 0,
  commerceLive: false,
  checkoutEnabled: false,
  productionCanaryEnabled: false,
  ecpayApplePayEnabled: false,
  searchIndexEnabled: false,
  catalogEmergencyNoCache: true,
  mediaEmergencyNoCache: true,
} satisfies RuntimeControls);

export function getCommerceEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
): CommerceEnvironment {
  const requestedMode = env.LIGNEE_MODE;
  const verifiedPreview = isVerifiedVercelPreview(env);
  const demoAllowed =
    env.NODE_ENV !== "production" || verifiedPreview;
  const mode: CommerceMode =
    requestedMode === "demo"
      ? demoAllowed
        ? "demo"
        : "production-disabled"
      : requestedMode === "production-disabled" ||
    requestedMode === "live"
      ? requestedMode
      : env.NODE_ENV === "production"
        ? "production-disabled"
        : "demo";

  const commerceCapable = optionalBoolean(env.COMMERCE_CAPABLE) ?? false;
  const providerCredentialsConfigured = Boolean(
    env.ECPAY_MERCHANT_ID &&
      env.ECPAY_HASH_KEY &&
      env.ECPAY_HASH_IV &&
      env.ECPAY_INVOICE_MERCHANT_ID &&
      env.ECPAY_INVOICE_HASH_KEY &&
      env.ECPAY_INVOICE_HASH_IV &&
      env.TCAT_CUSTOMER_ID &&
      env.TCAT_API_KEY &&
      env.RESEND_API_KEY &&
      env.RESEND_FROM_EMAIL,
  );
  const databaseConfigured = Boolean(
    env.LIGNEE_DATABASE_URL && env.LIGNEE_DATABASE_CA_CERT,
  );
  const operationalFactsConfigured = Boolean(
    env.LIGNEE_COMPANY_NAME &&
      env.LIGNEE_UNIFIED_BUSINESS_NUMBER &&
      env.LIGNEE_SUPPORT_EMAIL &&
      env.LIGNEE_SUPPORT_PHONE &&
      env.LIGNEE_RETURN_ADDRESS,
  );
  const expectedCatalogApprovalRevision =
    env.LIGNEE_CATALOG_APPROVAL_REVISION?.trim() || null;
  const expectedLegalApprovalRevision =
    env.LIGNEE_LEGAL_APPROVAL_REVISION?.trim() || null;
  const expectedCanaryEvidenceSha256 =
    env.LIGNEE_CANARY_EVIDENCE_SHA256
      && /^[a-f0-9]{64}$/.test(env.LIGNEE_CANARY_EVIDENCE_SHA256)
      ? env.LIGNEE_CANARY_EVIDENCE_SHA256
      : null;

  // Shared runtime controls must ultimately come from DB + Edge Config with a
  // matching revision. Environment values are intentionally not accepted as a
  // way to enable commerce. Until that read path is configured, production is
  // strictly fail closed.
  const controls: RuntimeControls =
    mode === "demo"
      ? {
          ...failClosedControls,
          revision: 1,
          mediaSafetyRevision: 1,
          catalogEmergencyNoCache: false,
          mediaEmergencyNoCache: false,
        }
      : failClosedControls;

  return Object.freeze({
    mode,
    commerceCapable,
    canonicalOrigin: "https://estatelignee.com",
    canonicalHost: "estatelignee.com",
    controls,
    controlsSource: mode === "demo" ? "deterministic-demo" : "fail-closed-env",
    providerCredentialsConfigured,
    databaseConfigured,
    operationalFactsConfigured,
    workerAuthorizationConfigured: Boolean(
      env.CRON_SECRET && env.CRON_SECRET.length >= 32,
    ),
    incidentChannelConfigured: Boolean(env.INCIDENT_WEBHOOK_URL),
    deadmanConfigured: Boolean(
      env.DEADMAN_HEARTBEAT_URL_RESERVATION &&
        env.DEADMAN_HEARTBEAT_URL_REFUND_PRIORITY &&
        env.DEADMAN_HEARTBEAT_URL_RECONCILIATION,
    ),
    // Deployment values are only expectations. They become approved after
    // the public runtime read proves an exact match to the latest append-only
    // Owner attestation in the dedicated commerce database.
    catalogFactsApproved: mode === "demo",
    legalFactsApproved: mode === "demo",
    productionCanaryCompleted: mode === "demo",
    expectedCatalogApprovalRevision,
    expectedLegalApprovalRevision,
    expectedCanaryEvidenceSha256,
  });
}

export const isTrustedDemoEnvironment = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean =>
  getCommerceEnvironment(env).mode === "demo" &&
  (env.NODE_ENV !== "production" || isVerifiedVercelPreview(env));

export const isCanonicalCommerceRequest = (
  requestUrl: URL,
  hostHeader: string | null,
): boolean =>
  requestUrl.protocol === "https:" &&
  requestUrl.hostname === "estatelignee.com" &&
  hostHeader?.split(":")[0]?.toLowerCase() === "estatelignee.com";
