import { z } from "zod";

import { getPublicSupabaseClient } from "@/lib/supabase/request-clients";

import {
  getCommerceEnvironment,
  type CommerceEnvironment,
  type RuntimeControls,
} from "./config";

const runtimeControlsDocumentSchema = z.preprocess((input) => {
  const value = Array.isArray(input) && input.length === 1
    ? input[0]
    : input;
  if (!value || typeof value !== "object") return value;
  const record = value as Readonly<Record<string, unknown>>;
  const integer = (candidate: unknown) =>
    typeof candidate === "string" && /^\d+$/.test(candidate)
      ? Number(candidate)
      : candidate;
  return {
    version: integer(record.version),
    mediaSafetyRevision: integer(
      record.mediaSafetyRevision ?? record.media_safety_revision,
    ),
    commerceLive: record.commerceLive ?? record.commerce_live,
    checkoutEnabled:
      record.checkoutEnabled ?? record.checkout_enabled,
    productionCanaryEnabled:
      record.productionCanaryEnabled ??
      record.production_canary_enabled,
    ecpayApplePayEnabled:
      record.ecpayApplePayEnabled ??
      record.ecpay_apple_pay_enabled,
    searchIndexEnabled:
      record.searchIndexEnabled ?? record.search_index_enabled,
    catalogEmergencyNoCache:
      record.catalogEmergencyNoCache ??
      record.catalog_emergency_no_cache,
    mediaEmergencyNoCache:
      record.mediaEmergencyNoCache ??
      record.media_emergency_no_cache,
    catalogApprovalRevision:
      record.catalogApprovalRevision ??
      record.catalog_approval_revision ??
      null,
    legalApprovalRevision:
      record.legalApprovalRevision ??
      record.legal_approval_revision ??
      null,
    canaryEvidenceSha256:
      record.canaryEvidenceSha256 ??
      record.canary_evidence_sha256 ??
      null,
    updatedAt: record.updatedAt ?? record.updated_at,
  };
}, z.strictObject({
  version: z.number().int().nonnegative().safe(),
  mediaSafetyRevision: z.number().int().nonnegative().safe(),
  commerceLive: z.boolean(),
  checkoutEnabled: z.boolean(),
  productionCanaryEnabled: z.boolean(),
  ecpayApplePayEnabled: z.boolean(),
  searchIndexEnabled: z.boolean(),
  catalogEmergencyNoCache: z.boolean(),
  mediaEmergencyNoCache: z.boolean(),
  catalogApprovalRevision: z.string().trim().min(1).max(160).nullable(),
  legalApprovalRevision: z.string().trim().min(1).max(160).nullable(),
  canaryEvidenceSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  updatedAt: z.string().datetime({ offset: true }),
}));

export type RuntimeControlsDocument = z.infer<
  typeof runtimeControlsDocumentSchema
>;

export type RuntimeControlsLoader = () => Promise<unknown>;

export function applyDatabaseRuntimeControls(
  environment: CommerceEnvironment,
  input: unknown,
): CommerceEnvironment {
  if (environment.mode === "demo") return environment;
  const document = runtimeControlsDocumentSchema.parse(input);
  const catalogFactsApproved = Boolean(
    environment.expectedCatalogApprovalRevision
    && document.catalogApprovalRevision
      === environment.expectedCatalogApprovalRevision,
  );
  const legalFactsApproved = Boolean(
    environment.expectedLegalApprovalRevision
    && document.legalApprovalRevision
      === environment.expectedLegalApprovalRevision,
  );
  const productionCanaryCompleted = Boolean(
    environment.expectedCanaryEvidenceSha256
    && document.canaryEvidenceSha256
      === environment.expectedCanaryEvidenceSha256,
  );
  const liveDeployment =
    environment.mode === "live" && environment.commerceCapable;
  const canaryPrerequisites =
    liveDeployment
    && environment.providerCredentialsConfigured
    && environment.databaseConfigured
    && environment.operationalFactsConfigured
    && environment.workerAuthorizationConfigured
    && environment.incidentChannelConfigured
    && environment.deadmanConfigured
    && catalogFactsApproved
    && legalFactsApproved;
  const commercePrerequisites =
    canaryPrerequisites && productionCanaryCompleted;
  const commerceLive = commercePrerequisites && document.commerceLive;
  const checkoutEnabled =
    commerceLive && document.checkoutEnabled;
  const controls: RuntimeControls = Object.freeze({
    revision: document.version,
    mediaSafetyRevision: document.mediaSafetyRevision,
    commerceLive,
    checkoutEnabled,
    productionCanaryEnabled:
      canaryPrerequisites && document.productionCanaryEnabled,
    ecpayApplePayEnabled:
      checkoutEnabled && document.ecpayApplePayEnabled,
    searchIndexEnabled:
      liveDeployment && document.searchIndexEnabled,
    catalogEmergencyNoCache: document.catalogEmergencyNoCache,
    mediaEmergencyNoCache: document.mediaEmergencyNoCache,
  });
  return Object.freeze({
    ...environment,
    catalogFactsApproved,
    legalFactsApproved,
    productionCanaryCompleted,
    controls,
    controlsSource: "database" as const,
  });
}

export async function loadPublicRuntimeControls(): Promise<unknown> {
  const client = getPublicSupabaseClient();
  const { data, error } = await client
    .schema("api")
    .rpc("public_runtime_controls_read", undefined, { get: true });
  if (error || data === null) {
    throw new Error("PUBLIC_RUNTIME_CONTROLS_UNAVAILABLE");
  }
  return data;
}

export async function getCommerceEnvironmentWithRuntimeControls(
  env: Readonly<Record<string, string | undefined>> = process.env,
  loader: RuntimeControlsLoader = loadPublicRuntimeControls,
): Promise<CommerceEnvironment> {
  const base = getCommerceEnvironment(env);
  if (base.mode === "demo") return base;
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    return base;
  }
  try {
    return applyDatabaseRuntimeControls(base, await loader());
  } catch {
    // Invalid, stale or unavailable shared state is never replaced with an
    // environment switch. The deterministic base keeps every live gate off.
    return base;
  }
}
