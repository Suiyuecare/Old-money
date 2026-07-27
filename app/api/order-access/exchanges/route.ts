import { orderAccessExchangeSchema } from "@/lib/order-access/contracts";
import { getOrderAccessService } from "@/lib/order-access/container";
import { orderAccessErrorResponse } from "@/lib/order-access/http";
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
      orderAccessExchangeSchema,
      2_048,
    );
    const result = await getOrderAccessService().exchangeToken(
      body.token,
    );
    const response = noStoreJson({
      granted: true,
      order: result.order,
    });
    response.headers.append("Set-Cookie", result.cookie);
    return response;
  } catch (error) {
    return orderAccessErrorResponse(error);
  }
}
