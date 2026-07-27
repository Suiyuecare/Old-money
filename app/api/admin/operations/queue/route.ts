import { z } from "zod";

import { requireAdminRole } from "@/lib/admin/auth";
import {
  operationsQueueAuthorization,
  operationsQueueKindSchema,
} from "@/lib/operations/contracts";
import { getRequestOperationsRepository } from "@/lib/operations/container";
import { operationsErrorResponse } from "@/lib/operations/http";
import { noStoreJson } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.strictObject({
  kind: operationsQueueKindSchema,
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = querySchema.parse({
      kind: url.searchParams.get("kind"),
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });
    await requireAdminRole(operationsQueueAuthorization[query.kind]);
    const repository = await getRequestOperationsRepository();
    const page = await repository.listQueue(query);
    return noStoreJson(page);
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
