import { NextResponse } from "next/server";
import { z } from "zod";

import { CommerceDomainError } from "./commerce/errors";

export const noStoreJson = (
  body: unknown,
  init: ResponseInit = {},
): NextResponse => {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
};

export async function parseBoundedJson<T>(
  request: Request,
  schema: z.ZodType<T>,
  maximumBytes = 32_768,
): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new CommerceDomainError(
      "UNSUPPORTED_MEDIA_TYPE",
      "Expected application/json.",
      415,
    );
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > maximumBytes) {
    throw new CommerceDomainError("REQUEST_TOO_LARGE", "Request body is too large.", 413);
  }
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new CommerceDomainError("INVALID_JSON", "Malformed JSON request.", 400);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new CommerceDomainError(
      "VALIDATION_FAILED",
      "Request validation failed.",
      400,
      { fields: parsed.error.issues.map((issue) => issue.path.join(".")) },
    );
  }
  return parsed.data;
}

export const commerceErrorResponse = (error: unknown): NextResponse => {
  if (error instanceof CommerceDomainError) {
    return noStoreJson(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
      { status: error.httpStatus },
    );
  }
  return noStoreJson(
    {
      error: {
        code: "COMMERCE_UNAVAILABLE",
        message: "Commerce service is unavailable and remains fail closed.",
      },
    },
    { status: 503 },
  );
};

export const assertSameOrigin = (request: Request): void => {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host") ?? new URL(request.url).host;
  const fetchSite = request.headers.get("sec-fetch-site");
  const requestUrl = new URL(request.url);
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",", 1)[0]
    ?.trim()
    .toLowerCase();
  const expectedProtocol = forwardedProtocol
    ? `${forwardedProtocol}:`
    : requestUrl.protocol;
  let originUrl: URL | undefined;
  let expectedOriginUrl: URL | undefined;
  try {
    originUrl = origin ? new URL(origin) : undefined;
    expectedOriginUrl =
      host &&
      (expectedProtocol === "https:" || expectedProtocol === "http:")
        ? new URL(`${expectedProtocol}//${host}`)
        : undefined;
  } catch {
    originUrl = undefined;
    expectedOriginUrl = undefined;
  }
  if (
    !originUrl ||
    !expectedOriginUrl ||
    originUrl.origin.toLowerCase() !== expectedOriginUrl.origin.toLowerCase() ||
    (fetchSite !== null && fetchSite !== "same-origin")
  ) {
    throw new CommerceDomainError("ORIGIN_REJECTED", "Request Origin is not allowed.", 403);
  }
};
