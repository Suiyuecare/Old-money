import { createHash } from "node:crypto";

import type {
  EmailProvider,
  InvoiceProvider,
  LogisticsProvider,
  PaymentGateway,
} from "./interfaces";

const fixtureId = (namespace: string, operationKey: string): string =>
  `${namespace}_${createHash("sha256").update(operationKey).digest("hex").slice(0, 20)}`;

export class MockPaymentGateway implements PaymentGateway {
  async createRedirectForm(input: Parameters<PaymentGateway["createRedirectForm"]>[0]) {
    return Object.freeze({
      endpoint: "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
      fields: Object.freeze({
        MerchantTradeNo: input.merchantTradeNo,
        TotalAmount: String(input.totals.grossTwd),
        TradeDesc: input.description,
        ChoosePayment: "Credit",
        ...(input.applePayEnabled ? {} : { IgnorePayment: "ApplePay" }),
        ReturnURL: input.callbackUrl,
        OrderResultURL: input.returnUrl,
        Mock: "true",
      }),
    });
  }

  async queryTrade(input: Parameters<PaymentGateway["queryTrade"]>[0]) {
    return {
      tradeStatus: "unknown" as const,
      evidenceHash: fixtureId("query", input.merchantTradeNo),
    };
  }

  async refund() {
    return { state: "unknown" as const };
  }
}

export class MockInvoiceProvider implements InvoiceProvider {
  async issue(input: Parameters<InvoiceProvider["issue"]>[0]) {
    return {
      state: "issued" as const,
      relateNumber: fixtureId("invoice", input.operationKey),
    };
  }

  async adjust() {
    return { state: "succeeded" as const };
  }
}

export class MockLogisticsProvider implements LogisticsProvider {
  async createShipment(input: Parameters<LogisticsProvider["createShipment"]>[0]) {
    return {
      state: "created" as const,
      trackingIds: Array.from(
        { length: input.parcelCount },
        (_, index) => fixtureId("parcel", `${input.operationKey}:${index + 1}`),
      ),
    };
  }

  async cancelShipment() {
    return { state: "cancelled" as const };
  }
}

export class MockEmailProvider implements EmailProvider {
  async send(input: Parameters<EmailProvider["send"]>[0]) {
    return {
      state: "queued" as const,
      messageId: fixtureId("email", input.operationKey),
    };
  }
}

