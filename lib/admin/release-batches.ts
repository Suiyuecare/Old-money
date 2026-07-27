import { randomUUID } from "node:crypto";

import { getCommerceEnvironment } from "@/lib/commerce/config";

import { getAdminAuthClient } from "./auth";
import { AdminRepositoryError } from "./errors";

export type AdminReleaseBatchState =
  | "draft"
  | "review"
  | "ready"
  | "blocked"
  | "published";

export interface AdminReleaseBatch {
  readonly id: string;
  readonly chapterId: string;
  readonly chapterCode: string;
  readonly name: string;
  readonly productIds: readonly string[];
  readonly state: AdminReleaseBatchState;
  readonly version: number;
  readonly publishedAt: string | null;
  readonly updatedAt: string;
}

interface MutationContext {
  readonly idempotencyKey: string;
  readonly requestHash: string;
}

interface DemoState {
  readonly batches: Map<string, AdminReleaseBatch>;
}

const demoKey = Symbol.for("lignee.admin.demo-release-batches");
type DemoGlobal = typeof globalThis & { [demoKey]?: DemoState };

function demoState(): DemoState {
  const globalObject = globalThis as DemoGlobal;
  globalObject[demoKey] ??= { batches: new Map() };
  return globalObject[demoKey];
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function releaseBatch(value: unknown): AdminReleaseBatch {
  const item = record(value);
  const rawState = text(item.state, text(item.status, "draft"));
  return {
    id: text(item.id, text(item.batchId)),
    chapterId: text(item.chapterId),
    chapterCode: text(item.chapterCode),
    name: text(item.name),
    productIds: Array.isArray(item.productIds)
      ? item.productIds.filter((id): id is string => typeof id === "string")
      : [],
    state: ["draft", "review", "ready", "blocked", "published"].includes(rawState)
      ? rawState as AdminReleaseBatchState
      : "blocked",
    version: typeof item.version === "number"
      ? item.version
      : typeof item.rowVersion === "number"
        ? item.rowVersion
        : 1,
    publishedAt: text(item.publishedAt) || null,
    updatedAt: text(item.updatedAt, text(item.createdAt, "1970-01-01T00:00:00.000Z")),
  };
}

function releaseBatchError(error: {
  readonly code?: string;
  readonly message?: string;
  readonly details?: string;
  readonly hint?: string;
}) {
  const source = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ");
  if (source.includes("ROW_VERSION_CONFLICT")) {
    return new AdminRepositoryError(
      "ROW_VERSION_CONFLICT",
      "系列批次已被更新，請重新整理後再試。",
      409,
    );
  }
  if (source.includes("RELEASE_BATCH_NOT_READY")) {
    return new AdminRepositoryError(
      "RELEASE_BATCH_NOT_READY",
      "系列批次尚未 ready，或其中商品未通過發布檢查。",
      422,
    );
  }
  if (source.includes("IDEMPOTENCY")) {
    return new AdminRepositoryError(
      "IDEMPOTENCY_CONFLICT",
      "操作識別碼已用於不同內容。",
      409,
    );
  }
  return new AdminRepositoryError(
    "RELEASE_BATCH_RPC_UNAVAILABLE",
    "系列批次發布 RPC 尚未就緒；功能已保持 fail-closed，未發布任何商品。",
    error.code === "PGRST202" ? 503 : 502,
  );
}

async function rpc(
  name: string,
  args: Readonly<Record<string, unknown>> = {},
): Promise<unknown> {
  const client = await getAdminAuthClient();
  const { data, error } = await client.schema("api").rpc(name, args);
  if (error) throw releaseBatchError(error);
  return data;
}

export async function listAdminReleaseBatches(): Promise<readonly AdminReleaseBatch[]> {
  if (getCommerceEnvironment().mode === "demo") {
    return [...demoState().batches.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
  const data = await rpc("admin_release_batch_list");
  const document = record(data);
  const items = Array.isArray(document.items) ? document.items : Array.isArray(data) ? data : [];
  return items.map(releaseBatch);
}

export async function createAdminReleaseBatch(
  input: {
    readonly chapterId: string;
    readonly name: string;
    readonly productIds: readonly string[];
  },
  context: MutationContext,
): Promise<AdminReleaseBatch> {
  if (getCommerceEnvironment().mode === "demo") {
    const item: AdminReleaseBatch = {
      id: randomUUID(),
      chapterId: input.chapterId,
      chapterCode: input.chapterId,
      name: input.name,
      productIds: input.productIds,
      state: "draft",
      version: 1,
      publishedAt: null,
      updatedAt: new Date().toISOString(),
    };
    demoState().batches.set(item.id, item);
    return item;
  }
  return releaseBatch(await rpc("admin_release_batch_create", {
    p_chapter_id: input.chapterId,
    p_name: input.name,
    p_product_ids: input.productIds,
    p_idempotency_key: context.idempotencyKey,
    p_request_hash: context.requestHash,
  }));
}

export async function setAdminReleaseBatchReadiness(
  input: {
    readonly batchId: string;
    readonly expectedVersion: number;
    readonly state: Exclude<AdminReleaseBatchState, "published">;
  },
  context: MutationContext,
): Promise<AdminReleaseBatch> {
  if (getCommerceEnvironment().mode === "demo") {
    const current = demoState().batches.get(input.batchId);
    if (!current) throw new AdminRepositoryError("RELEASE_BATCH_NOT_FOUND", "找不到系列批次。", 404);
    if (current.version !== input.expectedVersion) {
      throw new AdminRepositoryError("ROW_VERSION_CONFLICT", "請重新整理系列批次。", 409);
    }
    const updated = {
      ...current,
      state: input.state,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    demoState().batches.set(current.id, updated);
    return updated;
  }
  return releaseBatch(await rpc("admin_release_batch_readiness_set", {
    p_batch_id: input.batchId,
    p_expected_version: input.expectedVersion,
    p_state: input.state,
    p_idempotency_key: context.idempotencyKey,
    p_request_hash: context.requestHash,
  }));
}

export async function publishAdminReleaseBatch(
  input: { readonly batchId: string; readonly expectedVersion: number },
  context: MutationContext,
): Promise<AdminReleaseBatch> {
  if (getCommerceEnvironment().mode === "demo") {
    const current = demoState().batches.get(input.batchId);
    if (!current) throw new AdminRepositoryError("RELEASE_BATCH_NOT_FOUND", "找不到系列批次。", 404);
    if (current.version !== input.expectedVersion) {
      throw new AdminRepositoryError("ROW_VERSION_CONFLICT", "請重新整理系列批次。", 409);
    }
    if (current.state !== "ready") {
      throw new AdminRepositoryError("RELEASE_BATCH_NOT_READY", "系列批次尚未 ready。", 422);
    }
    const published = {
      ...current,
      state: "published" as const,
      version: current.version + 1,
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    demoState().batches.set(current.id, published);
    return published;
  }
  return releaseBatch(await rpc("admin_release_batch_publish", {
    p_batch_id: input.batchId,
    p_expected_version: input.expectedVersion,
    p_idempotency_key: context.idempotencyKey,
    p_request_hash: context.requestHash,
  }));
}
