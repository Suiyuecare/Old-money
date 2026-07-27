import { NextResponse, type NextRequest } from "next/server";
import { buildContentSecurityPolicy } from "@/lib/security";
import { createRequestAuthClient } from "@/lib/supabase/request-clients";

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = buildContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === "development",
    {
      pathname: request.nextUrl.pathname,
      commerceMode:
        process.env.LIGNEE_MODE === "live"
          ? "live"
          : process.env.LIGNEE_MODE === "demo"
            ? "demo"
            : process.env.LIGNEE_MODE === "production-disabled"
            ? "production-disabled"
            : process.env.NODE_ENV === "production"
              ? "production-disabled"
              : "demo",
      adminStorageOrigin: safeSupabaseOrigin(
        process.env.SUPABASE_URL,
      ),
    },
  );
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-lignee-pathname", request.nextUrl.pathname);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  if (
    request.nextUrl.pathname.startsWith("/admin") &&
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_PUBLISHABLE_KEY
  ) {
    const auth = createRequestAuthClient({
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        for (const { name, value, options } of values) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      },
    });
    // Refresh an expired access token if a refresh cookie is present. Pages,
    // actions and route handlers still perform their own authorization checks.
    await auth.auth.getClaims();
  }

  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  // Request-specific nonces must not be paired with a restored stale SSR shell.
  // Fingerprinted Next assets and local images are excluded by the matcher.
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, max-age=0, must-revalidate",
  );
  return response;
}

function safeSupabaseOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const origin = new URL(value).origin;
    return /^https:\/\/[a-z]{20}\.supabase\.co$/.test(origin)
      ? origin
      : undefined;
  } catch {
    return undefined;
  }
}

export const config = {
  matcher: ["/((?!api|_next/|favicon.ico|images/).*)"],
};
