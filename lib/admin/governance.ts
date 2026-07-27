import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

import { getCommerceEnvironment } from "@/lib/commerce/config";

import { getAdminAuthClient } from "./auth";
import { AdminRepositoryError } from "./errors";

export interface AdminRuntimeControls {
  readonly version: number;
  readonly mediaSafetyRevision: number;
  readonly commerceLive: boolean;
  readonly checkoutEnabled: boolean;
  readonly productionCanaryEnabled: boolean;
  readonly ecpayApplePayEnabled: boolean;
  readonly searchIndexEnabled: boolean;
  readonly catalogEmergencyNoCache: boolean;
  readonly mediaEmergencyNoCache: boolean;
  readonly catalogApprovalRevision: string | null;
  readonly legalApprovalRevision: string | null;
  readonly canaryEvidenceSha256: string | null;
  readonly updatedAt: string;
  readonly replayed?: boolean;
}

export interface AdminRuntimeControlsPayload {
  readonly commerceLive: boolean;
  readonly checkoutEnabled: boolean;
  readonly productionCanaryEnabled: boolean;
  readonly ecpayApplePayEnabled: boolean;
  readonly searchIndexEnabled: boolean;
  readonly catalogEmergencyNoCache: boolean;
  readonly mediaEmergencyNoCache: boolean;
}

export interface AdminRuntimeControlsCommand {
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly payload: AdminRuntimeControlsPayload;
}

export type AdminLaunchAttestationKind = "catalog" | "legal" | "canary";

export interface AdminLaunchAttestationCommand {
  readonly expectedControlsVersion: number;
  readonly kind: AdminLaunchAttestationKind;
  readonly value: string;
  readonly evidenceSha256: string;
  readonly idempotencyKey: string;
}

export interface AdminLaunchAttestation {
  readonly id: string;
  readonly kind: AdminLaunchAttestationKind;
  readonly value: string;
  readonly evidenceSha256: string;
  readonly controlsVersion: number;
  readonly recordedAt: string;
  readonly replayed?: boolean;
}

export interface AdminAuditEvent {
  readonly id: string;
  readonly actorScope: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly changedFields: readonly string[];
  readonly requestId: string;
  readonly occurredAt: string;
}

export interface AdminAuditQuery {
  readonly limit: number;
  readonly offset: number;
  readonly entityType?: string | null;
  readonly action?: string | null;
}

