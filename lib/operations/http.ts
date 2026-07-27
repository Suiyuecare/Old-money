import { AdminAuthorizationError } from "@/lib/admin/auth";
import { CommerceDomainError } from "@/lib/commerce/errors";
import { commerceErrorResponse, noStoreJson } from "@/lib/http";

export function operationsErrorResponse(error: unknown) {
  if (error instanceof AdminAuthorizationError) {
    return noStoreJson(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  if (error instanceof CommerceDomainError) {
    return commerceErrorResponse(error);
  }
  return commerceErrorResponse(
    new CommerceDomainError(
      "OPERATIONS_UNAVAILABLE",
      "The operations workflow is unavailable and remains fail closed.",
      503,
    ),
  );
}
