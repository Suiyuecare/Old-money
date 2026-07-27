import { createCurrentQuote } from "@/lib/commerce/quote";
import { quoteRequestSchema } from "@/lib/commerce/validation";
import {
  commerceErrorResponse,
  noStoreJson,
  parseBoundedJson,
} from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await parseBoundedJson(request, quoteRequestSchema);
    return noStoreJson(await createCurrentQuote(body.lines));
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
