import { describe, expect, it } from "vitest";

import {
  applyDatabaseRuntimeControls,
  getCommerceEnvironmentWithRuntimeControls,
} from "@/lib/commerce/runtime-environment";
import { getCommerceEnvironment } from "@/lib/commerce/config";

const document = {
  version: 12,
  mediaSafetyRevision: 4,
  commerceLive: true,
  checkoutEnabled: true,
  productionCanaryEnabled: true,
  ecpayApplePayEnabled: true,
  searchIndexEnabled: true,
  catalogEmergencyNoCache: false,
  mediaEmergencyNoCache: false,
  catalogApprovalRevision: "catalog-2026-07-28",
  legalApprovalRevision: "legal-2026-07-28",
  canaryEvidenceSha256: "a".repeat(64),
  updatedAt: "2026-07-28T02:00:00.000Z",
};

const liveBindings = {
  NODE_ENV: "production",
  LIGNEE_MODE: "live",
  COMMERCE_CAPABLE: "true",
  LIGNEE_DATABASE_URL: "postgres://lignee",
  LIGNEE_DATABASE_CA_CERT: "certificate",
  ECPAY_MERCHANT_ID: "merchant",
  ECPAY_HASH_KEY: "payment-hash-key",
  ECPAY_HASH_IV: "payment-hash-iv",
  ECPAY_INVOICE_MERCHANT_ID: "invoice-merchant",
  ECPAY_INVOICE_HASH_KEY: "invoice-hash-key",
  ECPAY_INVOICE_HASH_IV: "invoice-hash-iv",
  TCAT_CUSTOMER_ID: "tcat-customer",
  TCAT_API_KEY: "tcat-api-key",
  RESEND_API_KEY: "re_abcdefghijklmnopqrstuvwxyz",
  RESEND_FROM_EMAIL: "estate@estatelignee.com",
  CRON_SECRET: "c".repeat(32),
  LIGNEE_COMPANY_NAME: "LIGNÉE",
  LIGNEE_UNIFIED_BUSINESS_NUMBER: "12345678",
  LIGNEE_SUPPORT_EMAIL: "clientservices@estatelignee.com",
  LIGNEE_SUPPORT_PHONE: "02-1234-5678",
  LIGNEE_RETURN_ADDRESS: "Taipei return address",
  INCIDENT_WEBHOOK_URL: "https://incident.example.com",
  DEADMAN_HEARTBEAT_URL_RESERVATION:
    "https://deadman.example.com/reservation",
  DEADMAN_HEARTBEAT_URL_REFUND_PRIORITY:
    "https://deadman.example.com/refund",
  DEADMAN_HEARTBEAT_URL_RECONCILIATION:
    "https://deadman.example.com/reconciliation",
  LIGNEE_CATALOG_APPROVAL_REVISION: "catalog-2026-07-28",
  LIGNEE_LEGAL_APPROVAL_REVISION: "legal-2026-07-28",
} as const;

describe("shared runtime controls", () => {
  it("keeps deployment upper bounds off in production-disabled mode", () => {
    const environment = applyDatabaseRuntimeControls(
      getCommerceEnvironment({
        NODE_ENV: "production",
        LIGNEE_MODE: "production-disabled",
        COMMERCE_CAPABLE: "false",
      }),
      document,
    );
    expect(environment.controlsSource).toBe("database");
    expect(environment.controls).toMatchObject({
      revision: 12,
      mediaSafetyRevision: 4,
      commerceLive: false,
      checkoutEnabled: false,
      productionCanaryEnabled: false,
      ecpayApplePayEnabled: false,
      searchIndexEnabled: false,
      mediaEmergencyNoCache: false,
    });
  });

  it("ANDs live database controls with the immutable deployment capability", () => {
    const environment = applyDatabaseRuntimeControls(
      getCommerceEnvironment({
        ...liveBindings,
        LIGNEE_CANARY_EVIDENCE_SHA256: "a".repeat(64),
      }),
      document,
    );
    expect(environment.controls.commerceLive).toBe(true);
    expect(environment.controls.checkoutEnabled).toBe(true);
    expect(environment.controls.searchIndexEnabled).toBe(true);
  });

  it("allows an isolated canary but blocks public commerce until evidence is deployed", () => {
    const beforeCanary = applyDatabaseRuntimeControls(
      getCommerceEnvironment(liveBindings),
      document,
    );
    expect(beforeCanary.controls.productionCanaryEnabled).toBe(true);
    expect(beforeCanary.controls.commerceLive).toBe(false);
    expect(beforeCanary.controls.checkoutEnabled).toBe(false);
    expect(beforeCanary.controls.searchIndexEnabled).toBe(true);
  });

  it("blocks money movement when any immutable prerequisite is absent", () => {
    const missingLegalApproval = applyDatabaseRuntimeControls(
      getCommerceEnvironment({
        ...liveBindings,
        LIGNEE_LEGAL_APPROVAL_REVISION: "",
        LIGNEE_CANARY_EVIDENCE_SHA256: "a".repeat(64),
      }),
      document,
    );
    expect(missingLegalApproval.controls.productionCanaryEnabled).toBe(false);
    expect(missingLegalApproval.controls.commerceLive).toBe(false);
    expect(missingLegalApproval.controls.checkoutEnabled).toBe(false);
  });

  it("requires deployment evidence to match the latest durable attestation", () => {
    const mismatchedCatalog = applyDatabaseRuntimeControls(
      getCommerceEnvironment({
        ...liveBindings,
        LIGNEE_CANARY_EVIDENCE_SHA256: "a".repeat(64),
      }),
      {
        ...document,
        catalogApprovalRevision: "catalog-stale",
      },
    );
    expect(mismatchedCatalog.catalogFactsApproved).toBe(false);
    expect(mismatchedCatalog.controls.productionCanaryEnabled).toBe(false);
    expect(mismatchedCatalog.controls.commerceLive).toBe(false);
  });

  it("fails closed when the database is unavailable or violates the contract", async () => {
    const env = {
      NODE_ENV: "production",
      LIGNEE_MODE: "live",
      COMMERCE_CAPABLE: "true",
      SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_value",
    };
    const unavailable =
      await getCommerceEnvironmentWithRuntimeControls(
        env,
        async () => {
          throw new Error("offline");
        },
      );
    const invalid =
      await getCommerceEnvironmentWithRuntimeControls(
        env,
        async () => ({ ...document, version: -1 }),
      );
    expect(unavailable.controlsSource).toBe("fail-closed-env");
    expect(unavailable.controls.checkoutEnabled).toBe(false);
    expect(invalid.controlsSource).toBe("fail-closed-env");
    expect(invalid.controls.commerceLive).toBe(false);
  });
});
