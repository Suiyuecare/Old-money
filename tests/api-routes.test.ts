import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as quote } from "@/app/api/catalog/quote/route";
import { POST as createOrder } from "@/app/api/checkout/orders/route";
import { POST as createCheckout } from "@/app/api/checkout/sessions/route";
import {
  GET as customerReturnGet,
  POST as customerReturnPost,
} from "@/app/checkout/return/route";
import { GET as commerceHealth } from "@/app/api/health/commerce/route";
import { POST as createCanary } from "@/app/api/internal/canary/checkout/route";
import { resetCommerceContainerForTests } from "@/lib/commerce/container";
import {
  DEMO_PUBLIC_COMMANDS_PER_MINUTE,
  resetDemoPublicCommandStateForTests,
} from "@/lib/commerce/demo-public-command";

const origin = "http://localhost:3000";
const headers = {
  "content-type": "application/json",
  origin,
};

const request = (path: string, body: unknown, extraHeaders = headers) =>
  new Request(`${origin}${path}`, {
    method: "POST",
    headers: extraHeaders,
    body: JSON.stringify(body),
  });

const priorMode = process.env.LIGNEE_MODE;

interface QuoteBody {
  readonly quoteDigest: string;
  readonly totals: { readonly grossTwd: number };
  readonly lines: readonly {
    readonly skuId: string;
    readonly quantity: number;
    readonly priceVersion: string;
    readonly unitGrossTwd: number;
    readonly lineGrossTwd: number;
    readonly priceChanged: boolean;
  }[];
}

const orderBodyFromQuote = (
  currentQuote: QuoteBody,
  idempotencyKey: string,
) => ({
  idempotencyKey,
  confirmationToken: "demo-confirmation-token-00000000000000000000",
  emailVerificationToken: "demo-email-token-000000",
  cart: {
    lines: currentQuote.lines.map((line) => ({
      skuId: line.skuId,
      quantity: line.quantity,
      lastSeenPriceVersion: line.priceVersion,
      lastSeenUnitPriceTwd: line.unitGrossTwd,
      acceptedQuoteDigest: currentQuote.quoteDigest,
    })),
  },
});

beforeEach(() => {
  delete process.env.LIGNEE_MODE;
  resetCommerceContainerForTests();
  resetDemoPublicCommandStateForTests();
});

afterEach(() => {
  if (priorMode === undefined) delete process.env.LIGNEE_MODE;
  else process.env.LIGNEE_MODE = priorMode;
});

