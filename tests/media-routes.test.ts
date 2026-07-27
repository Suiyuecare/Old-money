import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as finalizeMedia } from "@/app/api/admin/media/finalize/route";
import { POST as createUploadIntent } from "@/app/api/admin/media/upload-intents/route";

const origin = "http://localhost:3000";
const productId = "5ef1ae32-9064-4d13-ae7a-84079a54d0de";
const originalEnvironment = {
  mode: process.env.LIGNEE_MODE,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY,
};

function request(path: string, body: unknown, requestOrigin = origin) {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: requestOrigin,
      "sec-fetch-site":
        requestOrigin === origin ? "same-origin" : "cross-site",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.LIGNEE_MODE = "demo";
});

afterEach(() => {
  if (originalEnvironment.mode === undefined) delete process.env.LIGNEE_MODE;
  else process.env.LIGNEE_MODE = originalEnvironment.mode;
  if (originalEnvironment.supabaseUrl === undefined) {
    delete process.env.SUPABASE_URL;
  } else {
    process.env.SUPABASE_URL = originalEnvironment.supabaseUrl;
  }
  if (originalEnvironment.supabaseKey === undefined) {
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
  } else {
    process.env.SUPABASE_PUBLISHABLE_KEY =
      originalEnvironment.supabaseKey;
  }
});

describe("admin private media route boundaries", () => {
  it("revalidates a demo admin at both stages without claiming a real upload", async () => {
    const common = {
      scope: "product",
      entityId: productId,
      fileName: "estate-look.jpg",
      contentType: "image/jpeg",
      sizeBytes: 12_345,
      expectedVersion: 1,
    };
    const intentResponse = await createUploadIntent(
      request("/api/admin/media/upload-intents", {
        ...common,
        idempotencyKey: "media-route-intent-0001",
      }),
    );
    expect(intentResponse.status).toBe(201);
    expect(intentResponse.headers.get("cache-control")).toContain("no-store");
    const intentBody = (await intentResponse.json()) as {
      uploadIntent: {
        intentId: string;
        sourcePath: string;
        mode: string;
        persisted: boolean;
        signedUploadUrl: string | null;
      };
    };
    expect(intentBody.uploadIntent).toMatchObject({
      mode: "demo",
      persisted: false,
      signedUploadUrl: null,
    });

    const finalizeResponse = await finalizeMedia(
      request("/api/admin/media/finalize", {
        ...common,
        idempotencyKey: "media-route-finalize-0001",
        intentId: intentBody.uploadIntent.intentId,
        sourcePath: intentBody.uploadIntent.sourcePath,
      }),
    );
    expect(finalizeResponse.status).toBe(200);
    expect(await finalizeResponse.json()).toMatchObject({
      media: {
        mode: "demo",
        persisted: false,
        processed: false,
        sha256: null,
        derivatives: [],
      },
    });
  });

  it("rejects cross-origin intent and finalize calls before issuing capabilities", async () => {
    const intent = await createUploadIntent(
      request(
        "/api/admin/media/upload-intents",
        {
          scope: "product",
          entityId: productId,
          fileName: "estate-look.jpg",
          contentType: "image/jpeg",
          sizeBytes: 12_345,
          expectedVersion: 1,
          idempotencyKey: "media-route-cross-origin-0001",
        },
        "https://attacker.example",
      ),
    );
    expect(intent.status).toBe(403);
    expect(await intent.json()).toMatchObject({
      error: { code: "ORIGIN_REJECTED" },
    });

    const finalize = await finalizeMedia(
      request(
        "/api/admin/media/finalize",
        {
          scope: "product",
          entityId: productId,
          fileName: "estate-look.jpg",
          contentType: "image/jpeg",
          sizeBytes: 12_345,
          expectedVersion: 1,
          idempotencyKey: "media-route-cross-origin-0002",
          intentId: "a".repeat(64),
          sourcePath: `incoming/product/${productId}/${"a".repeat(64)}.jpg`,
        },
        "https://attacker.example",
      ),
    );
    expect(finalize.status).toBe(403);
  });

  it("fails closed outside local demo when Auth/Storage bindings are absent", async () => {
    process.env.LIGNEE_MODE = "production-disabled";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    const response = await createUploadIntent(
      request("/api/admin/media/upload-intents", {
        scope: "product",
        entityId: productId,
        fileName: "estate-look.jpg",
        contentType: "image/jpeg",
        sizeBytes: 12_345,
        expectedVersion: 1,
        idempotencyKey: "media-route-fail-closed-0001",
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "ADMIN_ACCESS_DENIED" },
    });
  });
});
