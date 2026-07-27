import { getOrderAccessService } from "@/lib/order-access/container";
import { orderAccessErrorResponse } from "@/lib/order-access/http";
import {
  clearOrderAccessCookie,
  readOrderAccessCookie,
} from "@/lib/order-access/service";
import {
  assertSameOrigin,
  noStoreJson,
} from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const unauthorized = () => {
  const response = noStoreJson(
    {
      error: {
        code: "ORDER_ACCESS_DENIED",
        message: "The order access session is invalid or expired.",
      },
    },
    { status: 401 },
  );
  response.headers.append(
    "Set-Cookie",
    clearOrderAccessCookie(),
  );
  return response;
};

export async function GET(request: Request) {
  try {
    const rawSession = readOrderAccessCookie(
      request.headers.get("cookie"),
    );
    if (!rawSession) return unauthorized();
    const order = await getOrderAccessService().readSession(rawSession);
    if (!order) return unauthorized();
    return noStoreJson({ order });
  } catch (error) {
    return orderAccessErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const rawSession = readOrderAccessCookie(
      request.headers.get("cookie"),
    );
    if (rawSession) {
      await getOrderAccessService().revokeSession(rawSession);
    }
    const response = noStoreJson({ revoked: true });
    response.headers.append(
      "Set-Cookie",
      clearOrderAccessCookie(),
    );
    return response;
  } catch (error) {
    return orderAccessErrorResponse(error);
  }
}
