import { describe, expect, it } from "vitest";

import { parseProductionEnvironment } from "@/lib/env-schema";

const common = {
  NODE_ENV: "production",
  LIGNEE_CATALOG_SOURCE: "database",
  SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abcdefghijklmnop",
  SUPABASE_SECRET_KEY: "sb_secret_abcdefghijklmnop",
  SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
  SUPABASE_CATALOG_SOURCE_BUCKET: "lignee-product-source",
  SUPABASE_CATALOG_MEDIA_BUCKET: "lignee-public-derivatives",
  SUPABASE_SUPPORT_ATTACHMENTS_BUCKET: "lignee-support-attachments",
  ORDER_ACCESS_TOKEN_SECRET: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  ORDER_ACCESS_LOOKUP_SECRET: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA",
  ORDER_PII_ENCRYPTION_KEY_V1: "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCA",
} as const;

describe("production environment gates", () => {
  it("allows a production-disabled backoffice without live provider secrets", () => {
    expect(
      parseProductionEnvironment({
        ...common,
        LIGNEE_MODE: "production-disabled",
        COMMERCE_CAPABLE: "false",
        ECPAY_MERCHANT_ID: "",
      }).LIGNEE_MODE,
    ).toBe("production-disabled");
  });

  it("ignores unrelated platform variables supplied by the production host", () => {
    expect(
      parseProductionEnvironment({
        ...common,
        LIGNEE_MODE: "production-disabled",
        COMMERCE_CAPABLE: "false",
        PATH: "/usr/local/bin:/usr/bin",
        VERCEL: "1",
        VERCEL_ENV: "production",
        VERCEL_URL: "estatelignee.com",
      }).LIGNEE_MODE,
    ).toBe("production-disabled");
  });

  it("requires every live binding and the deployment upper bound", () => {
    expect(() =>
      parseProductionEnvironment({
        ...common,
        LIGNEE_MODE: "live",
        COMMERCE_CAPABLE: "false",
      }),
    ).toThrow();

    expect(() =>
      parseProductionEnvironment({
        ...common,
        LIGNEE_MODE: "live",
        COMMERCE_CAPABLE: "true",
      }),
    ).toThrow();

    expect(
      parseProductionEnvironment({
        ...common,
        LIGNEE_MODE: "live",
        COMMERCE_CAPABLE: "true",
        LIGNEE_DATABASE_URL: "postgres://dedicated-lignee",
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
      }).LIGNEE_MODE,
    ).toBe("live");
  });

  it("never permits a static catalog in a production contract", () => {
    expect(() =>
      parseProductionEnvironment({
        ...common,
        LIGNEE_CATALOG_SOURCE: "static",
        LIGNEE_MODE: "production-disabled",
        COMMERCE_CAPABLE: "false",
      }),
    ).toThrow();
  });
});
