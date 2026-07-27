import { z } from "zod";

import { getCommerceContainer } from "@/lib/commerce/container";
import { getCommerceEnvironment } from "@/lib/commerce/config";
import { executeDemoPublicCommand } from "@/lib/commerce/demo-public-command";
import { CommerceDomainError } from "@/lib/commerce/errors";
import { createCurrentQuote } from "@/lib/commerce/quote";
import {
  acceptedQuoteRequestSchema,
  idempotencyKeySchema,
} from "@/lib/commerce/validation";
import {
  assertSameOrigin,
  commerceErrorResponse,
  noStoreJson,
  parseBoundedJson,
} from "@/lib/http";

export const dynamic = "force-dynamic";

const orderRequestSchema = z.strictObject({
  idempotencyKey: idempotencyKeySchema,
  confirmationToken: z.string().min(32).max(512),
  emailVerificationToken: z.string().min(16).max(512),
  cart: acceptedQuoteRequestSchema,
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await parseBoundedJson(request, orderRequestSchema);
    const environment = getCommerceEnvironment();
    if (environment.mode !== "demo") {
      throw new CommerceDomainError(
        "ORDER_CREATION_DISABLED",
        "Production order creation is disabled until confirmation/OTP commands atomically persist the encrypted contact, Email lookup HMAC, and opaque order-access recipient reference.",
        503,
      );
    }
    if (
      body.confirmationToken !== "demo-confirmation-token-00000000000000000000" ||
      body.emailVerificationToken !== "demo-email-token-000000"
    ) {
      throw new CommerceDomainError(
        "EMAIL_OR_CONFIRMATION_REQUIRED",
        "A valid single-use Email and confirmation token is required.",
        409,
      );
    }
    const currentQuote = await createCurrentQuote(body.cart.lines);
    const quoteIsStale = body.cart.lines.some((submittedLine) => {
      const currentLine = currentQuote.lines.find(
        (line) => line.skuId === submittedLine.skuId,
      );
      return (
        !currentLine ||
        submittedLine.lastSeenPriceVersion !== currentLine.priceVersion ||
        submittedLine.lastSeenUnitPriceTwd !== currentLine.unitGrossTwd ||
        submittedLine.acceptedQuoteDigest !== currentQuote.quoteDigest
      );
    });
    if (quoteIsStale) {
      throw new CommerceDomainError(
        "PRICE_CHANGED",
        "The accepted price snapshot is stale. Review and accept the current quote.",
        409,
        { quote: currentQuote },
      );
    }

    const command = {
      idempotencyKey: body.idempotencyKey,
      totals: currentQuote.totals,
      quote: Object.freeze({
        digest: currentQuote.quoteDigest,
        digestSchemaRevision: currentQuote.digestSchemaRevision,
        financialRevisions: currentQuote.financialRevisions,
      }),
      productionCanary: false,
    } as const;
    const commerce = getCommerceContainer().commerce;
    const order = await executeDemoPublicCommand({
      commandName: "create-order",
      idempotencyKey: body.idempotencyKey,
      findReplay: () => commerce.findOrderCommandReplay(command),
      create: () => commerce.createOrder(command),
    });
    return noStoreJson({
      order: {
        publicId: order.publicId,
        status: order.status,
        totals: order.totals,
      },
      quoteDigest: order.quote.digest,
      paymentCreated: false,
      sandbox: true,
    });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
