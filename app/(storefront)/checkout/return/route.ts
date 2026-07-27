import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const safeReturn = (request: Request): NextResponse => {
  // Browser return fields are intentionally neither parsed nor persisted. They
  // are navigation hints only and can never authorize a payment transition.
  const location = new URL("/orders", request.url);
  location.searchParams.set("state", "payment-confirming");
  const response = NextResponse.redirect(location, 303);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
};

export const GET = safeReturn;
export const POST = safeReturn;
