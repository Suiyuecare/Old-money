import { createHash } from "node:crypto";

import { getCommerceEnvironment } from "@/lib/commerce/config";
import { CommerceDomainError } from "@/lib/commerce/errors";
import { canAcceptPaymentCallback } from "@/lib/commerce/readiness";
import { getWorkerOperationsRepository } from "@/lib/operations/container";
import {
  verifyEcpayCheckMacValue,
} from "@/lib/providers/ecpay";
import { commerceErrorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

const MAX_CALLBACK_BYTES = 64 * 1024;
const ECPAY_ACKNOWLEDGEMENT = "1|OK";

const callbackFingerprint = (
  fields: Readonly<Record<string, string>>,
): string =>
  createHash("sha256")
    .update(
      Object.entries(fields)
        .filter(([key]) => key !== "CheckMacValue")
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key.length}:${key}:${value.length}:${value}`)
        .join("|"),
    )
    .digest("hex");

const redactedCallback = (
  fields: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> => {
  const allowlist = [
    "MerchantID",
    "MerchantTradeNo",
    "TradeNo",
    "TradeAmt",
    "RtnCode",
    "PaymentType",
    "PaymentDate",
    "SimulatePaid",
  ] as const;
  return Object.freeze(
    Object.fromEntries(
      allowlist.flatMap((key) =>
        fields[key] === undefined ? [] : [[key, fields[key]]],
      ),
    ),
  );
};

export async function POST(request: Request) {
  try {
    const environment = getCommerceEnvironment();
    const readiness = canAcceptPaymentCallback(environment);
    if (!readiness.allowed) {
      throw new CommerceDomainError(
        readiness.code,
        "Payment callback processing is unavailable.",
        503,
        { reasons: readiness.reasons },
      );
    }
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.startsWith("application/x-www-form-urlencoded")) {
      throw new CommerceDomainError("UNSUPPORTED_MEDIA_TYPE", "Expected form callback.", 415);
    }
    const body = await request.text();
    if (Buffer.byteLength(body) > MAX_CALLBACK_BYTES) {
      throw new CommerceDomainError("CALLBACK_TOO_LARGE", "Callback body is too large.", 413);
    }
    const fields = Object.fromEntries(new URLSearchParams(body));
    const merchantId = process.env.ECPAY_MERCHANT_ID;
    const hashKey = process.env.ECPAY_HASH_KEY;
    const hashIv = process.env.ECPAY_HASH_IV;
    if (!merchantId || !hashKey || !hashIv) {
      throw new CommerceDomainError(
        "CALLBACK_KEYS_UNAVAILABLE",
        "Callback verification keys are unavailable.",
        503,
      );
    }
    if (
      fields.MerchantID !== merchantId ||
      !verifyEcpayCheckMacValue(fields, { hashKey, hashIv })
    ) {
      throw new CommerceDomainError(
        "INVALID_ECPAY_CALLBACK",
        "Callback signature or merchant identity is invalid.",
        401,
      );
    }
    const merchantTradeNo = fields.MerchantTradeNo;
    if (!merchantTradeNo || !/^[A-Za-z0-9]{1,20}$/.test(merchantTradeNo)) {
      throw new CommerceDomainError(
        "INVALID_ECPAY_CALLBACK_IDENTITY",
        "Callback merchant trade number is invalid.",
        400,
      );
    }
    const fingerprint = callbackFingerprint(fields);
    const receipt =
      await getWorkerOperationsRepository().recordPaymentCallback({
        provider: "ecpay",
        merchantTradeNo,
        providerTradeNo:
          typeof fields.TradeNo === "string" && fields.TradeNo.length > 0
            ? fields.TradeNo
            : null,
        callbackStatus:
          fields.RtnCode === "1"
            ? "provider-reported-paid"
            : `provider-code-${(fields.RtnCode ?? "missing").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || "invalid"}`,
        fingerprint,
        redactedPayload: redactedCallback(fields),
      });
    if (!receipt.reconciliationOperationKey) {
      throw new CommerceDomainError(
        "CALLBACK_RECONCILIATION_UNAVAILABLE",
        "Verified callback was not paired with durable reconciliation.",
        503,
        { fingerprint },
      );
    }
    const response = new Response(ECPAY_ACKNOWLEDGEMENT, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
    return response;
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
