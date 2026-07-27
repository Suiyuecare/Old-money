import { z } from "zod";

import { requireAdminRole } from "@/lib/admin/auth";
import { CommerceDomainError } from "@/lib/commerce/errors";
import { noStoreJson } from "@/lib/http";
import { getRequestOperationsRepository } from "@/lib/operations/container";
import { operationsErrorResponse } from "@/lib/operations/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const aggregateIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ readonly id: string }> },
) {
  try {
    await requireAdminRole(["owner", "support", "fulfillment"]);
    const { id: rawId } = await context.params;
    const id = aggregateIdSchema.parse(rawId);
    const repository = await getRequestOperationsRepository();
    const projection = await repository.findProjection(id);
    if (!projection) {
      throw new CommerceDomainError(
        "OPERATIONS_AGGREGATE_NOT_FOUND",
        "The operational order was not found.",
        404,
      );
    }
    return noStoreJson({ order: projection });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
