import { NextResponse, type NextRequest } from "next/server";
import { buildContentSecurityPolicy } from "@/lib/security";

export function proxy(request: NextRequest) {
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
    },
  );
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  // Request-specific nonces must not be paired with a restored stale SSR shell.
  // Fingerprinted Next assets and local images are excluded by the matcher.
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, max-age=0, must-revalidate",
  );
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/|favicon.ico|images/).*)"],
};
