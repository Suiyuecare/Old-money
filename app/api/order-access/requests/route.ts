import {
  orderAccessRequestSchema,
} from "@/lib/order-access/contracts";
import { getOrderAccessService } from "@/lib/order-access/container";
import { orderAccessErrorResponse } from "@/lib/order-access/http";
import { requestPrincipalFrom } from "@/lib/order-access/service";
import {
  assertSameOrigin,
  noStoreJson,
  parseBoundedJson,
} from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await parseBoundedJson(
      request,
      orderAccessRequestSchema,
      4_096,
    );
    await getOrderAccessService().requestLink(
      body,
      requestPrincipalFrom(request),
    );
    // Deliberately identical for an existing order, an unknown order, and a
    // mismatched email address.
    return noStoreJson(
      { accepted: true },
      { status: 202 },
    );
  } catch (error) {
    return orderAccessErrorResponse(error);
  }
}
