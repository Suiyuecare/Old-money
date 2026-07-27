import { randomUUID } from "node:crypto";

import { categoryMetadata, collections } from "@/lib/catalog";
import { getCommerceEnvironment } from "@/lib/commerce/config";

import { getAdminAuthClient } from "./auth";
import { AdminRepositoryError } from "./errors";

export type AdminTaxonomyKind = "category" | "chapter";
export type AdminTaxonomyStatus = "active" | "archived";

export interface AdminTaxonomyItem {
  readonly id: string;
  readonly kind: AdminTaxonomyKind;
  readonly code: string;
  readonly nameEn: string;
  readonly nameZh: string;
  readonly description: string;
  readonly routeSegment: string;
  readonly sortOrder: number;
  readonly status: AdminTaxonomyStatus;
  readonly version: number;
  readonly updatedAt: string;
}

export interface AdminTaxonomyInput {
  readonly code: string;
  readonly nameEn: string;
  readonly nameZh: string;
  readonly description: string;
  readonly routeSegment: string;
  readonly sortOrder: number;
}

interface TaxonomyMutationContext {
  readonly idempotencyKey: string;
  readonly requestHash: string;
}

interface DemoTaxonomyState {
  readonly items: Map<string, AdminTaxonomyItem>;
  readonly idempotency: Map<string, string>;
}

const demoKey = Symbol.for("lignee.admin.demo-taxonomy");
type DemoGlobal = typeof globalThis & { [demoKey]?: DemoTaxonomyState };

function createDemoState(): DemoTaxonomyState {
  const items = new Map<string, AdminTaxonomyItem>();
  for (const category of categoryMetadata) {
    items.set(`category:${category.id}`, {
      id: category.id,
      kind: "category",
      code: category.id,
      nameEn: category.englishLabel,
      nameZh: category.label,
      description: category.description,
      routeSegment: category.routeSegment,
      sortOrder: category.order,
      status: "active",
      version: 1,
      updatedAt: "2026-07-27T00:00:00.000Z",
    });
  }
  collections.forEach((chapter, index) => {
    items.set(`chapter:${chapter.id}`, {
      id: chapter.id,
      kind: "chapter",
      code: chapter.id,
      nameEn: chapter.name,
      nameZh: chapter.subtitle,
      description: chapter.description,
      routeSegment: chapter.id,
      sortOrder: index + 1,
      status: "active",
      version: 1,
      updatedAt: "2026-07-27T00:00:00.000Z",
    });
  });
  return { items, idempotency: new Map() };
}

