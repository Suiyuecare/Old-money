import { parseProductionEnvironment } from "@/lib/env-schema";

export async function register(): Promise<void> {
  // Vercel Production must prove every production-disabled binding at server
  // startup. Preview and local builds retain their bounded demo adapters.
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NODE_ENV === "production" &&
    process.env.VERCEL === "1" &&
    process.env.VERCEL_ENV === "production"
  ) {
    parseProductionEnvironment(process.env);
  }
}
