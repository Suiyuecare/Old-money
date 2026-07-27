import {
  requireAdminRole,
  requireRecentAal2,
} from "@/lib/admin/auth";
import { assertSameOrigin, noStoreJson, parseBoundedJson } from "@/lib/http";
import {
  operationsCommandAuthorization,
  operationsCommandSchema,
} from "@/lib/operations/contracts";
import { getRequestOperationsRepository } from "@/lib/operations/container";
import { operationsErrorResponse } from "@/lib/operations/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const command = await parseBoundedJson(
      request,
      operationsCommandSchema,
      32_768,
    );
    const rule =
      operationsCommandAuthorization[command.command.type];
    const actor = await requireAdminRole(rule.roles);
    if (rule.requireRecentAal2) await requireRecentAal2();
    const repository = await getRequestOperationsRepository();
    const result = await repository.executeCommand(command, actor);
    return noStoreJson({ operation: result });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
