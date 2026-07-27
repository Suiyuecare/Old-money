import { getCommerceEnvironment } from "@/lib/commerce/config";
import { CommerceDomainError } from "@/lib/commerce/errors";
import { commerceErrorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const environment = getCommerceEnvironment();
    const authorization = request.headers.get("authorization");
    if (!authorization || !process.env.CRON_SECRET) {
      throw new CommerceDomainError(
        "WORKER_DISABLED",
        "Worker route is disabled because no validated worker credential exists.",
        503,
      );
    }
    if (authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      throw new CommerceDomainError("WORKER_UNAUTHORIZED", "Worker credential is invalid.", 401);
    }
    if (!environment.databaseConfigured) {
      throw new CommerceDomainError(
        "WORKER_REPOSITORY_UNAVAILABLE",
        "Durable worker repository is unavailable.",
        503,
      );
    }
    throw new CommerceDomainError(
      "WORKER_NOT_PROVISIONED",
      "Production worker adapters are not provisioned.",
      503,
    );
  } catch (error) {
    return commerceErrorResponse(error);
  }
}

