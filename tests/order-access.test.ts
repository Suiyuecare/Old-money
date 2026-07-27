import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as exchangeAccess } from "@/app/api/order-access/exchanges/route";
import { POST as requestAccess } from "@/app/api/order-access/requests/route";
import {
  DELETE as revokeAccess,
  GET as readAccess,
} from "@/app/api/order-access/session/route";
import {
  getSandboxAccessDeliveryForTests,
  resetSandboxOrderAccessForTests,
} from "@/lib/order-access/container";
import {
  ORDER_ACCESS_COOKIE,
  ORDER_ACCESS_LINK_TTL_MS,
  ORDER_ACCESS_SESSION_TTL_MS,
} from "@/lib/order-access/contracts";
import { requestPrincipalFrom } from "@/lib/order-access/service";

const origin = "http://localhost:3000";
const initialNow = Date.parse("2026-07-28T02:00:00.000Z");
let now = initialNow;

const previous = {
  mode: process.env.LIGNEE_MODE,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseSecret: process.env.SUPABASE_SECRET_KEY,
  tokenSecret: process.env.ORDER_ACCESS_TOKEN_SECRET,
  lookupSecret: process.env.ORDER_ACCESS_LOOKUP_SECRET,
  vercel: process.env.VERCEL,
};

function jsonRequest(
  path: string,
  body: unknown,
  requestOrigin = origin,
  ip = "203.0.113.10",
) {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: requestOrigin,
      "sec-fetch-site":
        requestOrigin === origin ? "same-origin" : "cross-site",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

const requestBody = (
  idempotencyKey: string,
  email = "buyer@example.com",
) => ({
  publicId: "LIG-20260727-1001",
  email,
  idempotencyKey,
});

function cookiePair(setCookie: string): string {
  return setCookie.split(";", 1)[0] ?? "";
}

beforeEach(() => {
  now = initialNow;
  process.env.LIGNEE_MODE = "demo";
  resetSandboxOrderAccessForTests({ now: () => now });
});

afterEach(() => {
  if (previous.mode === undefined) delete process.env.LIGNEE_MODE;
  else process.env.LIGNEE_MODE = previous.mode;
  if (previous.supabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = previous.supabaseUrl;
  if (previous.supabaseSecret === undefined) {
    delete process.env.SUPABASE_SECRET_KEY;
  } else {
    process.env.SUPABASE_SECRET_KEY = previous.supabaseSecret;
  }
  if (previous.tokenSecret === undefined) {
    delete process.env.ORDER_ACCESS_TOKEN_SECRET;
  } else {
    process.env.ORDER_ACCESS_TOKEN_SECRET = previous.tokenSecret;
  }
  if (previous.lookupSecret === undefined) {
    delete process.env.ORDER_ACCESS_LOOKUP_SECRET;
  } else {
    process.env.ORDER_ACCESS_LOOKUP_SECRET = previous.lookupSecret;
  }
  if (previous.vercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = previous.vercel;
});

describe("guest order access boundary", () => {
  it("uses Vercel's non-spoofable forwarding header as the rate-limit principal", () => {
    process.env.VERCEL = "1";
    const request = new Request(`${origin}/api/order-access/requests`, {
      headers: {
        "x-vercel-forwarded-for": "203.0.113.50",
        "x-forwarded-for": "198.51.100.8, 203.0.113.50",
      },
    });
    expect(requestPrincipalFrom(request)).toBe("203.0.113.50");
  });

  it("uses a single-use email token and an HttpOnly scoped session", async () => {
    const requestResponse = await requestAccess(
      jsonRequest(
        "/api/order-access/requests",
        requestBody("order-access-request-000001"),
      ),
    );
    expect(requestResponse.status).toBe(202);
    expect(requestResponse.headers.get("cache-control")).toContain(
      "no-store",
    );
    expect(await requestResponse.json()).toEqual({ accepted: true });

    const delivery = getSandboxAccessDeliveryForTests(
      "LIG-20260727-1001",
    );
    expect(delivery?.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(delivery?.expiresAt).toBe(
      new Date(initialNow + ORDER_ACCESS_LINK_TTL_MS).toISOString(),
    );

    const exchangeResponse = await exchangeAccess(
      jsonRequest("/api/order-access/exchanges", {
        token: delivery?.token,
      }),
    );
    expect(exchangeResponse.status).toBe(200);
    const exchangeBody = await exchangeResponse.json();
    expect(exchangeBody).toEqual({
      granted: true,
      order: {
        publicId: "LIG-20260727-1001",
        status: "processing",
        paymentStatus: "paid",
        shipmentStatus: "label_pending",
        grossTwd: 9_800,
        trackingIds: [],
        updatedAt: "2026-07-28T01:00:00.000Z",
      },
    });
    expect(JSON.stringify(exchangeBody)).not.toContain(
      "buyer@example.com",
    );

    const setCookie = exchangeResponse.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${ORDER_ACCESS_COOKIE}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).not.toContain(delivery?.token ?? "missing");
    expect(setCookie).not.toContain("buyer@example.com");

    const replay = await exchangeAccess(
      jsonRequest("/api/order-access/exchanges", {
        token: delivery?.token,
      }),
    );
    expect(replay.status).toBe(401);
    expect(await replay.json()).toMatchObject({
      error: { code: "ORDER_ACCESS_DENIED" },
    });

    const session = await readAccess(
      new Request(`${origin}/api/order-access/session`, {
        headers: { cookie: cookiePair(setCookie) },
      }),
    );
    expect(session.status).toBe(200);
    expect(await session.json()).toEqual({
      order: exchangeBody.order,
    });

    const revoked = await revokeAccess(
      new Request(`${origin}/api/order-access/session`, {
        method: "DELETE",
        headers: {
          cookie: cookiePair(setCookie),
          origin,
          "sec-fetch-site": "same-origin",
        },
      }),
    );
    expect(revoked.status).toBe(200);
    expect(revoked.headers.get("set-cookie")).toContain("Max-Age=0");

    const afterRevoke = await readAccess(
      new Request(`${origin}/api/order-access/session`, {
        headers: { cookie: cookiePair(setCookie) },
      }),
    );
    expect(afterRevoke.status).toBe(401);
  });

  it("does not disclose whether an order/email pair exists", async () => {
    const unknown = await requestAccess(
      jsonRequest(
        "/api/order-access/requests",
        requestBody(
          "order-access-request-unknown-0001",
          "wrong@example.com",
        ),
      ),
    );
    const unknownEnvelope = {
      status: unknown.status,
      body: await unknown.text(),
      cache: unknown.headers.get("cache-control"),
    };
    expect(
      getSandboxAccessDeliveryForTests("LIG-20260727-1001"),
    ).toBeNull();

    resetSandboxOrderAccessForTests({ now: () => now });
    const known = await requestAccess(
      jsonRequest(
        "/api/order-access/requests",
        requestBody("order-access-request-known-00001"),
      ),
    );
    expect({
      status: known.status,
      body: await known.text(),
      cache: known.headers.get("cache-control"),
    }).toEqual(unknownEnvelope);
    expect(
      getSandboxAccessDeliveryForTests("LIG-20260727-1001"),
    ).not.toBeNull();
  });

  it("replays the same request token and conflicts on changed payload", async () => {
    const body = requestBody("order-access-idempotency-0001");
    await requestAccess(
      jsonRequest("/api/order-access/requests", body),
    );
    const first = getSandboxAccessDeliveryForTests(
      body.publicId,
    );
    await requestAccess(
      jsonRequest("/api/order-access/requests", body),
    );
    const replay = getSandboxAccessDeliveryForTests(
      body.publicId,
    );
    expect(replay?.challengeId).toBe(first?.challengeId);
    expect(replay?.token).toBe(first?.token);

    const conflict = await requestAccess(
      jsonRequest(
        "/api/order-access/requests",
        requestBody(
          "order-access-idempotency-0001",
          "changed@example.com",
        ),
      ),
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });
  });

  it("expires links and sessions and rejects duplicate cookie shadowing", async () => {
    await requestAccess(
      jsonRequest(
        "/api/order-access/requests",
        requestBody("order-access-expiry-link-0001"),
      ),
    );
    const expiredDelivery = getSandboxAccessDeliveryForTests(
      "LIG-20260727-1001",
    );
    now += ORDER_ACCESS_LINK_TTL_MS;
    const expiredExchange = await exchangeAccess(
      jsonRequest("/api/order-access/exchanges", {
        token: expiredDelivery?.token,
      }),
    );
    expect(expiredExchange.status).toBe(401);

    now = initialNow;
    resetSandboxOrderAccessForTests({ now: () => now });
    await requestAccess(
      jsonRequest(
        "/api/order-access/requests",
        requestBody("order-access-expiry-session-001"),
      ),
    );
    const delivery = getSandboxAccessDeliveryForTests(
      "LIG-20260727-1001",
    );
    const exchange = await exchangeAccess(
      jsonRequest("/api/order-access/exchanges", {
        token: delivery?.token,
      }),
    );
    const pair = cookiePair(
      exchange.headers.get("set-cookie") ?? "",
    );
    const duplicateCookie = await readAccess(
      new Request(`${origin}/api/order-access/session`, {
        headers: { cookie: `${pair}; ${pair}` },
      }),
    );
    expect(duplicateCookie.status).toBe(401);

    now += ORDER_ACCESS_SESSION_TTL_MS;
    const expiredSession = await readAccess(
      new Request(`${origin}/api/order-access/session`, {
        headers: { cookie: pair },
      }),
    );
    expect(expiredSession.status).toBe(401);
    expect(expiredSession.headers.get("set-cookie")).toContain(
      "Max-Age=0",
    );
  });

  it("rate limits requests per hashed principal", async () => {
    for (let index = 0; index < 5; index += 1) {
      const response = await requestAccess(
        jsonRequest(
          "/api/order-access/requests",
          requestBody(
            `order-access-rate-limit-000${index}`,
            `wrong-${index}@example.com`,
          ),
        ),
      );
      expect(response.status).toBe(202);
    }
    const limited = await requestAccess(
      jsonRequest(
        "/api/order-access/requests",
        requestBody(
          "order-access-rate-limit-0005",
          "wrong-5@example.com",
        ),
      ),
    );
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({
      error: { code: "ORDER_ACCESS_RATE_LIMITED" },
    });
  });

  it("rejects cross-origin mutations and fails closed without durable bindings", async () => {
    const crossOrigin = await requestAccess(
      jsonRequest(
        "/api/order-access/requests",
        requestBody("order-access-cross-origin-0001"),
        "https://attacker.invalid",
      ),
    );
    expect(crossOrigin.status).toBe(403);

    const crossOriginRevoke = await revokeAccess(
      new Request(`${origin}/api/order-access/session`, {
        method: "DELETE",
        headers: {
          origin: "https://attacker.invalid",
          "sec-fetch-site": "cross-site",
        },
      }),
    );
    expect(crossOriginRevoke.status).toBe(403);

    process.env.LIGNEE_MODE = "production-disabled";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.ORDER_ACCESS_TOKEN_SECRET;
    delete process.env.ORDER_ACCESS_LOOKUP_SECRET;
    const unavailable = await requestAccess(
      jsonRequest(
        "/api/order-access/requests",
        requestBody("order-access-fail-closed-0001"),
      ),
    );
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({
      error: { code: "ORDER_ACCESS_REPOSITORY_UNAVAILABLE" },
    });
  });
});
