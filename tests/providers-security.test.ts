import { describe, expect, it } from "vitest";

import { serializeSafeJsonLd } from "@/components/seo/SafeJsonLd";
import { createOrderTotalsSnapshot } from "@/lib/commerce/money";
import { checkoutContactSchema, quoteRequestSchema } from "@/lib/commerce/validation";
import {
  assertVerifiedEcpayCallback,
  buildEcpayRedirectForm,
  createEcpayCheckMacValue,
  verifyEcpayCheckMacValue,
  type EcpayCredential,
} from "@/lib/providers/ecpay";
import {
  invoiceOptionSchema,
  toEcpayInvoiceFields,
} from "@/lib/providers/invoice-schema";
import {
  decryptEnvelope,
  encryptEnvelope,
  hmacLookup,
  verifyHmacValue,
  type EnvelopeContext,
} from "@/lib/security/crypto";
import { redactForLog } from "@/lib/security/redaction";

const sandboxCredential: EcpayCredential = {
  merchantId: "2000132",
  hashKey: "5294y06JbISpM5x9",
  hashIv: "v77hoKGq4kWxNNIS",
  environment: "sandbox",
};

const totals = createOrderTotalsSnapshot([
  {
    skuId: "breakfast-room-mug-launch-sample-estate-dark",
    quantity: 1,
    priceVersion: "sandbox-v1",
    unitGrossTwd: 2_200,
  },
]);

describe("ECPay cryptographic boundary", () => {
  it("signs canonical fields, verifies exact callbacks, and rejects tampering", () => {
    const fields = {
      MerchantID: sandboxCredential.merchantId,
      MerchantTradeNo: "LIG20260724000000001",
      TradeAmt: "2200",
      RtnCode: "1",
    };
    const signed = {
      ...fields,
      CheckMacValue: createEcpayCheckMacValue(fields, sandboxCredential),
    };
    expect(signed.CheckMacValue).toMatch(/^[A-F0-9]{64}$/);
    expect(verifyEcpayCheckMacValue(signed, sandboxCredential)).toBe(true);
    expect(
      verifyEcpayCheckMacValue({ ...signed, TradeAmt: "2201" }, sandboxCredential),
    ).toBe(false);
    expect(() =>
      assertVerifiedEcpayCallback(signed, sandboxCredential, {
        merchantTradeNo: fields.MerchantTradeNo,
        amountTwd: 2_200,
      }),
    ).not.toThrow();
    expect(() =>
      assertVerifiedEcpayCallback(signed, sandboxCredential, {
        merchantTradeNo: fields.MerchantTradeNo,
        amountTwd: 2_201,
      }),
    ).toThrowError(/does not match/);
  });

  it("uses exact sandbox/live endpoints and gates Apple Pay in the payload", () => {
    const base = {
      merchantTradeNo: "LIG20260724000000001",
      totals,
      itemName: "Breakfast Room Mug",
      callbackUrl:
        "https://estatelignee.com/api/webhooks/ecpay/payment" as const,
      returnUrl: "https://estatelignee.com/checkout/return" as const,
      now: new Date("2026-07-24T00:00:00.000Z"),
    };
    const sandbox = buildEcpayRedirectForm({
      ...base,
      credential: sandboxCredential,
      applePayEnabled: false,
    });
    const live = buildEcpayRedirectForm({
      ...base,
      credential: { ...sandboxCredential, environment: "live" },
      applePayEnabled: true,
    });
    expect(sandbox.endpoint).toBe(
      "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
    );
    expect(sandbox.fields.IgnorePayment).toBe("ApplePay");
    expect(live.endpoint).toBe(
      "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5",
    );
    expect(live.fields.IgnorePayment).toBeUndefined();
    expect(verifyEcpayCheckMacValue(sandbox.fields, sandboxCredential)).toBe(true);
  });
});

