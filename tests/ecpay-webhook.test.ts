import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as paymentCallback } from "@/app/api/webhooks/ecpay/payment/route";
import {
  getSandboxOperationsRepository,
  resetSandboxOperationsForTests,
} from "@/lib/operations/container";
import { operationsCommandSchema } from "@/lib/operations/contracts";
import { createEcpayCheckMacValue } from "@/lib/providers/ecpay";

const credential = {
  merchantId: "2000132",
  hashKey: "5294y06JbISpM5x9",
  hashIv: "v77hoKGq4kWxNNIS",
};
const previous = {
  mode: process.env.LIGNEE_MODE,
  merchantId: process.env.ECPAY_MERCHANT_ID,
  hashKey: process.env.ECPAY_HASH_KEY,
  hashIv: process.env.ECPAY_HASH_IV,
};

function signedFields(overrides: Readonly<Record<string, string>> = {}) {
  const fields = {
    MerchantID: credential.merchantId,
    MerchantTradeNo: "D000000000000000001",
    TradeNo: "250728000000001",
    TradeAmt: "9800",
    RtnCode: "1",
    PaymentType: "Credit_CreditCard",
    PaymentDate: "2026/07/28 09:00:00",
    SimulatePaid: "1",
    ...overrides,
  };
  return {
    ...fields,
    CheckMacValue: createEcpayCheckMacValue(fields, credential),
  };
}

function callbackRequest(fields: Readonly<Record<string, string>>) {
  return new Request(
    "https://estatelignee.com/api/webhooks/ecpay/payment",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(fields).toString(),
    },
  );
}

beforeEach(() => {
  process.env.LIGNEE_MODE = "demo";
  process.env.ECPAY_MERCHANT_ID = credential.merchantId;
  Reflect.set(process.env, "ECPAY_HASH_KEY", credential.hashKey);
  Reflect.set(process.env, "ECPAY_HASH_IV", credential.hashIv);
  resetSandboxOperationsForTests({
    now: () => Date.parse("2026-07-28T01:00:00.000Z"),
  });
});

afterEach(() => {
  if (previous.mode === undefined) delete process.env.LIGNEE_MODE;
  else process.env.LIGNEE_MODE = previous.mode;
  if (previous.merchantId === undefined) {
    delete process.env.ECPAY_MERCHANT_ID;
  } else {
    process.env.ECPAY_MERCHANT_ID = previous.merchantId;
  }
  if (previous.hashKey === undefined) delete process.env.ECPAY_HASH_KEY;
  else Reflect.set(process.env, "ECPAY_HASH_KEY", previous.hashKey);
  if (previous.hashIv === undefined) delete process.env.ECPAY_HASH_IV;
  else Reflect.set(process.env, "ECPAY_HASH_IV", previous.hashIv);
});

describe("ECPay durable callback boundary", () => {
  it("acknowledges only after inbox persistence and reconciliation enqueue", async () => {
    const response = await paymentCallback(
      callbackRequest(signedFields()),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toBe("1|OK");

    const repository = getSandboxOperationsRepository();
    const inbox = await repository.listQueue({
      kind: "provider_events",
      limit: 20,
      offset: 0,
    });
    expect(inbox).toMatchObject({ total: 1 });
    expect(inbox.items).toEqual([
      expect.objectContaining({
        verified: true,
        providerObjectId: "D000000000000000001",
        normalizedStatus: "provider-reported-paid",
        reconciliationOperationKey: expect.any(String),
        redactedPayload: expect.not.objectContaining({
          CheckMacValue: expect.anything(),
        }),
      }),
    ]);
    const operations = await repository.listQueue({
      kind: "provider_operations",
      limit: 20,
      offset: 0,
    });
    expect(operations.items).toEqual([
      expect.objectContaining({
        type: "payment.query",
        safety: "safe_query",
        state: "queued",
      }),
    ]);
  });

  it("acknowledges exact replays without duplicating inbox or query jobs", async () => {
    const fields = signedFields();
    const first = await paymentCallback(callbackRequest(fields));
    const replay = await paymentCallback(callbackRequest(fields));
    expect(await first.text()).toBe("1|OK");
    expect(await replay.text()).toBe("1|OK");

    const repository = getSandboxOperationsRepository();
    expect(
      await repository.listQueue({
        kind: "provider_events",
        limit: 20,
        offset: 0,
      }),
    ).toMatchObject({ total: 1 });
    expect(
      await repository.listQueue({
        kind: "provider_operations",
        limit: 20,
        offset: 0,
      }),
    ).toMatchObject({ total: 1 });
  });

  it("does not acknowledge invalid signatures or durable inbox failure", async () => {
    const invalid = signedFields();
    const invalidResponse = await paymentCallback(
      callbackRequest({ ...invalid, TradeAmt: "1" }),
    );
    expect(invalidResponse.status).toBe(401);
    expect(await invalidResponse.text()).not.toBe("1|OK");

    const repository = getSandboxOperationsRepository();
    for (let index = 0; index < 512; index += 1) {
      await repository.recordProviderEvent({
        provider: "capacity-test",
        eventType: "fixture",
        providerObjectId: `fixture-${index}`,
        normalizedStatus: "stored",
        fingerprint: String(index).padStart(64, "0"),
        verified: true,
        redactedPayload: {},
      });
    }
    const unavailable = await paymentCallback(
      callbackRequest(signedFields()),
    );
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).not.toBe("1|OK");
    expect(
      await repository.listQueue({
        kind: "provider_operations",
        limit: 20,
        offset: 0,
      }),
    ).toMatchObject({ total: 0 });
  });

  it("rolls back inbox persistence when reconciliation enqueue fails", async () => {
    const repository = getSandboxOperationsRepository();
    let expectedVersion = 1;
    for (let index = 0; index < 256; index += 1) {
      const result = await repository.executeCommand(
        operationsCommandSchema.parse({
          aggregateId: "demo-order-id-000001",
          expectedVersion,
          idempotencyKey: `callback-capacity-query-${String(index).padStart(4, "0")}`,
          command: {
            type: "payment.reconcile",
            merchantTradeNo: `Q${String(index).padStart(19, "0")}`,
          },
        }),
        { userId: "demo-owner", role: "owner" },
      );
      expectedVersion = result.projection.version;
    }

    const response = await paymentCallback(
      callbackRequest(signedFields()),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toBe("1|OK");
    expect(
      await repository.listQueue({
        kind: "provider_events",
        limit: 20,
        offset: 0,
      }),
    ).toMatchObject({ total: 0 });
    expect(
      await repository.listQueue({
        kind: "provider_operations",
        limit: 20,
        offset: 0,
      }),
    ).toMatchObject({ total: 256 });
  });
});
