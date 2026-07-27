import { getCommerceEnvironment, isCanonicalCommerceRequest } from "@/lib/commerce/config";
import { CommerceDomainError } from "@/lib/commerce/errors";
import { canCreateProductionCanary } from "@/lib/commerce/readiness";
import { commerceErrorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const environment = getCommerceEnvironment();
    const readiness = canCreateProductionCanary(environment, {
      canonicalRequest: isCanonicalCommerceRequest(
        new URL(request.url),
        request.headers.get("host"),
      ),
      recentAal2Owner: false,
      csrfValid: false,
      testerAllowlisted: false,
      deviceAllowlisted: false,
      breakfastMugApprovedAt2200: false,
      isolatedStockAvailable: false,
      inFlightCount: 0,
      dailyCount: 0,
    });
    throw new CommerceDomainError(
      readiness.code,
      "Production canary creation is disabled.",
      503,
      { reasons: readiness.reasons },
    );
  } catch (error) {
    return commerceErrorResponse(error);
  }
}