describe("invoice and checkout validation", () => {
  it("maps all four approved invoice options without accepting extra fields", () => {
    const fixtures = [
      { kind: "ecpay_email", email: "buyer@example.com" },
      { kind: "mobile_barcode", mobileBarcode: "/ABC12+." },
      { kind: "donation", loveCode: "12345" },
      {
        kind: "company",
        companyIdentifier: "12345675",
        companyName: "測試股份有限公司",
        carrier: { type: "email", email: "accounting@example.com" },
      },
    ] as const;
    for (const fixture of fixtures) {
      const parsed = invoiceOptionSchema.parse(fixture);
      expect(toEcpayInvoiceFields(parsed).Print).toBe("0");
    }
    expect(
      invoiceOptionSchema.safeParse({
        ...fixtures[0],
        unapproved: "field",
      }).success,
    ).toBe(false);
  });

  it("rejects offshore delivery, malformed contacts, and cart-limit bypasses", () => {
    const validContact = {
      recipientName: "測試收件人",
      email: "buyer@example.com",
      mobile: "0912345678",
      shippingAddress: {
        postalCode: "100",
        city: "臺北市",
        district: "中正區",
        addressLine: "測試路一段一號",
      },
      invoice: { kind: "ecpay_email", email: "buyer@example.com" },
    };
    expect(checkoutContactSchema.safeParse(validContact).success).toBe(true);
    expect(
      checkoutContactSchema.safeParse({
        ...validContact,
        shippingAddress: {
          ...validContact.shippingAddress,
          city: "澎湖縣",
        },
      }).success,
    ).toBe(false);
    expect(
      quoteRequestSchema.safeParse({
        lines: [{ skuId: "sku", quantity: 4 }],
      }).success,
    ).toBe(false);
    expect(
      quoteRequestSchema.safeParse({
        lines: Array.from({ length: 11 }, (_, index) => ({
          skuId: `sku-${index}`,
          quantity: 1,
        })),
      }).success,
    ).toBe(false);
  });
});

describe("PII encryption, lookup, redaction, and JSON-LD escaping", () => {
  it("authenticates ciphertext against its row and column context", () => {
    const key = Buffer.alloc(32, 7);
    const context: EnvelopeContext = {
      schema: "commerce_private",
      table: "order_pii",
      rowId: "order-1",
      column: "email",
      schemaVersion: 1,
    };
    const encrypted = encryptEnvelope("buyer@example.com", context, key, 1);
    expect(encrypted.ciphertext).not.toContain("buyer");
    expect(decryptEnvelope(encrypted, context, key)).toBe("buyer@example.com");
    expect(() =>
      decryptEnvelope(encrypted, { ...context, rowId: "order-2" }, key),
    ).toThrowError(/failed authentication/);
  });

  it("purpose-separates lookup HMACs and performs timing-safe comparisons", () => {
    const key = Buffer.alloc(32, 9);
    const emailHash = hmacLookup("order-email", "buyer@example.com", key);
    expect(emailHash).not.toBe(hmacLookup("newsletter-email", "buyer@example.com", key));
    expect(verifyHmacValue(emailHash, emailHash)).toBe(true);
    expect(verifyHmacValue(`${emailHash}x`, emailHash)).toBe(false);
  });

  it("redacts nested sensitive keys and neutralizes script-breaking JSON", () => {
    expect(
      redactForLog({
        requestId: "request-1",
        payload: {
          email: "buyer@example.com",
          authorization: "Bearer secret",
          status: "queued",
        },
      }),
    ).toEqual({
      requestId: "request-1",
      payload: {
        email: "[REDACTED]",
        authorization: "[REDACTED]",
        status: "queued",
      },
    });
    const serialized = serializeSafeJsonLd({
      name: "</script><script>alert(1)</script>",
      text: "a\u2028b\u2029c&",
    });
    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toContain("\u2028");
    expect(serialized).not.toContain("\u2029");
    expect(serialized).toContain("\\u003c");
    expect(serialized).toContain("\\u0026");
  });
});
