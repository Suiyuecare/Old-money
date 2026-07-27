import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

import { getCommerceEnvironment } from "@/lib/commerce/config";

import { getAdminAuthClient } from "./auth";
import { AdminRepositoryError } from "./errors";
import type { AdminRole } from "./types";

export type AdminAppointmentState =
  | "requested"
  | "confirmed"
  | "completed"
  | "cancelled";
export type AdminAppointmentKind =
  | "private_showing"
  | "fitting"
  | "store_visit";

export interface AdminAppointmentProjection {
  readonly id: string;
  readonly reference: string;
  readonly kind: AdminAppointmentKind;
  readonly state: AdminAppointmentState;
  readonly scheduledFor: string | null;
  readonly hasContact: boolean;
  readonly hasMessage: boolean;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly replayed?: boolean;
}

export type AdminNewsletterConsentState =
  | "pending"
  | "subscribed"
  | "unsubscribed";

export interface AdminNewsletterConsentProjection {
  readonly id: string;
  readonly reference: string;
  readonly state: AdminNewsletterConsentState;
  readonly version: number;
  readonly consentedAt: string | null;
  readonly unsubscribedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly replayed?: boolean;
}

export type AdminNewsletterCampaignState =
  | "draft"
  | "review"
  | "approved"
  | "archived";

export interface AdminNewsletterCampaignDraft {
  readonly id: string;
  readonly title: string;
  readonly subject: string;
  readonly previewText: string;
  readonly contentMarkdown: string;
  readonly state: AdminNewsletterCampaignState;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deliveryEnabled: false;
  readonly replayed?: boolean;
}

export interface AdminEngagementPage<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface AdminEngagementQuery<State extends string> {
  readonly state?: State | null;
  readonly limit?: number;
  readonly offset?: number;
}

export interface AdminEngagementCommandContext {
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
}

export interface AdminNewsletterCampaignInput {
  readonly title: string;
  readonly subject: string;
  readonly previewText: string;
  readonly contentMarkdown: string;
}

export interface AdminEngagementAdapter {
  readonly mode: "demo" | "rpc" | "rpc-unavailable";
  listAppointments(
    query?: AdminEngagementQuery<AdminAppointmentState>,
  ): Promise<AdminEngagementPage<AdminAppointmentProjection>>;
  transitionAppointment(
    input: {
      readonly appointmentId: string;
      readonly targetState: Exclude<AdminAppointmentState, "requested">;
      readonly scheduledFor: string | null;
    },
    context: AdminEngagementCommandContext,
  ): Promise<AdminAppointmentProjection>;
  listNewsletterConsents(
    query?: AdminEngagementQuery<AdminNewsletterConsentState>,
  ): Promise<AdminEngagementPage<AdminNewsletterConsentProjection>>;
  unsubscribeNewsletterConsent(
    consentId: string,
    context: AdminEngagementCommandContext,
  ): Promise<AdminNewsletterConsentProjection>;
  listNewsletterCampaigns(
    query?: AdminEngagementQuery<AdminNewsletterCampaignState>,
  ): Promise<AdminEngagementPage<AdminNewsletterCampaignDraft>>;
  createNewsletterCampaign(
    input: AdminNewsletterCampaignInput,
    context: AdminEngagementCommandContext,
  ): Promise<AdminNewsletterCampaignDraft>;
  updateNewsletterCampaign(
    campaignId: string,
    input: AdminNewsletterCampaignInput,
    context: AdminEngagementCommandContext,
  ): Promise<AdminNewsletterCampaignDraft>;
  transitionNewsletterCampaign(
    campaignId: string,
    targetState: "draft" | "review" | "archived",
    context: AdminEngagementCommandContext,
  ): Promise<AdminNewsletterCampaignDraft>;
}

export interface RoleScopedNewsletterReadAdapter {
  readonly listCampaigns:
    | AdminEngagementAdapter["listNewsletterCampaigns"]
    | null;
  readonly listConsents:
    | AdminEngagementAdapter["listNewsletterConsents"]
    | null;
}

