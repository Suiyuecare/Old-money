import { CommerceDomainError } from "@/lib/commerce/errors";
import { commerceErrorResponse } from "@/lib/http";

export function orderAccessErrorResponse(error: unknown) {
  if (error instanceof CommerceDomainError) {
    return commerceErrorResponse(error);
  }
  return commerceErrorResponse(
    new CommerceDomainError(
      "ORDER_ACCESS_UNAVAILABLE",
      "The secure order access service is unavailable and remains fail closed.",
      503,
    ),
  );
}
