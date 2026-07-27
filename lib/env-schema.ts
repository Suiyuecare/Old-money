import { z } from "zod";

const httpsUrl = z.string().url().refine((value) => value.startsWith("https://"));
const base64Url32 = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const emptyAsUndefined = <T extends z.ZodType>(
  schema: T,
) =>
  z.preprocess(
    (value) => value === "" ? undefined : value,
    schema.optional(),
  );

const commonProductionEnvironment = z.strictObject({
  NODE_ENV: z.literal("production"),
  LIGNEE_CATALOG_SOURCE: z.enum(["compare", "database"]),
  SUPABASE_URL: httpsUrl,
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SECRET_KEY: z.string().min(20),
  SUPABASE_PROJECT_REF: z.string().regex(/^[a-z]{20}$/),
  SUPABASE_CATALOG_SOURCE_BUCKET: z.literal("lignee-product-source"),
  SUPABASE_CATALOG_MEDIA_BUCKET: z.literal("lignee-public-derivatives"),
  SUPABASE_SUPPORT_ATTACHMENTS_BUCKET: z.literal(
    "lignee-support-attachments",
  ),
  ORDER_ACCESS_TOKEN_SECRET: base64Url32,
  ORDER_ACCESS_LOOKUP_SECRET: base64Url32,
  ORDER_PII_ENCRYPTION_KEY_V1: base64Url32,
  LIGNEE_CATALOG_APPROVAL_REVISION: emptyAsUndefined(z.string().trim().min(1)),
  LIGNEE_LEGAL_APPROVAL_REVISION: emptyAsUndefined(z.string().trim().min(1)),
  LIGNEE_CANARY_EVIDENCE_SHA256: emptyAsUndefined(
    z.string().regex(/^[a-f0-9]{64}$/),
  ),
});

const liveOnlyBindings = {
  LIGNEE_DATABASE_URL: z.string().min(1),
  LIGNEE_DATABASE_CA_CERT: z.string().min(1),
  ECPAY_MERCHANT_ID: z.string().min(1),
  ECPAY_HASH_KEY: z.string().min(8),
  ECPAY_HASH_IV: z.string().min(8),
  ECPAY_INVOICE_MERCHANT_ID: z.string().min(1),
  ECPAY_INVOICE_HASH_KEY: z.string().min(8),
  ECPAY_INVOICE_HASH_IV: z.string().min(8),
  TCAT_CUSTOMER_ID: z.string().min(1),
  TCAT_API_KEY: z.string().min(8),
  RESEND_API_KEY: z.string().min(20),
  RESEND_FROM_EMAIL: z.string().email(),
  CRON_SECRET: z.string().min(32),
  LIGNEE_COMPANY_NAME: z.string().min(1),
  LIGNEE_UNIFIED_BUSINESS_NUMBER: z.string().regex(/^\d{8}$/),
  LIGNEE_SUPPORT_EMAIL: z.string().email(),
  LIGNEE_SUPPORT_PHONE: z.string().min(6),
  LIGNEE_RETURN_ADDRESS: z.string().min(8),
  INCIDENT_WEBHOOK_URL: httpsUrl,
  DEADMAN_HEARTBEAT_URL_RESERVATION: httpsUrl,
  DEADMAN_HEARTBEAT_URL_REFUND_PRIORITY: httpsUrl,
  DEADMAN_HEARTBEAT_URL_RECONCILIATION: httpsUrl,
} as const;

const productionDisabledEnvironmentSchema =
  commonProductionEnvironment.extend({
    LIGNEE_MODE: z.literal("production-disabled"),
    COMMERCE_CAPABLE: z.literal("false"),
    LIGNEE_DATABASE_URL: emptyAsUndefined(z.string().min(1)),
    LIGNEE_DATABASE_CA_CERT: emptyAsUndefined(z.string().min(1)),
    ECPAY_MERCHANT_ID: emptyAsUndefined(z.string().min(1)),
    ECPAY_HASH_KEY: emptyAsUndefined(z.string().min(8)),
    ECPAY_HASH_IV: emptyAsUndefined(z.string().min(8)),
    ECPAY_INVOICE_MERCHANT_ID: emptyAsUndefined(z.string().min(1)),
    ECPAY_INVOICE_HASH_KEY: emptyAsUndefined(z.string().min(8)),
    ECPAY_INVOICE_HASH_IV: emptyAsUndefined(z.string().min(8)),
    TCAT_CUSTOMER_ID: emptyAsUndefined(z.string().min(1)),
    TCAT_API_KEY: emptyAsUndefined(z.string().min(8)),
    RESEND_API_KEY: emptyAsUndefined(z.string().min(20)),
    RESEND_FROM_EMAIL: emptyAsUndefined(z.string().email()),
    CRON_SECRET: emptyAsUndefined(z.string().min(32)),
    LIGNEE_COMPANY_NAME: emptyAsUndefined(z.string().min(1)),
    LIGNEE_UNIFIED_BUSINESS_NUMBER: emptyAsUndefined(
      z.string().regex(/^\d{8}$/),
    ),
    LIGNEE_SUPPORT_EMAIL: emptyAsUndefined(z.string().email()),
    LIGNEE_SUPPORT_PHONE: emptyAsUndefined(z.string().min(6)),
    LIGNEE_RETURN_ADDRESS: emptyAsUndefined(z.string().min(8)),
    INCIDENT_WEBHOOK_URL: emptyAsUndefined(httpsUrl),
    DEADMAN_HEARTBEAT_URL_RESERVATION: emptyAsUndefined(httpsUrl),
    DEADMAN_HEARTBEAT_URL_REFUND_PRIORITY: emptyAsUndefined(httpsUrl),
    DEADMAN_HEARTBEAT_URL_RECONCILIATION: emptyAsUndefined(httpsUrl),
  });

const liveEnvironmentSchema = commonProductionEnvironment.extend({
  LIGNEE_MODE: z.literal("live"),
  COMMERCE_CAPABLE: z.literal("true"),
  ...liveOnlyBindings,
});

// `process.env` always contains platform-owned keys such as PATH, VERCEL_URL,
// and AWS_REGION. Keep the schemas strict, but only present the application
// contract to Zod so an unrelated host variable cannot prevent startup.
const productionEnvironmentKeys = Object.freeze(
  Object.keys(liveEnvironmentSchema.shape),
);

export const productionEnvironmentSchema = z.discriminatedUnion(
  "LIGNEE_MODE",
  [productionDisabledEnvironmentSchema, liveEnvironmentSchema],
);

export type ProductionEnvironment = z.infer<
  typeof productionEnvironmentSchema
>;

export function parseProductionEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): ProductionEnvironment {
  return productionEnvironmentSchema.parse(
    Object.fromEntries(
      productionEnvironmentKeys.map((key) => [key, env[key]]),
    ),
  );
}
