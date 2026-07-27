import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { CommerceDomainError } from "@/lib/commerce/errors";

interface CookieAdapter {
  getAll(): readonly { readonly name: string; readonly value: string }[];
  setAll(
    values: readonly {
      readonly name: string;
      readonly value: string;
      readonly options?: CookieOptions;
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
  });
}

let privilegedClient: SupabaseClient | undefined;
let publicClient: SupabaseClient | undefined;

/**
 * Anonymous server-side client for deliberately public RPCs. Keeping this
 * separate from the privileged client makes the database GRANT/RLS boundary
 * part of every public catalog and media request.
 */
export function getPublicSupabaseClient(): SupabaseClient {
  if (publicClient) return publicClient;

  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new CommerceDomainError(
      "PUBLIC_DATABASE_BINDING_UNAVAILABLE",
      "The public Supabase binding is unavailable.",
      503,
    );
  }

  publicClient = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  return publicClient;
}

/**
 * Server-only client for the narrow Auth Admin and private Storage operations
 * that cannot be performed with an administrator's JWT. Never import this
 * getter from a Client Component.
 */
export function getPrivilegedSupabaseClient(): SupabaseClient {
  if (privilegedClient) return privilegedClient;

  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new CommerceDomainError(
      "PRIVILEGED_BINDING_UNAVAILABLE",
      "Privileged Supabase binding is unavailable.",
      503,
    );
  }

  privilegedClient = createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  return privilegedClient;
}
