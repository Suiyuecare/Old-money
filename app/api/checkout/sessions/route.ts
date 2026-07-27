import { z } from "zod";

import { getCommerceContainer } from "@/lib/commerce/container";
import {
  getCommerceEnvironment,
  isCanonicalCommerceRequest,
} from "@/lib/commerce/config";
import { executeDemoPublicCommand } from "@/lib/commerce/demo-public-command";
import { CommerceDomainError } from "@/lib/commerce/errors";
import { canCreateCheckout } from "@/lib/commerce/readiness";
import { idempotencyKeySchema } from "@/lib/commerce/validation";
import {
  assertSameOrigin,
  commerceErrorResponse,
  noStoreJson,
  parseBoundedJson,
} from "@/lib/http";

export const dynamic = "force-dynamic";

const requestSchema = z.strictObject({
  idempotencyKey: idempotencyKeySchema,
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await parseBoundedJson(request, requestSchema);
    const environment = getCommerceEnvironment();
    const requestUrl = new URL(request.url);
    const readiness = canCreateCheckout(
      environment,
      isCanonicalCommerceRequest(requestUrl, request.headers.get("host")),
    );
    if (!readiness.allowed) {
      throw new CommerceDomainError(
        readiness.code,
        "New checkout creation is disabled.",
        503,
        { reasons: readiness.reasons },
      );
    }
    const commerce = getCommerceContainer().commerce;
    const commandIdentity = {
      idempotencyKey: body.idempotencyKey,
      safetyRevision: environment.controls.revision,
    } as const;
    const draft = await executeDemoPublicCommand({
      commandName: "create-checkout-draft",
      idempotencyKey: body.idempotencyKey,
      findReplay: () =>
        commerce.findCheckoutDraftCommandReplay(commandIdentity),
      create: () =>
        commerce.createCheckoutDraft({
          idempotencyKey: body.idempotencyKey,
          safetyRevision: environment.controls.revision,
        }),
    });
    return noStoreJson({
      checkout: draft,
      emailVerificationRequired: true,
      paymentProviderCreated: false,
    });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