describe("commerce route boundaries", () => {
  it("quotes current server prices and rejects unknown variants with 409", async () => {
    const response = await quote(
      request("/api/catalog/quote", {
        lines: [
          {
            skuId: "field-house-polo-s-estate-olive",
            quantity: 1,
            lastSeenPriceVersion: "old",
            lastSeenUnitPriceTwd: 1,
          },
        ],
      }),
    );
    const body = (await response.json()) as QuoteBody;
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body.totals.grossTwd).toBe(8_050);
    expect(body.lines[0]?.priceChanged).toBe(true);
    expect(body.lines[0]).toMatchObject({
      unitGrossTwd: 7_800,
      lineGrossTwd: 7_800,
      priceVersion: "sandbox-2026-07-24-v1",
    });
    expect(body.quoteDigest).toMatch(/^[a-f0-9]{64}$/);

    const unavailable = await quote(
      request("/api/catalog/quote", {
        lines: [{ skuId: "unknown", quantity: 1 }],
      }),
    );
    expect(unavailable.status).toBe(409);
    expect(await unavailable.json()).toMatchObject({
      error: { code: "SKU_UNAVAILABLE" },
    });
  });

  it("requires same-origin JSON and creates only deterministic Sandbox records", async () => {
    const checkout = await createCheckout(
      request("/api/checkout/sessions", {
        idempotencyKey: "checkout-session-key-000001",
      }),
    );
    expect(checkout.status).toBe(200);
    expect(await checkout.json()).toMatchObject({
      checkout: {
        id: "demo-checkout-checkout-session",
        emailVerified: false,
      },
      paymentProviderCreated: false,
    });

    const quoteResponse = await quote(
      request("/api/catalog/quote", {
        lines: [
          {
            skuId: "breakfast-room-mug-launch-sample-estate-dark",
            quantity: 1,
          },
        ],
      }),
    );
    const currentQuote = (await quoteResponse.json()) as QuoteBody;
    const body = orderBodyFromQuote(
      currentQuote,
      "checkout-order-key-0000001",
    );
    const first = await createOrder(request("/api/checkout/orders", body));
    const replay = await createOrder(request("/api/checkout/orders", body));
    const firstBody = (await first.json()) as {
      readonly order: { readonly publicId: string };
    };
    const replayBody = (await replay.json()) as {
      readonly order: { readonly publicId: string };
    };
    expect(first.status).toBe(200);
    expect(firstBody.order.publicId).toMatch(/^DEMO-\d{6}$/);
    expect(replayBody.order.publicId).toBe(firstBody.order.publicId);

    const crossOrigin = await createOrder(
      request("/api/checkout/orders", body, {
        ...headers,
        origin: "https://attacker.invalid",
      }),
    );
    expect(crossOrigin.status).toBe(403);

    const crossScheme = await createCheckout(
      request(
        "/api/checkout/sessions",
        { idempotencyKey: "cross-scheme-session-key-0001" },
        {
          ...headers,
          origin: "https://localhost:3000",
        },
      ),
    );
    expect(crossScheme.status).toBe(403);

    const rewrittenInternalUrl = new Request(
      "http://localhost:3000/api/checkout/sessions",
      {
        method: "POST",
        headers: {
          ...headers,
          host: "127.0.0.1:3000",
          origin: "http://127.0.0.1:3000",
          "x-forwarded-proto": "http",
        },
        body: JSON.stringify({
          idempotencyKey: "rewritten-url-session-key-0001",
        }),
      },
    );
    const rewrittenResponse = await createCheckout(rewrittenInternalUrl);
    expect(rewrittenResponse.status).toBe(200);
  });

  it("returns PRICE_CHANGED safely, accepts the current snapshot, and replays the same key", async () => {
    const quoteResponse = await quote(
      request("/api/catalog/quote", {
        lines: [
          {
            skuId: "field-house-polo-s-estate-olive",
            quantity: 2,
            lastSeenPriceVersion: "stale-version",
            lastSeenUnitPriceTwd: 1,
          },
        ],
      }),
    );
    const currentQuote = (await quoteResponse.json()) as QuoteBody;
    const staleBody = {
      ...orderBodyFromQuote(currentQuote, "price-change-order-key-0001"),
      cart: {
        lines: currentQuote.lines.map((line) => ({
          skuId: line.skuId,
          quantity: line.quantity,
          lastSeenPriceVersion: "stale-version",
          lastSeenUnitPriceTwd: 1,
          acceptedQuoteDigest: currentQuote.quoteDigest,
        })),
      },
    };
    const stale = await createOrder(request("/api/checkout/orders", staleBody));
    const staleResponse = (await stale.json()) as {
      readonly error: {
        readonly code: string;
        readonly details: { readonly quote: QuoteBody };
      };
    };
    expect(stale.status).toBe(409);
    expect(staleResponse.error.code).toBe("PRICE_CHANGED");
    expect(staleResponse.error.details.quote).toMatchObject({
      quoteDigest: currentQuote.quoteDigest,
      lines: [
        {
          priceVersion: currentQuote.lines[0]?.priceVersion,
          unitGrossTwd: 7_800,
          lineGrossTwd: 15_600,
        },
      ],
    });

    const acceptedBody = orderBodyFromQuote(
      staleResponse.error.details.quote,
      "price-change-order-key-0002",
    );
    const accepted = await createOrder(
      request("/api/checkout/orders", acceptedBody),
    );
    const replay = await createOrder(
      request("/api/checkout/orders", acceptedBody),
    );
    const acceptedJson = (await accepted.json()) as {
      readonly order: { readonly publicId: string; readonly status: string };
    };
    const replayJson = (await replay.json()) as typeof acceptedJson;
    expect(accepted.status).toBe(200);
    expect(acceptedJson.order.status).toBe("awaiting_payment");
    expect(replayJson.order.publicId).toBe(acceptedJson.order.publicId);
  });

  it("accepts reversed order lines only against the identical canonical financial quote", async () => {
    const quoteResponse = await quote(
      request("/api/catalog/quote", {
        lines: [
          {
            skuId: "field-house-polo-s-estate-olive",
            quantity: 1,
          },
          {
            skuId: "breakfast-room-mug-launch-sample-estate-dark",
            quantity: 2,
          },
        ],
      }),
    );
    const currentQuote = (await quoteResponse.json()) as QuoteBody;
    const body = orderBodyFromQuote(
      currentQuote,
      "canonical-reversed-order-key-0001",
    );
    const reversedBody = {
      ...body,
      cart: { lines: [...body.cart.lines].reverse() },
    };
    const accepted = await createOrder(
      request("/api/checkout/orders", reversedBody),
    );
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({
      quoteDigest: currentQuote.quoteDigest,
      order: { totals: currentQuote.totals },
    });

    const mismatched = {
      ...reversedBody,
      idempotencyKey: "canonical-reversed-order-key-0002",
      cart: {
        lines: reversedBody.cart.lines.map((line, index) => ({
          ...line,
          acceptedQuoteDigest:
            index === 0 ? "a".repeat(64) : line.acceptedQuoteDigest,
        })),
      },
    };
    const rejected = await createOrder(
      request("/api/checkout/orders", mismatched),
    );
    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toMatchObject({
      error: { code: "PRICE_CHANGED" },
    });
  });

  it("shares the anonymous command limit while allowing an accepted replay at capacity", async () => {
    const acceptedBody = {
      idempotencyKey: "shared-limit-session-key-0000",
    };
    const accepted = await createCheckout(
      request("/api/checkout/sessions", acceptedBody),
    );
    expect(accepted.status).toBe(200);

    for (let index = 1; index < DEMO_PUBLIC_COMMANDS_PER_MINUTE; index += 1) {
      const response = await createCheckout(
        request("/api/checkout/sessions", {
          idempotencyKey: `shared-limit-session-key-${String(index).padStart(4, "0")}`,
        }),
      );
      expect(response.status, `new command ${index}`).toBe(200);
    }

    const currentQuote = (await (
      await quote(
        request("/api/catalog/quote", {
          lines: [
            {
              skuId: "breakfast-room-mug-launch-sample-estate-dark",
              quantity: 1,
            },
          ],
        }),
      )
    ).json()) as QuoteBody;
    const exhaustedOrder = await createOrder(
      request(
        "/api/checkout/orders",
        orderBodyFromQuote(currentQuote, "shared-limit-order-key-0001"),
      ),
    );
    expect(exhaustedOrder.status).toBe(429);

    const replay = await createCheckout(
      request("/api/checkout/sessions", acceptedBody),
    );
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      checkout: { id: "demo-checkout-shared-limit-ses" },
    });
  });

  it("serializes concurrent equal retry keys before shared rate admission", async () => {
    const repeatedBody = {
      idempotencyKey: "concurrent-session-key-0001",
    };
    const concurrent = await Promise.all(
      Array.from({ length: DEMO_PUBLIC_COMMANDS_PER_MINUTE + 3 }, () =>
        createCheckout(
          request("/api/checkout/sessions", repeatedBody),
        ),
      ),
    );
    expect(concurrent.every((response) => response.status === 200)).toBe(true);
    const publicIds = await Promise.all(
      concurrent.map(async (response) => {
        const body = (await response.json()) as {
          readonly checkout: { readonly id: string };
        };
        return body.checkout.id;
      }),
    );
    expect(new Set(publicIds)).toEqual(
      new Set(["demo-checkout-concurrent-sessi"]),
    );

    for (
      let index = 1;
      index < DEMO_PUBLIC_COMMANDS_PER_MINUTE;
      index += 1
    ) {
      const response = await createCheckout(
        request("/api/checkout/sessions", {
          idempotencyKey: `concurrent-unique-key-${String(index).padStart(4, "0")}`,
        }),
      );
      expect(response.status, `new command ${index}`).toBe(200);
    }
    const exhausted = await createCheckout(
      request("/api/checkout/sessions", {
        idempotencyKey: "concurrent-unique-key-exhausted",
      }),
    );
    expect(exhausted.status).toBe(429);
  });

  it("rejects duplicate SKU rows for both quote and order boundaries", async () => {
    const duplicateLines = [
      {
        skuId: "field-house-polo-s-estate-olive",
        quantity: 3,
        lastSeenPriceVersion: "sandbox-2026-07-24-v1",
        lastSeenUnitPriceTwd: 7_800,
        acceptedQuoteDigest: "a".repeat(64),
      },
      {
        skuId: "field-house-polo-s-estate-olive",
        quantity: 3,
        lastSeenPriceVersion: "sandbox-2026-07-24-v1",
        lastSeenUnitPriceTwd: 7_800,
        acceptedQuoteDigest: "a".repeat(64),
      },
    ];
    const duplicateQuote = await quote(
      request("/api/catalog/quote", {
        lines: duplicateLines.map((line) => ({
          skuId: line.skuId,
          quantity: line.quantity,
          lastSeenPriceVersion: line.lastSeenPriceVersion,
          lastSeenUnitPriceTwd: line.lastSeenUnitPriceTwd,
        })),
      }),
    );
    const duplicateOrder = await createOrder(
      request("/api/checkout/orders", {
        idempotencyKey: "duplicate-six-units-key-0001",
        confirmationToken: "demo-confirmation-token-00000000000000000000",
        emailVerificationToken: "demo-email-token-000000",
        cart: { lines: duplicateLines },
      }),
    );
    expect(duplicateQuote.status).toBe(400);
    expect(duplicateOrder.status).toBe(400);
    expect(await duplicateQuote.json()).toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });
    expect(await duplicateOrder.json()).toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });
  });

  it("treats GET and POST customer returns as non-authoritative navigation only", async () => {
    const quoteResponse = await quote(
      request("/api/catalog/quote", {
        lines: [
          {
            skuId: "correspondence-pen-launch-sample-estate-dark",
            quantity: 1,
          },
        ],
      }),
    );
    const currentQuote = (await quoteResponse.json()) as QuoteBody;
    const orderCommand = orderBodyFromQuote(
      currentQuote,
      "customer-return-authority-key-0001",
    );
    const created = await createOrder(
      request("/api/checkout/orders", orderCommand),
    );
    expect(created.status).toBe(200);

    const getResponse = await customerReturnGet(
      new Request(
        `${origin}/checkout/return?RtnCode=1&MerchantTradeNo=forged&CustomField1=private`,
      ),
    );
    const postResponse = await customerReturnPost(
      new Request(`${origin}/checkout/return`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "RtnCode=1&MerchantTradeNo=forged&TradeStatus=paid&Email=private%40invalid",
      }),
    );
    for (const response of [getResponse, postResponse]) {
      expect(response.status).toBe(303);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("location")).toBe(
        `${origin}/orders?state=payment-confirming`,
      );
      expect(response.headers.get("location")?.toLowerCase()).not.toContain("paid");
      expect(response.headers.get("location")).not.toContain("private");
    }

    const unchanged = await createOrder(
      request("/api/checkout/orders", orderCommand),
    );
    expect(await unchanged.json()).toMatchObject({
      order: { status: "awaiting_payment" },
      paymentCreated: false,
    });
  });

  it("fails closed for production routes when shared controls are absent", async () => {
    process.env.LIGNEE_MODE = "production-disabled";
    const checkout = await createCheckout(
      request("/api/checkout/sessions", {
        idempotencyKey: "production-disabled-key-0001",
      }),
    );
    const order = await createOrder(
      request("/api/checkout/orders", {
        idempotencyKey: "production-disabled-order-0001",
        confirmationToken: "x".repeat(32),
        emailVerificationToken: "x".repeat(16),
        cart: {
          lines: [
            {
              skuId: "breakfast-room-mug-launch-sample-estate-dark",
              quantity: 1,
              lastSeenPriceVersion: "sandbox-2026-07-24-v1",
              lastSeenUnitPriceTwd: 2_200,
              acceptedQuoteDigest: "a".repeat(64),
            },
          ],
        },
      }),
    );
    const canary = await createCanary(
      request("/api/internal/canary/checkout", {}),
    );
    expect(checkout.status).toBe(503);
    expect(order.status).toBe(503);
    expect(canary.status).toBe(503);
  });

  it("reports explicit disabled state without exposing secrets", async () => {
    process.env.LIGNEE_MODE = "production-disabled";
    const response = await commerceHealth();
    const body = (await response.json()) as Readonly<Record<string, unknown>>;
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      mode: "production-disabled",
      commerceCapable: false,
      controlsSource: "fail-closed-env",
    });
    expect(JSON.stringify(body).toLowerCase()).not.toContain("hashkey");
  });
});