export interface AdminAuditPage {
  readonly items: readonly AdminAuditEvent[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface AdminGovernanceAdapter {
  readonly mode: "demo" | "rpc" | "rpc-unavailable";
  readRuntimeControls(): Promise<AdminRuntimeControls>;
  updateRuntimeControls(command: AdminRuntimeControlsCommand): Promise<AdminRuntimeControls>;
  recordLaunchAttestation(
    command: AdminLaunchAttestationCommand,
  ): Promise<AdminLaunchAttestation>;
  listAuditEvents(query: AdminAuditQuery): Promise<AdminAuditPage>;
}

interface RpcErrorLike {
  readonly code?: string;
  readonly message?: string;
  readonly details?: string;
  readonly hint?: string;
}

interface RpcResult {
  readonly data: unknown;
  readonly error: RpcErrorLike | null;
}

export interface AdminGovernanceRpcClient {
  rpc(name: string, args?: Readonly<Record<string, unknown>>): Promise<RpcResult>;
}

type RpcClientFactory = () => Promise<AdminGovernanceRpcClient>;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, {
  message: "請輸入 64 位小寫 SHA-256。",
});

const durableRevisionSchema = z.string()
  .min(1)
  .max(160)
  .refine((value) => value === value.trim(), {
    message: "核准版本前後不可包含空白。",
  });

const runtimeControlsFields = {
  version: z.number().int().nonnegative(),
  mediaSafetyRevision: z.number().int().nonnegative(),
  commerceLive: z.boolean(),
  checkoutEnabled: z.boolean(),
  productionCanaryEnabled: z.boolean(),
  ecpayApplePayEnabled: z.boolean(),
  searchIndexEnabled: z.boolean(),
  catalogEmergencyNoCache: z.boolean(),
  mediaEmergencyNoCache: z.boolean(),
  catalogApprovalRevision: durableRevisionSchema.nullable(),
  legalApprovalRevision: durableRevisionSchema.nullable(),
  canaryEvidenceSha256: sha256Schema.nullable(),
  updatedAt: z.string().datetime({ offset: true }),
} as const;

const runtimeControlsSchema = z.strictObject({
  ...runtimeControlsFields,
  replayed: z.boolean().optional(),
});

// The controls mutation predates durable launch attestations and intentionally
// returns only the row it changed. The adapter validates that response, then
// reads the current strict controls document so callers never receive a
// partially shaped runtime contract.
const legacyRuntimeControlsMutationSchema = z.strictObject({
  version: runtimeControlsFields.version,
  mediaSafetyRevision: runtimeControlsFields.mediaSafetyRevision,
  commerceLive: runtimeControlsFields.commerceLive,
  checkoutEnabled: runtimeControlsFields.checkoutEnabled,
  productionCanaryEnabled: runtimeControlsFields.productionCanaryEnabled,
  ecpayApplePayEnabled: runtimeControlsFields.ecpayApplePayEnabled,
  searchIndexEnabled: runtimeControlsFields.searchIndexEnabled,
  catalogEmergencyNoCache: runtimeControlsFields.catalogEmergencyNoCache,
  mediaEmergencyNoCache: runtimeControlsFields.mediaEmergencyNoCache,
  updatedAt: runtimeControlsFields.updatedAt,
  replayed: z.boolean().optional(),
});

const runtimeControlsMutationSchema = z.union([
  runtimeControlsSchema,
  legacyRuntimeControlsMutationSchema,
]);

export const launchAttestationCommandSchema = z.strictObject({
  expectedControlsVersion: z.coerce.number().int().nonnegative(),
  kind: z.enum(["catalog", "legal", "canary"]),
  value: z.string().trim().min(1).max(160),
  evidenceSha256: sha256Schema,
  idempotencyKey: z.string().trim().min(16).max(200),
}).superRefine((command, context) => {
  if (command.kind === "canary" && command.value !== command.evidenceSha256) {
    context.addIssue({
      code: "custom",
      message: "Canary 的值必須與證據 SHA-256 完全相同。",
      path: ["value"],
    });
  }
});

const launchAttestationSchema = z.strictObject({
  id: z.string().uuid(),
  kind: z.enum(["catalog", "legal", "canary"]),
  value: durableRevisionSchema,
  evidenceSha256: sha256Schema,
  controlsVersion: z.number().int().nonnegative(),
  recordedAt: z.string().datetime({ offset: true }),
  replayed: z.boolean().optional(),
}).superRefine((attestation, context) => {
  if (
    attestation.kind === "canary"
    && attestation.value !== attestation.evidenceSha256
  ) {
    context.addIssue({
      code: "custom",
      message: "Canary attestation response is inconsistent.",
      path: ["value"],
    });
  }
});

export const runtimeControlsPayloadSchema = z.object({
  commerceLive: z.boolean(),
  checkoutEnabled: z.boolean(),
  productionCanaryEnabled: z.boolean(),
  ecpayApplePayEnabled: z.boolean(),
  searchIndexEnabled: z.boolean(),
  catalogEmergencyNoCache: z.boolean(),
  mediaEmergencyNoCache: z.boolean(),
}).superRefine((payload, context) => {
  if (payload.checkoutEnabled && !payload.commerceLive) {
    context.addIssue({
      code: "custom",
      message: "公開結帳必須在正式交易總開關開啟後才能啟用。",
      path: ["checkoutEnabled"],
    });
  }
  if (payload.ecpayApplePayEnabled && !payload.checkoutEnabled) {
    context.addIssue({
      code: "custom",
      message: "Apple Pay 必須在公開結帳開啟後才能啟用。",
      path: ["ecpayApplePayEnabled"],
    });
  }
});

const auditEventSchema = z.object({
  id: z.string().uuid(),
  actorScope: z.string().min(1).max(80),
  action: z.string().min(1).max(120),
  entityType: z.string().min(1).max(80),
  entityId: z.string().min(1).max(200),
  changedFields: z.array(z.string().min(1).max(120)),
  requestId: z.string().min(1).max(200),
  occurredAt: z.string().datetime({ offset: true }),
});

const auditPageSchema = z.object({
  items: z.array(auditEventSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(200),
  offset: z.number().int().nonnegative(),
});

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function runtimeControlsRequestHash(
  expectedVersion: number,
  payload: AdminRuntimeControlsPayload,
): string {
  return createHash("sha256")
    .update(stableJson({ operation: "runtime_controls.update", expectedVersion, payload }))
    .digest("hex");
}

export function runtimeControlsPayloadFromFormData(
  formData: FormData,
): AdminRuntimeControlsPayload {
  const checked = (name: keyof AdminRuntimeControlsPayload) => {
    const value = formData.get(name);
    return value === "on" || value === "true" || value === "1";
  };
  return runtimeControlsPayloadSchema.parse({
    commerceLive: checked("commerceLive"),
    checkoutEnabled: checked("checkoutEnabled"),
    productionCanaryEnabled: checked("productionCanaryEnabled"),
    ecpayApplePayEnabled: checked("ecpayApplePayEnabled"),
    searchIndexEnabled: checked("searchIndexEnabled"),
    catalogEmergencyNoCache: checked("catalogEmergencyNoCache"),
    mediaEmergencyNoCache: checked("mediaEmergencyNoCache"),
  });
}

function mapRpcError(error: RpcErrorLike): AdminRepositoryError {
  const source = [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");
  if (error.code === "PGRST202" || source.includes("42883")) {
    return new AdminRepositoryError(
      "ADMIN_GOVERNANCE_RPC_UNAVAILABLE",
      "Runtime Controls／Audit RPC 尚未就緒；所有高風險能力維持關閉。",
      503,
    );
  }
  const mappings: readonly [string, string, number][] = [
    ["ROW_VERSION_CONFLICT", "資料版本已更新，請重新整理後再試。", 409],
    ["IDEMPOTENCY_KEY_CONFLICT", "此操作識別碼已用於不同內容，請重新整理後再試。", 409],
    ["IDEMPOTENCY_COMMAND_IN_PROGRESS", "相同操作仍在處理中，請稍候再重新整理。", 409],
    ["CHECKOUT_REQUIRES_COMMERCE_LIVE", "公開結帳必須在正式交易總開關開啟後才能啟用。", 422],
    ["APPLE_PAY_REQUIRES_CHECKOUT", "Apple Pay 必須在公開結帳開啟後才能啟用。", 422],
    ["INVALID_RUNTIME_CONTROLS_PAYLOAD", "Runtime Controls 內容無效。", 422],
    ["INVALID_LAUNCH_ATTESTATION", "上線證據格式無效，請檢查版本與 SHA-256。", 422],
    ["INVALID_AUDIT_QUERY", "Audit 篩選條件無效。", 422],
    ["ADMIN_AAL2_REQUIRED", "此操作需要 AAL2 雙重驗證。", 403],
    ["RECENT_TOTP_REQUIRED", "此操作需要最近 10 分鐘內完成 TOTP。", 403],
    ["ADMIN_ROLE_FORBIDDEN", "只有 Owner 可以執行此操作。", 403],
    ["ADMIN_MEMBERSHIP_INACTIVE", "管理員 membership 未啟用。", 403],
  ];
  const mapped = mappings.find(([marker]) => source.includes(marker));
  if (mapped) return new AdminRepositoryError(mapped[0], mapped[1], mapped[2]);
  return new AdminRepositoryError(
    "ADMIN_GOVERNANCE_RPC_FAILED",
    "後台治理資料目前無法安全讀取或更新。",
    502,
  );
}

function parseRpcResponse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AdminRepositoryError(
      "ADMIN_GOVERNANCE_RPC_INVALID_RESPONSE",
      "後台治理 RPC 回傳格式不符合契約，功能已保持關閉。",
      502,
    );
  }
  return result.data;
}

async function requestRpcClient(): Promise<AdminGovernanceRpcClient> {
  const client = await getAdminAuthClient();
  return client.schema("api") as unknown as AdminGovernanceRpcClient;
}

export function createRpcAdminGovernanceAdapter(
  clientFactory: RpcClientFactory = requestRpcClient,
): AdminGovernanceAdapter {
  const call = async (
    name: string,
    args: Readonly<Record<string, unknown>> = {},
  ): Promise<unknown> => {
    const client = await clientFactory();
    const { data, error } = await client.rpc(name, args);
    if (error) throw mapRpcError(error);
    return data;
  };
  return {
    mode: "rpc",
    async readRuntimeControls() {
      return parseRpcResponse(runtimeControlsSchema, await call("admin_runtime_controls_read"));
    },
    async updateRuntimeControls(command) {
      const payload = runtimeControlsPayloadSchema.parse(command.payload);
      const mutation = parseRpcResponse(
        runtimeControlsMutationSchema,
        await call("admin_runtime_controls_update", {
          p_expected_version: command.expectedVersion,
          p_idempotency_key: command.idempotencyKey,
          p_request_hash: runtimeControlsRequestHash(command.expectedVersion, payload),
          p_payload: payload,
        }),
      );
      const controls = parseRpcResponse(
        runtimeControlsSchema,
        await call("admin_runtime_controls_read"),
      );
      if (controls.version < mutation.version) {
        throw new AdminRepositoryError(
          "ADMIN_GOVERNANCE_RPC_INVALID_RESPONSE",
          "後台治理 RPC 回傳格式不符合契約，功能已保持關閉。",
          502,
        );
      }
      return mutation.replayed ? { ...controls, replayed: true } : controls;
    },
    async recordLaunchAttestation(command) {
      const parsed = launchAttestationCommandSchema.parse(command);
      return parseRpcResponse(
        launchAttestationSchema,
        await call("admin_launch_attestation_record", {
          p_expected_controls_version: parsed.expectedControlsVersion,
          p_kind: parsed.kind,
          p_value: parsed.value,
          p_evidence_sha256: parsed.evidenceSha256,
          p_idempotency_key: parsed.idempotencyKey,
        }),
      );
    },
    async listAuditEvents(query) {
      const normalized = z.object({
        limit: z.number().int().min(1).max(200),
        offset: z.number().int().nonnegative(),
        entityType: z.string().trim().max(80).nullish(),
        action: z.string().trim().max(120).nullish(),
      }).parse(query);
      return parseRpcResponse(auditPageSchema, await call("admin_audit_list", {
        p_limit: normalized.limit,
        p_offset: normalized.offset,
        p_entity_type: normalized.entityType || null,
        p_action: normalized.action || null,
      }));
    },
  };
}

interface DemoGovernanceState {
  controls: AdminRuntimeControls;
  readonly audit: AdminAuditEvent[];
  readonly commands: Map<string, { readonly hash: string; readonly result: AdminRuntimeControls }>;
  readonly attestationCommands: Map<
    string,
    { readonly hash: string; readonly result: AdminLaunchAttestation }
  >;
}

const demoStateKey = Symbol.for("lignee.admin.governance-demo-state");
type DemoGlobal = typeof globalThis & { [demoStateKey]?: DemoGovernanceState };

function getDemoState(): DemoGovernanceState {
  const globalObject = globalThis as DemoGlobal;
  globalObject[demoStateKey] ??= {
    controls: {
      version: 1,
      mediaSafetyRevision: 1,
      commerceLive: false,
      checkoutEnabled: false,
      productionCanaryEnabled: false,
      ecpayApplePayEnabled: false,
      searchIndexEnabled: false,
      catalogEmergencyNoCache: false,
      mediaEmergencyNoCache: false,
      catalogApprovalRevision: null,
      legalApprovalRevision: null,
      canaryEvidenceSha256: null,
      updatedAt: "2026-07-27T00:00:00.000Z",
    },
    audit: [{
      id: "00000000-0000-4000-8000-000000000101",
      actorScope: "admin-demo",
      action: "catalog.demo.seeded",
      entityType: "catalog",
      entityId: "estate-no-01",
      changedFields: ["publication", "variants"],
      requestId: "demo-seed-estate-no-01",
      occurredAt: "2026-07-27T00:00:00.000Z",
    }],
    commands: new Map(),
    attestationCommands: new Map(),
  };
  return globalObject[demoStateKey];
}

const demoAdapter: AdminGovernanceAdapter = {
  mode: "demo",
  async readRuntimeControls() {
    return getDemoState().controls;
  },
  async updateRuntimeControls(command) {
    const state = getDemoState();
    const payload = runtimeControlsPayloadSchema.parse(command.payload);
    const hash = runtimeControlsRequestHash(command.expectedVersion, payload);
    const replay = state.commands.get(command.idempotencyKey);
    if (replay) {
      if (replay.hash !== hash) {
        throw new AdminRepositoryError(
          "IDEMPOTENCY_KEY_CONFLICT",
          "此操作識別碼已用於不同內容，請重新整理後再試。",
          409,
        );
      }
      return { ...replay.result, replayed: true };
    }
    if (state.controls.version !== command.expectedVersion) {
      throw new AdminRepositoryError(
        "ROW_VERSION_CONFLICT",
        "資料版本已更新，請重新整理後再試。",
        409,
      );
    }
    const result: AdminRuntimeControls = {
      ...state.controls,
      ...payload,
      version: state.controls.version + 1,
      updatedAt: new Date().toISOString(),
    };
    state.controls = result;
    state.commands.set(command.idempotencyKey, { hash, result });
    state.audit.unshift({
      id: randomUUID(),
      actorScope: "admin-demo",
      action: "runtime_controls.update",
      entityType: "runtime_controls",
      entityId: "singleton",
      changedFields: [...Object.keys(payload), "revision"],
      requestId: command.idempotencyKey,
      occurredAt: result.updatedAt,
    });
    return result;
  },
  async recordLaunchAttestation(command) {
    const state = getDemoState();
    const parsed = launchAttestationCommandSchema.parse(command);
    const hash = createHash("sha256")
      .update(stableJson({
        operation: "launch_attestation.record",
        expectedControlsVersion: parsed.expectedControlsVersion,
        kind: parsed.kind,
        value: parsed.value,
        evidenceSha256: parsed.evidenceSha256,
      }))
      .digest("hex");
    const replay = state.attestationCommands.get(parsed.idempotencyKey);
    if (replay) {
      if (replay.hash !== hash) {
        throw new AdminRepositoryError(
          "IDEMPOTENCY_KEY_CONFLICT",
          "此操作識別碼已用於不同內容，請重新整理後再試。",
          409,
        );
      }
      return { ...replay.result, replayed: true };
    }
    if (state.controls.version !== parsed.expectedControlsVersion) {
      throw new AdminRepositoryError(
        "ROW_VERSION_CONFLICT",
        "資料版本已更新，請重新整理後再試。",
        409,
      );
    }
    const recordedAt = new Date().toISOString();
    const id = randomUUID();
    const field = {
      catalog: "catalogApprovalRevision",
      legal: "legalApprovalRevision",
      canary: "canaryEvidenceSha256",
    }[parsed.kind] as
      | "catalogApprovalRevision"
      | "legalApprovalRevision"
      | "canaryEvidenceSha256";
    const nextControls: AdminRuntimeControls = {
      ...state.controls,
      [field]: parsed.value,
      version: state.controls.version + 1,
      updatedAt: recordedAt,
    };
    state.controls = nextControls;
    const result: AdminLaunchAttestation = {
      id,
      kind: parsed.kind,
      value: parsed.value,
      evidenceSha256: parsed.evidenceSha256,
      controlsVersion: nextControls.version,
      recordedAt,
    };
    state.attestationCommands.set(parsed.idempotencyKey, { hash, result });
    state.audit.unshift({
      id: randomUUID(),
      actorScope: "admin-demo",
      action: "launch_attestation.record",
      entityType: "launch_attestation",
      entityId: id,
      changedFields: ["kind", "value", "evidence_sha256", "runtime_controls.revision"],
      requestId: parsed.idempotencyKey,
      occurredAt: recordedAt,
    });
    return result;
  },
  async listAuditEvents(query) {
    const entityType = query.entityType?.trim();
    const action = query.action?.trim();
    const matches = getDemoState().audit.filter((event) =>
      (!entityType || event.entityType === entityType)
      && (!action || event.action === action),
    );
    return {
      items: matches.slice(query.offset, query.offset + query.limit),
      total: matches.length,
      limit: query.limit,
      offset: query.offset,
    };
  },
};

class UnavailableAdminGovernanceAdapter implements AdminGovernanceAdapter {
  readonly mode = "rpc-unavailable" as const;

  private unavailable(): never {
    throw new AdminRepositoryError(
      "ADMIN_GOVERNANCE_RPC_UNAVAILABLE",
      "Runtime Controls／Audit RPC 尚未綁定；所有高風險能力維持關閉。",
      503,
    );
  }

  async readRuntimeControls(): Promise<AdminRuntimeControls> { return this.unavailable(); }
  async updateRuntimeControls(): Promise<AdminRuntimeControls> { return this.unavailable(); }
  async recordLaunchAttestation(): Promise<AdminLaunchAttestation> {
    return this.unavailable();
  }
  async listAuditEvents(): Promise<AdminAuditPage> { return this.unavailable(); }
}

const rpcAdapter = createRpcAdminGovernanceAdapter();
const unavailableAdapter = new UnavailableAdminGovernanceAdapter();

export function getAdminGovernanceAdapter(): AdminGovernanceAdapter {
  if (getCommerceEnvironment().mode === "demo") return demoAdapter;
  return process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY
    ? rpcAdapter
    : unavailableAdapter;
}