export function createRoleScopedNewsletterReadAdapter(
  role: AdminRole,
  adapterFactory: () => AdminEngagementAdapter =
    getAdminEngagementAdapter,
): RoleScopedNewsletterReadAdapter {
  const canManageCampaigns =
    role === "owner" || role === "merchandiser";
  const canManageConsents =
    role === "owner" || role === "support";
  return {
    listCampaigns: canManageCampaigns
      ? (query) => adapterFactory().listNewsletterCampaigns(query)
      : null,
    listConsents: canManageConsents
      ? (query) => adapterFactory().listNewsletterConsents(query)
      : null,
  };
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

export interface AdminEngagementRpcClient {
  rpc(
    name: string,
    args?: Readonly<Record<string, unknown>>,
  ): Promise<RpcResult>;
}

type RpcClientFactory = () => Promise<AdminEngagementRpcClient>;

const appointmentSchema = z.strictObject({
  id: z.string().uuid(),
  reference: z.string().regex(/^APT-[A-F0-9]{10}$/),
  kind: z.enum(["private_showing", "fitting", "store_visit"]),
  state: z.enum(["requested", "confirmed", "completed", "cancelled"]),
  scheduledFor: z.string().datetime({ offset: true }).nullable(),
  hasContact: z.boolean(),
  hasMessage: z.boolean(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  replayed: z.boolean().optional(),
});

const consentSchema = z.strictObject({
  id: z.string().uuid(),
  reference: z.string().regex(/^CONSENT-[A-F0-9]{10}$/),
  state: z.enum(["pending", "subscribed", "unsubscribed"]),
  version: z.number().int().positive(),
  consentedAt: z.string().datetime({ offset: true }).nullable(),
  unsubscribedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  replayed: z.boolean().optional(),
});

export const newsletterCampaignInputSchema = z.strictObject({
  title: z.string().trim().min(1, "請輸入內部標題。").max(160),
  subject: z.string().trim().min(1, "請輸入 Email 主旨。").max(200),
  previewText: z.string().max(300),
  contentMarkdown: z.string().trim().min(1, "請輸入內容草稿。").max(50_000),
});

const campaignSchema = z.strictObject({
  id: z.string().uuid(),
  title: z.string().min(1).max(160),
  subject: z.string().min(1).max(200),
  previewText: z.string().max(300),
  contentMarkdown: z.string().min(1).max(50_000),
  state: z.enum(["draft", "review", "approved", "archived"]),
  version: z.number().int().positive(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  deliveryEnabled: z.literal(false),
  replayed: z.boolean().optional(),
});

function pageSchema<T>(item: z.ZodType<T>) {
  return z.strictObject({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    limit: z.number().int().min(1).max(100),
    offset: z.number().int().nonnegative(),
  });
}

function parseResponse<T>(
  schema: z.ZodType<T>,
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AdminRepositoryError(
      "ADMIN_ENGAGEMENT_RPC_INVALID_RESPONSE",
      "預約／電子報 RPC 回傳格式無效；功能已安全關閉。",
      502,
    );
  }
  return parsed.data;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function adminEngagementRequestHash(
  operation: string,
  payload: unknown,
): string {
  return createHash("sha256")
    .update(stableJson({ operation, payload }))
    .digest("hex");
}

function normalizedQuery<State extends string>(
  query: AdminEngagementQuery<State> = {},
) {
  return {
    state: query.state ?? null,
    limit: query.limit ?? 50,
    offset: query.offset ?? 0,
  };
}

function rpcError(error: RpcErrorLike): AdminRepositoryError {
  const source = [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");
  const mappings: readonly [string, string, number][] = [
    ["ROW_VERSION_CONFLICT", "資料已在另一個工作階段更新，請重新整理。", 409],
    ["IDEMPOTENCY_KEY_CONFLICT", "操作識別碼已用於不同內容，請重新整理。", 409],
    ["IDEMPOTENCY_COMMAND_IN_PROGRESS", "相同操作仍在處理中，請稍候再試。", 409],
    ["APPOINTMENT_NOT_FOUND", "找不到指定預約。", 404],
    ["NEWSLETTER_CONSENT_NOT_FOUND", "找不到指定訂閱同意紀錄。", 404],
    ["NEWSLETTER_CAMPAIGN_NOT_FOUND", "找不到指定電子報草稿。", 404],
    ["INVALID_APPOINTMENT_STATE_TRANSITION", "此預約狀態不可執行這項變更。", 422],
    ["APPOINTMENT_SCHEDULE_REQUIRED", "確認預約時必須指定時段。", 422],
    ["NEWSLETTER_CONSENT_ALREADY_UNSUBSCRIBED", "此紀錄已停止寄送。", 409],
    ["NEWSLETTER_CAMPAIGN_NOT_EDITABLE", "只有草稿狀態可編輯內容。", 422],
    ["INVALID_NEWSLETTER_CAMPAIGN_STATE_TRANSITION", "此電子報狀態不可執行這項變更。", 422],
    ["NEWSLETTER_DELIVERY_NOT_CONFIGURED", "正式寄送尚未設定，核准與寄送維持關閉。", 503],
    ["ADMIN_AAL2_REQUIRED", "此操作需要 AAL2 雙重驗證。", 403],
    ["RECENT_TOTP_REQUIRED", "此操作需要最近 10 分鐘內完成 TOTP。", 403],
    ["ADMIN_ROLE_FORBIDDEN", "目前角色無權執行此操作。", 403],
    ["ADMIN_MEMBERSHIP_INACTIVE", "管理員 membership 未啟用。", 403],
  ];
  const mapped = mappings.find(([marker]) => source.includes(marker));
  if (mapped) {
    return new AdminRepositoryError(mapped[0], mapped[1], mapped[2]);
  }
  return new AdminRepositoryError(
    "ADMIN_ENGAGEMENT_RPC_UNAVAILABLE",
    "預約／電子報 durable RPC 尚未就緒；操作已保持 fail-closed。",
    error.code === "PGRST202" || source.includes("42883") ? 503 : 502,
  );
}

async function requestRpcClient(): Promise<AdminEngagementRpcClient> {
  const client = await getAdminAuthClient();
  return client.schema("api") as unknown as AdminEngagementRpcClient;
}

export function createRpcAdminEngagementAdapter(
  clientFactory: RpcClientFactory = requestRpcClient,
): AdminEngagementAdapter {
  const call = async (
    name: string,
    args: Readonly<Record<string, unknown>> = {},
  ) => {
    const client = await clientFactory();
    const { data, error } = await client.rpc(name, args);
    if (error) throw rpcError(error);
    return data;
  };
  return {
    mode: "rpc",
    async listAppointments(query = {}) {
      const normalized = normalizedQuery(query);
      return parseResponse(
        pageSchema(appointmentSchema),
        await call("admin_appointments_list", {
          p_state: normalized.state,
          p_limit: normalized.limit,
          p_offset: normalized.offset,
        }),
      );
    },
    async transitionAppointment(input, context) {
      const payload = {
        appointmentId: input.appointmentId,
        expectedVersion: context.expectedVersion,
        targetState: input.targetState,
        scheduledFor: input.scheduledFor,
      };
      return parseResponse(
        appointmentSchema,
        await call("admin_appointment_state_command", {
          p_appointment_id: input.appointmentId,
          p_expected_version: context.expectedVersion,
          p_target_state: input.targetState,
          p_scheduled_for: input.scheduledFor,
          p_idempotency_key: context.idempotencyKey,
          p_request_hash: adminEngagementRequestHash(
            "appointment.state",
            payload,
          ),
        }),
      );
    },
    async listNewsletterConsents(query = {}) {
      const normalized = normalizedQuery(query);
      return parseResponse(
        pageSchema(consentSchema),
        await call("admin_newsletter_consents_list", {
          p_state: normalized.state,
          p_limit: normalized.limit,
          p_offset: normalized.offset,
        }),
      );
    },
    async unsubscribeNewsletterConsent(consentId, context) {
      const payload = {
        consentId,
        expectedVersion: context.expectedVersion,
        targetState: "unsubscribed",
      };
      return parseResponse(
        consentSchema,
        await call("admin_newsletter_consent_command", {
          p_consent_id: consentId,
          p_expected_version: context.expectedVersion,
          p_target_state: "unsubscribed",
          p_idempotency_key: context.idempotencyKey,
          p_request_hash: adminEngagementRequestHash(
            "newsletter.consent",
            payload,
          ),
        }),
      );
    },
    async listNewsletterCampaigns(query = {}) {
      const normalized = normalizedQuery(query);
      return parseResponse(
        pageSchema(campaignSchema),
        await call("admin_newsletter_campaigns_list", {
          p_state: normalized.state,
          p_limit: normalized.limit,
          p_offset: normalized.offset,
        }),
      );
    },
    async createNewsletterCampaign(input, context) {
      const validated = newsletterCampaignInputSchema.parse(input);
      const payload = {
        expectedVersion: context.expectedVersion,
        ...validated,
      };
      return parseResponse(
        campaignSchema,
        await call("admin_newsletter_campaign_create", {
          p_expected_version: context.expectedVersion,
          p_title: validated.title,
          p_subject: validated.subject,
          p_preview_text: validated.previewText,
          p_content_markdown: validated.contentMarkdown,
          p_idempotency_key: context.idempotencyKey,
          p_request_hash: adminEngagementRequestHash(
            "newsletter.campaign.create",
            payload,
          ),
        }),
      );
    },
    async updateNewsletterCampaign(campaignId, input, context) {
      const validated = newsletterCampaignInputSchema.parse(input);
      const payload = {
        campaignId,
        expectedVersion: context.expectedVersion,
        ...validated,
      };
      return parseResponse(
        campaignSchema,
        await call("admin_newsletter_campaign_update", {
          p_campaign_id: campaignId,
          p_expected_version: context.expectedVersion,
          p_title: validated.title,
          p_subject: validated.subject,
          p_preview_text: validated.previewText,
          p_content_markdown: validated.contentMarkdown,
          p_idempotency_key: context.idempotencyKey,
          p_request_hash: adminEngagementRequestHash(
            "newsletter.campaign.update",
            payload,
          ),
        }),
      );
    },
    async transitionNewsletterCampaign(
      campaignId,
      targetState,
      context,
    ) {
      const payload = {
        campaignId,
        expectedVersion: context.expectedVersion,
        targetState,
      };
      return parseResponse(
        campaignSchema,
        await call("admin_newsletter_campaign_state_command", {
          p_campaign_id: campaignId,
          p_expected_version: context.expectedVersion,
          p_target_state: targetState,
          p_idempotency_key: context.idempotencyKey,
          p_request_hash: adminEngagementRequestHash(
            "newsletter.campaign.state",
            payload,
          ),
        }),
      );
    },
  };
}

interface DemoReceipt {
  readonly hash: string;
  readonly result:
    | AdminAppointmentProjection
    | AdminNewsletterConsentProjection
    | AdminNewsletterCampaignDraft;
}

interface DemoEngagementState {
  readonly appointments: Map<string, AdminAppointmentProjection>;
  readonly consents: Map<string, AdminNewsletterConsentProjection>;
  readonly campaigns: Map<string, AdminNewsletterCampaignDraft>;
  readonly receipts: Map<string, DemoReceipt>;
}

const demoStateKey = Symbol.for("lignee.admin.engagement-demo-state");
type DemoGlobal = typeof globalThis & {
  [demoStateKey]?: DemoEngagementState;
};

function createDemoState(): DemoEngagementState {
  const appointment: AdminAppointmentProjection = {
    id: "00000000-0000-4000-8000-000000000701",
    reference: "APT-0000000000",
    kind: "private_showing",
    state: "requested",
    scheduledFor: null,
    hasContact: true,
    hasMessage: true,
    version: 1,
    createdAt: "2026-07-27T01:00:00.000Z",
    updatedAt: "2026-07-27T01:00:00.000Z",
  };
  const consent: AdminNewsletterConsentProjection = {
    id: "00000000-0000-4000-8000-000000000702",
    reference: "CONSENT-0000000000",
    state: "subscribed",
    version: 1,
    consentedAt: "2026-07-27T00:30:00.000Z",
    unsubscribedAt: null,
    createdAt: "2026-07-27T00:30:00.000Z",
    updatedAt: "2026-07-27T00:30:00.000Z",
  };
  const campaign: AdminNewsletterCampaignDraft = {
    id: "00000000-0000-4000-8000-000000000703",
    title: "Letters from the Estate · No. 01",
    subject: "The Private Court",
    previewText: "Notes from an afternoon on the grass court.",
    contentMarkdown: "A considered note from the LIGNÉE estate.",
    state: "draft",
    version: 1,
    createdAt: "2026-07-27T00:20:00.000Z",
    updatedAt: "2026-07-27T00:20:00.000Z",
    deliveryEnabled: false,
  };
  return {
    appointments: new Map([[appointment.id, appointment]]),
    consents: new Map([[consent.id, consent]]),
    campaigns: new Map([[campaign.id, campaign]]),
    receipts: new Map(),
  };
}

function demoState(): DemoEngagementState {
  const globalObject = globalThis as DemoGlobal;
  globalObject[demoStateKey] ??= createDemoState();
  return globalObject[demoStateKey];
}

function demoPage<T extends { readonly updatedAt: string }>(
  items: readonly T[],
  query: AdminEngagementQuery<string> = {},
): AdminEngagementPage<T> {
  const normalized = normalizedQuery(query);
  const matches = [...items]
    .filter((item) =>
      !normalized.state
      || ("state" in item && item.state === normalized.state),
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return {
    items: matches.slice(
      normalized.offset,
      normalized.offset + normalized.limit,
    ),
    total: matches.length,
    limit: normalized.limit,
    offset: normalized.offset,
  };
}

function demoReplay<T extends DemoReceipt["result"]>(
  key: string,
  hash: string,
): T | null {
  const receipt = demoState().receipts.get(key);
  if (!receipt) return null;
  if (receipt.hash !== hash) {
    throw new AdminRepositoryError(
      "IDEMPOTENCY_KEY_CONFLICT",
      "操作識別碼已用於不同內容。",
      409,
    );
  }
  return { ...receipt.result, replayed: true } as T;
}

function rememberDemo(
  key: string,
  hash: string,
  result: DemoReceipt["result"],
): void {
  demoState().receipts.set(key, { hash, result });
}

const demoAdapter: AdminEngagementAdapter = {
  mode: "demo",
  async listAppointments(query = {}) {
    return demoPage([...demoState().appointments.values()], query);
  },
  async transitionAppointment(input, context) {
    const payload = {
      ...input,
      expectedVersion: context.expectedVersion,
    };
    const hash = adminEngagementRequestHash("appointment.state", payload);
    const replay = demoReplay<AdminAppointmentProjection>(
      context.idempotencyKey,
      hash,
    );
    if (replay) return replay;
    const current = demoState().appointments.get(input.appointmentId);
    if (!current) {
      throw new AdminRepositoryError(
        "APPOINTMENT_NOT_FOUND",
        "找不到指定預約。",
        404,
      );
    }
    if (current.version !== context.expectedVersion) {
      throw new AdminRepositoryError(
        "ROW_VERSION_CONFLICT",
        "資料已更新，請重新整理。",
        409,
      );
    }
    const valid = (
      current.state === "requested"
      && ["confirmed", "cancelled"].includes(input.targetState)
    ) || (
      current.state === "confirmed"
      && ["confirmed", "completed", "cancelled"].includes(
        input.targetState,
      )
    );
    if (!valid || (input.targetState === "confirmed" && !input.scheduledFor)) {
      throw new AdminRepositoryError(
        "INVALID_APPOINTMENT_STATE_TRANSITION",
        "此預約狀態不可執行這項變更。",
        422,
      );
    }
    const updated: AdminAppointmentProjection = {
      ...current,
      state: input.targetState,
      scheduledFor: input.targetState === "confirmed"
        ? input.scheduledFor
        : current.scheduledFor,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    demoState().appointments.set(current.id, updated);
    rememberDemo(context.idempotencyKey, hash, updated);
    return updated;
  },
  async listNewsletterConsents(query = {}) {
    return demoPage([...demoState().consents.values()], query);
  },
  async unsubscribeNewsletterConsent(consentId, context) {
    const payload = {
      consentId,
      expectedVersion: context.expectedVersion,
      targetState: "unsubscribed",
    };
    const hash = adminEngagementRequestHash("newsletter.consent", payload);
    const replay = demoReplay<AdminNewsletterConsentProjection>(
      context.idempotencyKey,
      hash,
    );
    if (replay) return replay;
    const current = demoState().consents.get(consentId);
    if (!current) {
      throw new AdminRepositoryError(
        "NEWSLETTER_CONSENT_NOT_FOUND",
        "找不到指定訂閱同意紀錄。",
        404,
      );
    }
    if (current.version !== context.expectedVersion) {
      throw new AdminRepositoryError(
        "ROW_VERSION_CONFLICT",
        "資料已更新，請重新整理。",
        409,
      );
    }
    if (current.state === "unsubscribed") {
      throw new AdminRepositoryError(
        "NEWSLETTER_CONSENT_ALREADY_UNSUBSCRIBED",
        "此紀錄已停止寄送。",
        409,
      );
    }
    const updated: AdminNewsletterConsentProjection = {
      ...current,
      state: "unsubscribed",
      unsubscribedAt: new Date().toISOString(),
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    demoState().consents.set(current.id, updated);
    rememberDemo(context.idempotencyKey, hash, updated);
    return updated;
  },
  async listNewsletterCampaigns(query = {}) {
    return demoPage([...demoState().campaigns.values()], query);
  },
  async createNewsletterCampaign(input, context) {
    const validated = newsletterCampaignInputSchema.parse(input);
    const payload = {
      expectedVersion: context.expectedVersion,
      ...validated,
    };
    const hash = adminEngagementRequestHash(
      "newsletter.campaign.create",
      payload,
    );
    const replay = demoReplay<AdminNewsletterCampaignDraft>(
      context.idempotencyKey,
      hash,
    );
    if (replay) return replay;
    if (context.expectedVersion !== 0) {
      throw new AdminRepositoryError(
        "ROW_VERSION_CONFLICT",
        "新草稿的預期版本必須是 0。",
        409,
      );
    }
    const now = new Date().toISOString();
    const created: AdminNewsletterCampaignDraft = {
      id: randomUUID(),
      ...validated,
      state: "draft",
      version: 1,
      createdAt: now,
      updatedAt: now,
      deliveryEnabled: false,
    };
    demoState().campaigns.set(created.id, created);
    rememberDemo(context.idempotencyKey, hash, created);
    return created;
  },
  async updateNewsletterCampaign(campaignId, input, context) {
    const validated = newsletterCampaignInputSchema.parse(input);
    const payload = {
      campaignId,
      expectedVersion: context.expectedVersion,
      ...validated,
    };
    const hash = adminEngagementRequestHash(
      "newsletter.campaign.update",
      payload,
    );
    const replay = demoReplay<AdminNewsletterCampaignDraft>(
      context.idempotencyKey,
      hash,
    );
    if (replay) return replay;
    const current = demoState().campaigns.get(campaignId);
    if (!current) {
      throw new AdminRepositoryError(
        "NEWSLETTER_CAMPAIGN_NOT_FOUND",
        "找不到指定電子報草稿。",
        404,
      );
    }
    if (current.version !== context.expectedVersion) {
      throw new AdminRepositoryError(
        "ROW_VERSION_CONFLICT",
        "資料已更新，請重新整理。",
        409,
      );
    }
    if (current.state !== "draft") {
      throw new AdminRepositoryError(
        "NEWSLETTER_CAMPAIGN_NOT_EDITABLE",
        "只有草稿狀態可編輯。",
        422,
      );
    }
    const updated: AdminNewsletterCampaignDraft = {
      ...current,
      ...validated,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    demoState().campaigns.set(current.id, updated);
    rememberDemo(context.idempotencyKey, hash, updated);
    return updated;
  },
  async transitionNewsletterCampaign(
    campaignId,
    targetState,
    context,
  ) {
    const payload = {
      campaignId,
      expectedVersion: context.expectedVersion,
      targetState,
    };
    const hash = adminEngagementRequestHash(
      "newsletter.campaign.state",
      payload,
    );
    const replay = demoReplay<AdminNewsletterCampaignDraft>(
      context.idempotencyKey,
      hash,
    );
    if (replay) return replay;
    const current = demoState().campaigns.get(campaignId);
    if (!current) {
      throw new AdminRepositoryError(
        "NEWSLETTER_CAMPAIGN_NOT_FOUND",
        "找不到指定電子報草稿。",
        404,
      );
    }
    if (current.version !== context.expectedVersion) {
      throw new AdminRepositoryError(
        "ROW_VERSION_CONFLICT",
        "資料已更新，請重新整理。",
        409,
      );
    }
    const valid = (
      current.state === "draft" && targetState === "review"
    ) || (
      current.state === "review" && targetState === "draft"
    ) || (
      ["draft", "review", "approved"].includes(current.state)
      && targetState === "archived"
    );
    if (!valid) {
      throw new AdminRepositoryError(
        "INVALID_NEWSLETTER_CAMPAIGN_STATE_TRANSITION",
        "此電子報狀態不可執行這項變更。",
        422,
      );
    }
    const updated: AdminNewsletterCampaignDraft = {
      ...current,
      state: targetState,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    demoState().campaigns.set(current.id, updated);
    rememberDemo(context.idempotencyKey, hash, updated);
    return updated;
  },
};

class UnavailableAdminEngagementAdapter
implements AdminEngagementAdapter {
  readonly mode = "rpc-unavailable" as const;

  private unavailable(): never {
    throw new AdminRepositoryError(
      "ADMIN_ENGAGEMENT_RPC_UNAVAILABLE",
      "預約／電子報 durable RPC 尚未綁定；功能已保持關閉。",
      503,
    );
  }

  async listAppointments(): Promise<
    AdminEngagementPage<AdminAppointmentProjection>
  > {
    return this.unavailable();
  }

  async transitionAppointment(): Promise<AdminAppointmentProjection> {
    return this.unavailable();
  }

  async listNewsletterConsents(): Promise<
    AdminEngagementPage<AdminNewsletterConsentProjection>
  > {
    return this.unavailable();
  }

  async unsubscribeNewsletterConsent(): Promise<
    AdminNewsletterConsentProjection
  > {
    return this.unavailable();
  }

  async listNewsletterCampaigns(): Promise<
    AdminEngagementPage<AdminNewsletterCampaignDraft>
  > {
    return this.unavailable();
  }

  async createNewsletterCampaign(): Promise<
    AdminNewsletterCampaignDraft
  > {
    return this.unavailable();
  }

  async updateNewsletterCampaign(): Promise<
    AdminNewsletterCampaignDraft
  > {
    return this.unavailable();
  }

  async transitionNewsletterCampaign(): Promise<
    AdminNewsletterCampaignDraft
  > {
    return this.unavailable();
  }
}

const rpcAdapter = createRpcAdminEngagementAdapter();
const unavailableAdapter = new UnavailableAdminEngagementAdapter();

export function getAdminEngagementAdapter(): AdminEngagementAdapter {
  if (getCommerceEnvironment().mode === "demo") return demoAdapter;
  return process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY
    ? rpcAdapter
    : unavailableAdapter;
}

export function resetDemoAdminEngagementForTests(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Demo engagement state may only be reset by tests.");
  }
  const globalObject = globalThis as DemoGlobal;
  globalObject[demoStateKey] = createDemoState();
}
