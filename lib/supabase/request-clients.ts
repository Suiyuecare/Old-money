import { createServerClient } from "@supabase/ssr";

import { CommerceDomainError } from "@/lib/commerce/errors";

interface CookieAdapter {
  getAll(): readonly { readonly name: string; readonly value: string }[];
  setAll(
    values: readonly {
      readonly name: string;
      readonly value: string;
      readonly options?: Record<string, unknown>;
    }[],
  ): void;
}

/**
 * Request-time Auth client only. It is never created during module evaluation
 * or build, and it never receives an Auth Admin/service-role secret.
 */
export function createRequestAuthClient(cookies: CookieAdapter) {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new CommerceDomainError(
      "AUTH_BINDING_UNAVAILABLE",
      "Supabase Auth binding is unavailable.",
      503,
    );
  }
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => [...cookies.getAll()],
      setAll: (values) => cookies.setAll(values),
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

