import { getCommerceEnvironment } from "@/lib/commerce/config";

import { getAdminAuthClient } from "./auth";
import { AdminRepositoryError } from "./errors";
import type { AdminRole } from "./types";

export function isProductionStaffInviteEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return (
    environment.NODE_ENV === "production"
    && environment.VERCEL_ENV === "production"
    && environment.LIGNEE_MODE !== "demo"
    && Boolean(environment.SUPABASE_URL)
    && Boolean(environment.SUPABASE_PUBLISHABLE_KEY)
    && Boolean(environment.SUPABASE_SECRET_KEY)
  );
}

export type AdminStaffState = "active" | "suspended" | "revoked";

export interface AdminStaffMembership {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: AdminRole;
  readonly state: AdminStaffState;
  readonly version: number;
  readonly sessionsRevokedAt: string | null;
  readonly updatedAt: string;
}

export interface AdminOwnerRecoveryContext {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly aal: "aal1" | "aal2";
  readonly pendingRequest: {
    readonly requestId: string;
    readonly state: "pending";
    readonly rowVersion: number;
    readonly requestedAt: string;
  } | null;
  readonly demo: boolean;
}

export interface StaffRpcContext {
  readonly idempotencyKey: string;
  readonly requestHash: string;
}

interface RpcErrorLike {
  readonly code?: string;
  readonly message?: string;
  readonly details?: string;
  readonly hint?: string;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function staffRpcError(error: RpcErrorLike): AdminRepositoryError {
  const source = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ");
  if (source.includes("LAST_ACTIVE_OWNER")) {
    return new AdminRepositoryError(
      "LAST_ACTIVE_OWNER",
      "不能停權、撤銷或降級最後一位 active Owner。",
      409,
    );
  }
  if (source.includes("ROW_VERSION_CONFLICT")) {
    return new AdminRepositoryError(
      "ROW_VERSION_CONFLICT",
      "人員資料已被另一個工作階段更新，請重新整理後再試。",
      409,
    );
  }
  if (
    source.includes("RECOVERY_APPROVER_MUST_DIFFER")
    || source.includes("SECOND_OWNER_APPROVAL_REQUIRED")
  ) {
    return new AdminRepositoryError(
      "RECOVERY_APPROVER_MUST_DIFFER",
      "帳號復原必須由另一位 Owner 核准。",
      403,
    );
  }
  if (
    source.includes("OWNER_RECOVERY_IDENTITY_REQUIRED") ||
    source.includes("OWNER_RECOVERY_FORBIDDEN") ||
    source.includes("ADMIN_SESSION_REVOKED")
  ) {
    return new AdminRepositoryError(
      "OWNER_RECOVERY_ACCESS_DENIED",
      "只有目前已驗證密碼 session 的 active Owner 能替自己提出復原申請。",
      403,
    );
  }
  if (
    source.includes("owner_recovery_one_pending_target") ||
    source.includes("duplicate key value violates unique constraint")
  ) {
    return new AdminRepositoryError(
      "OWNER_RECOVERY_ALREADY_PENDING",
      "此 Owner 已有等待另一位 Owner 核准的復原申請。",
      409,
    );
  }
  if (source.includes("IDEMPOTENCY")) {
    return new AdminRepositoryError(
      "IDEMPOTENCY_CONFLICT",
      "操作識別碼已用於不同內容，請重新整理後再試。",
      409,
    );
  }
  return new AdminRepositoryError(
    "STAFF_RPC_UNAVAILABLE",
    "人員與復原 RPC 尚未就緒；操作已保持 fail-closed。",
    error.code === "PGRST202" ? 503 : 502,
  );
}

async function staffRpc(
  name: string,
  args: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  if (getCommerceEnvironment().mode === "demo") {
    throw new AdminRepositoryError(
      "STAFF_RPC_DEMO_DISABLED",
      "Demo 不模擬帳號權限變更；正式 durable RPC 綁定前保持關閉。",
      503,
    );
  }
  const client = await getAdminAuthClient();
  const { data, error } = await client.schema("api").rpc(name, args);
  if (error) throw staffRpcError(error);
  return data;
}

function membership(value: unknown): AdminStaffMembership {
  const item = record(value);
  const role = text(item.role);
  const state = text(item.state);
  return {
    userId: text(item.userId, text(item.user_id)),
    email: text(item.email, "未提供 Email"),
    displayName: text(item.displayName, text(item.display_name, "未命名管理員")),
    role: ["owner", "merchandiser", "fulfillment", "support"].includes(role)
      ? role as AdminRole
      : "support",
    state: ["active", "suspended", "revoked"].includes(state)
      ? state as AdminStaffState
      : "revoked",
    version: typeof item.version === "number"
      ? item.version
      : typeof item.rowVersion === "number"
        ? item.rowVersion
        : 1,
    sessionsRevokedAt: text(item.sessionsRevokedAt, text(item.sessions_revoked_at)) || null,
    updatedAt: text(item.updatedAt, text(item.updated_at, "1970-01-01T00:00:00.000Z")),
  };
}

export async function listAdminStaff(): Promise<readonly AdminStaffMembership[]> {
  if (getCommerceEnvironment().mode === "demo") {
    return [{
      userId: "demo-owner",
      email: "demo@estatelignee.com",
      displayName: "Demo Owner",
      role: "owner",
      state: "active",
      version: 1,
      sessionsRevokedAt: null,
      updatedAt: "2026-07-27T00:00:00.000Z",
    }];
  }
  const data = await staffRpc("admin_staff_list", {
    p_limit: 100,
    p_offset: 0,
  });
  const value = record(data);
  const items = Array.isArray(value.items) ? value.items : Array.isArray(data) ? data : [];
  return items.map(membership);
}

export async function getAdminOwnerRecoveryContext(): Promise<AdminOwnerRecoveryContext> {
  if (getCommerceEnvironment().mode === "demo") {
    return {
      userId: "demo-owner",
      email: "demo@estatelignee.com",
      displayName: "Demo Owner",
      aal: "aal1",
      pendingRequest: null,
      demo: true,
    };
  }
  const item = record(await staffRpc("admin_owner_recovery_context", {}));
  const pending = item.pendingRequest === null
    ? null
    : record(item.pendingRequest);
  const userId = text(item.userId);
  const email = text(item.email);
  const aal = text(item.aal);
  if (
    !userId ||
    !email ||
    (aal !== "aal1" && aal !== "aal2") ||
    (
      pending &&
      (
        !text(pending.requestId) ||
        text(pending.state) !== "pending" ||
        !Number.isInteger(pending.rowVersion) ||
        !text(pending.requestedAt)
      )
    )
  ) {
    throw new AdminRepositoryError(
      "OWNER_RECOVERY_CONTEXT_INVALID",
      "Owner 復原身分資料格式無效；申請入口已安全關閉。",
      502,
    );
  }
  return {
    userId,
    email,
    displayName: text(item.displayName, email.split("@")[0]),
    aal,
    pendingRequest: pending
      ? {
          requestId: text(pending.requestId),
          state: "pending",
          rowVersion: pending.rowVersion as number,
          requestedAt: text(pending.requestedAt),
        }
      : null,
    demo: false,
  };
}

export async function changeAdminStaffState(
  input: {
    readonly userId: string;
    readonly expectedVersion: number;
    readonly state: AdminStaffState;
    readonly role: AdminRole;
  },
  context: StaffRpcContext,
): Promise<AdminStaffMembership> {
  return membership(await staffRpc("admin_staff_state_command", {
    p_user_id: input.userId,
    p_expected_version: input.expectedVersion,
    p_state: input.state,
    p_role: input.role,
    p_idempotency_key: context.idempotencyKey,
    p_request_hash: context.requestHash,
  }));
}

export async function requestAdminOwnerRecovery(
  input: { readonly targetUserId: string; readonly reason: string },
  context: StaffRpcContext,
): Promise<Readonly<Record<string, unknown>>> {
  return record(await staffRpc("admin_owner_recovery_request", {
    p_target_user_id: input.targetUserId,
    p_reason: input.reason,
    p_idempotency_key: context.idempotencyKey,
    p_request_hash: context.requestHash,
  }));
}

export async function approveAdminOwnerRecovery(
  input: { readonly requestId: string; readonly expectedVersion: number },
  context: StaffRpcContext,
): Promise<Readonly<Record<string, unknown>>> {
  return record(await staffRpc("admin_owner_recovery_approve", {
    p_request_id: input.requestId,
    p_expected_version: input.expectedVersion,
    p_idempotency_key: context.idempotencyKey,
    p_request_hash: context.requestHash,
  }));
}
