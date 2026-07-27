import { createHash } from "node:crypto";

import { getCommerceEnvironment } from "@/lib/commerce/config";
import { CommerceDomainError } from "@/lib/commerce/errors";
import { canAcceptPaymentCallback } from "@/lib/commerce/readiness";
import {
  createEcpayCheckMacValue,
  verifyEcpayCheckMacValue,
} from "@/lib/providers/ecpay";
import { commerceErrorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

const MAX_CALLBACK_BYTES = 64 * 1024;

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
    // A verified callback still has no payment authority. Until the durable
    // inbox and QueryTradeInfo worker are bound, fail closed without returning
    // the provider acknowledgement that would discard retries.
    const fingerprint = createHash("sha256")
      .update(createEcpayCheckMacValue(fields, { hashKey, hashIv }))
      .digest("hex");
    throw new CommerceDomainError(
      "CALLBACK_INBOX_UNAVAILABLE",
      "Verified callback could not be durably recorded.",
      503,
      { fingerprint },
    );
  } catch (error) {
    return commerceErrorResponse(error);
  }
}