function demoState(): DemoTaxonomyState {
  const globalObject = globalThis as DemoGlobal;
  globalObject[demoKey] ??= createDemoState();
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

function taxonomyItem(kind: AdminTaxonomyKind, value: unknown): AdminTaxonomyItem {
  const item = record(value);
  const status = text(item.status);
  return {
    id: text(item.id),
    kind,
    code: text(item.code),
    nameEn: text(item.nameEn, text(item.labelEn, text(item.titleEn, text(item.name)))),
    nameZh: text(item.nameZh, text(item.labelZh, text(item.titleZh, text(item.subtitle)))),
    description: text(item.description),
    routeSegment: text(item.routeSegment, text(item.code)),
    sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : 1,
    status: status === "archived" ? "archived" : "active",
    version: typeof item.version === "number"
      ? item.version
      : typeof item.rowVersion === "number"
        ? item.rowVersion
        : 1,
    updatedAt: text(item.updatedAt, "1970-01-01T00:00:00.000Z"),
  };
}

function taxonomyError(error: {
  readonly code?: string;
  readonly message?: string;
  readonly details?: string;
  readonly hint?: string;
}) {
  const source = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ");
  if (source.includes("ROW_VERSION_CONFLICT")) {
    return new AdminRepositoryError(
      "ROW_VERSION_CONFLICT",
      "分類或篇章已被另一個工作階段更新，請重新整理。",
      409,
    );
  }
  if (source.includes("TAXONOMY_STILL_REFERENCED")) {
    return new AdminRepositoryError(
      "TAXONOMY_IN_USE",
      "此分類或篇章仍被商品使用，不能封存。",
      409,
    );
  }
  if (source.includes("IDEMPOTENCY")) {
    return new AdminRepositoryError(
      "IDEMPOTENCY_CONFLICT",
      "操作識別碼已用於不同內容，請重新整理。",
      409,
    );
  }
  return new AdminRepositoryError(
    "TAXONOMY_RPC_UNAVAILABLE",
    "分類與篇章 RPC 尚未就緒；操作已保持 fail-closed。",
    error.code === "PGRST202" ? 503 : 502,
  );
}

async function taxonomyRpc(
  name: string,
  args: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const client = await getAdminAuthClient();
  const { data, error } = await client.schema("api").rpc(name, args);
  if (error) throw taxonomyError(error);
  return data;
}

export async function listAdminTaxonomy(
  kind: AdminTaxonomyKind,
): Promise<readonly AdminTaxonomyItem[]> {
  if (getCommerceEnvironment().mode === "demo") {
    return [...demoState().items.values()]
      .filter((item) => item.kind === kind)
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }
  const data = await taxonomyRpc("admin_taxonomy_list", { p_kind: kind });
  const document = record(data);
  const items = Array.isArray(document.items) ? document.items : Array.isArray(data) ? data : [];
  return items.map((item) => taxonomyItem(kind, item));
}

export async function upsertAdminTaxonomy(
  kind: AdminTaxonomyKind,
  id: string | null,
  expectedVersion: number | null,
  input: AdminTaxonomyInput,
  context: TaxonomyMutationContext,
): Promise<AdminTaxonomyItem> {
  if (getCommerceEnvironment().mode === "demo") {
    const state = demoState();
    const fingerprint = JSON.stringify(["taxonomy.upsert", kind, id, expectedVersion, input]);
    const prior = state.idempotency.get(context.idempotencyKey);
    if (prior && prior !== fingerprint) {
      throw new AdminRepositoryError("IDEMPOTENCY_CONFLICT", "操作識別碼已用於不同內容。", 409);
    }
    const key = id ? `${kind}:${id}` : `${kind}:${input.code}`;
    const current = state.items.get(key);
    if (current && expectedVersion !== current.version) {
      throw new AdminRepositoryError("ROW_VERSION_CONFLICT", "請重新整理分類或篇章。", 409);
    }
    const updated: AdminTaxonomyItem = {
      id: current?.id ?? input.code ?? randomUUID(),
      kind,
      ...input,
      status: current?.status ?? "active",
      version: (current?.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    state.items.set(key, updated);
    state.idempotency.set(context.idempotencyKey, fingerprint);
    return updated;
  }
  const payload = kind === "category"
    ? {
        code: input.code,
        labelEn: input.nameEn,
        labelZh: input.nameZh,
        description: input.description,
        routeSegment: input.routeSegment,
        sortOrder: input.sortOrder,
        status: "active",
      }
    : {
        code: input.code,
        titleEn: input.nameEn,
        titleZh: input.nameZh,
        description: input.description,
        routeSegment: input.routeSegment,
        sortOrder: input.sortOrder,
        status: "active",
      };
  return taxonomyItem(kind, await taxonomyRpc("admin_taxonomy_upsert", {
    p_kind: kind,
    p_id: id,
    p_expected_version: expectedVersion ?? 0,
    p_idempotency_key: context.idempotencyKey,
    p_request_hash: context.requestHash,
    p_payload: payload,
  }));
}

export async function archiveAdminTaxonomy(
  item: Pick<AdminTaxonomyItem, "id" | "kind" | "version">,
  context: TaxonomyMutationContext,
): Promise<AdminTaxonomyItem> {
  if (getCommerceEnvironment().mode === "demo") {
    const state = demoState();
    const key = `${item.kind}:${item.id}`;
    const current = state.items.get(key);
    if (!current) throw new AdminRepositoryError("TAXONOMY_NOT_FOUND", "找不到分類或篇章。", 404);
    if (current.version !== item.version) {
      throw new AdminRepositoryError("ROW_VERSION_CONFLICT", "請重新整理分類或篇章。", 409);
    }
    const updated = {
      ...current,
      status: "archived" as const,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    state.items.set(key, updated);
    return updated;
  }
  return taxonomyItem(item.kind, await taxonomyRpc("admin_taxonomy_archive", {
    p_kind: item.kind,
    p_id: item.id,
    p_expected_version: item.version,
    p_idempotency_key: context.idempotencyKey,
    p_request_hash: context.requestHash,
  }));
}
