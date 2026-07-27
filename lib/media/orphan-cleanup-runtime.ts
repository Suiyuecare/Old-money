import { CommerceDomainError } from "@/lib/commerce/errors";
import { getPrivilegedSupabaseClient } from "@/lib/supabase/request-clients";

import {
  MediaOrphanCleanupWorker,
  SupabaseMediaOrphanCleanupRepository,
} from "./orphan-cleanup";
import {
  SupabaseMediaStorage,
  getMediaStorageBindings,
} from "./storage";

export function isProductionMediaCleanupEnvironment(
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
    && (environment.SUPABASE_SECRET_KEY?.length ?? 0) >= 20
    && (environment.CRON_SECRET?.length ?? 0) >= 32
  );
}

export function getProductionMediaOrphanCleanupWorker():
MediaOrphanCleanupWorker {
  if (!isProductionMediaCleanupEnvironment()) {
    throw new CommerceDomainError(
      "MEDIA_CLEANUP_WORKER_DISABLED",
      "Media cleanup is available only in the Production deployment.",
      503,
    );
  }
  const client = getPrivilegedSupabaseClient();
  return new MediaOrphanCleanupWorker(
    new SupabaseMediaOrphanCleanupRepository(client),
    new SupabaseMediaStorage(client, getMediaStorageBindings()),
  );
}
