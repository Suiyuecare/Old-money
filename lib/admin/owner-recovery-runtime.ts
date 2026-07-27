import { CommerceDomainError } from "@/lib/commerce/errors";
import { getPrivilegedSupabaseClient } from "@/lib/supabase/request-clients";

import {
  createSupabaseOwnerRecoveryAuthGateway,
  OwnerRecoveryWorker,
  SupabaseOwnerRecoveryAuthAdmin,
  SupabaseOwnerRecoveryOutboxRepository,
} from "./owner-recovery-worker";

export function isProductionOwnerRecoveryWorkerEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return (
    environment.NODE_ENV === "production"
    && environment.VERCEL_ENV === "production"
    && (
      environment.LIGNEE_MODE === "production-disabled"
      || environment.LIGNEE_MODE === "live"
    )
    && Boolean(environment.SUPABASE_URL)
    && (environment.SUPABASE_PUBLISHABLE_KEY?.length ?? 0) >= 20
    && (environment.SUPABASE_SECRET_KEY?.length ?? 0) >= 20
    && (environment.CRON_SECRET?.length ?? 0) >= 32
  );
}

export function getProductionOwnerRecoveryWorker(): OwnerRecoveryWorker {
  if (!isProductionOwnerRecoveryWorkerEnvironment()) {
    throw new CommerceDomainError(
      "OWNER_RECOVERY_WORKER_DISABLED",
      "Owner recovery worker is available only in the Production deployment.",
      503,
    );
  }

  // This lazy getter is intentionally reached only after the Production
  // deployment gate. The Auth Admin secret never enters Preview or a client
  // bundle.
  const client = getPrivilegedSupabaseClient();
  return new OwnerRecoveryWorker(
    new SupabaseOwnerRecoveryOutboxRepository(client),
    new SupabaseOwnerRecoveryAuthAdmin(
      createSupabaseOwnerRecoveryAuthGateway(client),
    ),
  );
}
