import { createHash, timingSafeEqual } from "node:crypto";

import { CommerceDomainError } from "@/lib/commerce/errors";
import type { OrderTotalsSnapshot } from "@/lib/commerce/money";

const LIVE_ENDPOINT = "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5";
const SANDBOX_ENDPOINT = "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5";

export interface EcpayCredential {
  readonly merchantId: string;
  readonly hashKey: string;
  readonly hashIv: string;
  readonly environment: "sandbox" | "live";
}

const ecpayUrlEncode = (value: string): string =>
  encodeURIComponent(value)
    .replace(/%20/g, "+")
    .replace(/%2D/gi, "-")
    .replace(/%5F/gi, "_")
    .replace(/%2E/gi, ".")
    .replace(/%21/gi, "!")
    .replace(/%2A/gi, "*")
    .replace(/%28/gi, "(")
    .replace(/%29/gi, ")")
    .toLowerCase();

export const canonicalizeEcpayFields = (
  fields: Readonly<Record<string, string | number>>,
  credential: Pick<EcpayCredential, "hashKey" | "hashIv">,
): string => {
  const body = Object.entries(fields)
    .filter(([key]) => key !== "CheckMacValue")
    .sort(([left], [right]) => left.localeCompare(right, "en", { sensitivity: "base" }))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&");
  return `HashKey=${credential.hashKey}&${body}&HashIV=${credential.hashIv}`;
};

export const createEcpayCheckMacValue = (
  fields: Readonly<Record<string, string | number>>,
  credential: Pick<EcpayCredential, "hashKey" | "hashIv">,
): string =>
  createHash("sha256")
    .update(ecpayUrlEncode(canonicalizeEcpayFields(fields, credential)))
    .digest("hex")
    .toUpperCase();

export const verifyEcpayCheckMacValue = (
  fields: Readonly<Record<string, string>>,
  credential: Pick<EcpayCredential, "hashKey" | "hashIv">,
): boolean => {
  const supplied = fields.CheckMacValue;
  if (!supplied || !/^[A-Fa-f0-9]{64}$/.test(supplied)) return false;
  const expected = createEcpayCheckMacValue(fields, credential);
  return timingSafeEqual(Buffer.from(supplied.toUpperCase()), Buffer.from(expected));
};

export const assertVerifiedEcpayCallback = (
  fields: Readonly<Record<string, string>>,
  credential: EcpayCredential,
  expected: {
    readonly merchantTradeNo: string;
    readonly amountTwd: number;
  },
): void => {
  if (!verifyEcpayCheckMacValue(fields, credential)) {
    throw new CommerceDomainError("INVALID_ECPAY_SIGNATURE", "ECPay signature verification failed.", 401);
  }
  if (
    fields.MerchantID !== credential.merchantId ||
    fields.MerchantTradeNo !== expected.merchantTradeNo ||
    fields.TradeAmt !== String(expected.amountTwd)
  ) {
    throw new CommerceDomainError(
      "ECPAY_CALLBACK_MISMATCH",
      "ECPay callback identity or amount does not match the immutable attempt.",
      409,
    );
  }
};

const formatProviderDate = (date: Date): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}/${read("month")}/${read("day")} ${read("hour")}:${read("minute")}:${read("second")}`;
};

export const buildEcpayRedirectForm = (input: {
  readonly credential: EcpayCredential;
  readonly merchantTradeNo: string;
  readonly totals: OrderTotalsSnapshot;
  readonly itemName: string;
  readonly callbackUrl: "https://estatelignee.com/api/webhooks/ecpay/payment";
  readonly returnUrl: "https://estatelignee.com/checkout/return";
  readonly applePayEnabled: boolean;
  readonly now: Date;
}): { readonly endpoint: string; readonly fields: Readonly<Record<string, string>> } => {
  if (!/^[A-Za-z0-9]{1,20}$/.test(input.merchantTradeNo)) {
    throw new CommerceDomainError("INVALID_MERCHANT_TRADE_NO", "ECPay trade number is invalid.");
  }
  const fields: Record<string, string> = {
    MerchantID: input.credential.merchantId,
    MerchantTradeNo: input.merchantTradeNo,
    MerchantTradeDate: formatProviderDate(input.now),
    PaymentType: "aio",
    TotalAmount: String(input.totals.grossTwd),
    TradeDesc: "LIGNEE Estate No. 01",
    ItemName: input.itemName.slice(0, 200),
    ReturnURL: input.callbackUrl,
    ChoosePayment: "Credit",
    EncryptType: "1",
    ClientBackURL: input.returnUrl,
    OrderResultURL: input.returnUrl,
    ...(input.applePayEnabled ? {} : { IgnorePayment: "ApplePay" }),
  };
  return Object.freeze({
    endpoint:
      input.credential.environment === "live" ? LIVE_ENDPOINT : SANDBOX_ENDPOINT,
    fields: Object.freeze({
      ...fields,
      CheckMacValue: createEcpayCheckMacValue(fields, input.credential),
    }),
  });
};

