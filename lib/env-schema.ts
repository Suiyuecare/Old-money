import { z } from "zod";

const httpsUrl = z.string().url().refine((value) => value.startsWith("https://"));

export const productionEnvironmentSchema = z.strictObject({
  NODE_ENV: z.literal("production"),
  LIGNEE_MODE: z.enum(["production-disabled", "live"]),
  COMMERCE_CAPABLE: z.enum(["true", "false"]),
  LIGNEE_DATABASE_URL: z.string().min(1),
  LIGNEE_DATABASE_CA_CERT: z.string().min(1),
  SUPABASE_URL: httpsUrl,
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  ECPAY_MERCHANT_ID: z.string().min(1),
  ECPAY_HASH_KEY: z.string().min(8),
  ECPAY_HASH_IV: z.string().min(8),
  RESEND_API_KEY: z.string().min(20),
  CRON_SECRET: z.string().min(32),
  INCIDENT_WEBHOOK_URL: httpsUrl,
  DEADMAN_HEARTBEAT_URL_RESERVATION: httpsUrl,
  DEADMAN_HEARTBEAT_URL_REFUND_PRIORITY: httpsUrl,
  DEADMAN_HEARTBEAT_URL_RECONCILIATION: httpsUrl,
});

export type ProductionEnvironment = z.infer<typeof productionEnvironmentSchema>;

export function parseProductionEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): ProductionEnvironment {
  return productionEnvironmentSchema.parse(env);
}

