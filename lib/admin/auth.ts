import { cookies, headers } from "next/headers";

import { getCommerceEnvironment } from "@/lib/commerce/config";
import { createRequestAuthClient } from "@/lib/supabase/request-clients";

import type { AdminAccess, AdminIdentity, AdminRole } from "./types";

const adminRoles = new Set<AdminRole>(["owner", "merchandiser", "fulfillment", "support"]);

async function getCookieAdapter() {
  const cookieStore = await cookies();
  return {
    getAll: () => cookieStore.getAll(),
    setAll: (
      values: readonly {
        readonly name: string;
        readonly value: string;
        readonly options?: Record<string, unknown>;
      }[],
    ) => {
      for (const value of values) {
        try {
          cookieStore.set(value.name, value.value, value.options);
        } catch {
          // Server Components cannot always persist refreshed cookies. proxy.ts
          // remains responsible for request-level refresh; actions can write.
        }
      }
    },
  };
}

export async function getAdminAuthClient() {
  return createRequestAuthClient(await getCookieAdapter());
}

function demoIdentity(): AdminIdentity {
  return {
    userId: "demo-owner",
    email: "demo@estatelignee.com",
    displayName: "Demo Owner",
    role: "owner",
    demo: true,
  };
}

function fail(status: AdminAccess["status"], reason: string): AdminAccess {
  return { status, identity: null, reason };
}

interface MembershipRow {
  readonly user_id: string;
  readonly role: AdminRole;
  readonly state: "active" | string;
  readonly display_name?: string | null;
}

function parseMembership(value: unknown): MembershipRow | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== "object") return null;
  const record = candidate as Record<string, unknown>;
  const userId = record.user_id ?? record.userId;
  const displayName = record.display_name ?? record.displayName;
  if (
    typeof userId !== "string" ||
    typeof record.role !== "string" ||
    !adminRoles.has(record.role as AdminRole) ||
    (record.state !== undefined && record.state !== "active")
  ) {
    return null;
  }
  return {
    user_id: userId,
    role: record.role as AdminRole,
    state: "active",
    display_name: typeof displayName === "string" ? displayName : null,
  };
}

export async function getAdminAccess(): Promise<AdminAccess> {
  const environment = getCommerceEnvironment();
  if (environment.mode === "demo" && process.env.NODE_ENV !== "production") {
    return { status: "authorized", identity: demoIdentity(), reason: null };
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY) {
    return fail("unconfigured", "Supabase Auth 尚未綁定。");
  }

  try {
    const client = await getAdminAuthClient();
    const {
      data: { user },
      error: userError,
    } = await client.auth.getUser();
    if (userError || !user) return fail("anonymous", "請先登入營運後台。");

    const { data: factors, error: factorsError } = await client.auth.mfa.listFactors();
    if (factorsError) return fail("unconfigured", "無法驗證 MFA 狀態。");
    const verifiedTotp = factors.totp.filter((factor) => factor.status === "verified");
    if (verifiedTotp.length < 2) {
      return fail("mfa-enrollment-required", "須完成主要與備用兩組 TOTP。");
    }

    const { data: assurance, error: assuranceError } =
      await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError || assurance.currentLevel !== "aal2") {
      return fail("mfa-challenge-required", "請完成雙重驗證。");
    }

    const { data: membership, error: membershipError } = await client
      .schema("api")
      .rpc("admin_session_context");
    const row = membershipError ? null : parseMembership(membership);
    if (!row || row.user_id !== user.id) {
      return fail("membership-required", "此帳號沒有啟用中的後台權限。");
    }

    return {
      status: "authorized",
      identity: {
        userId: user.id,
        email: user.email ?? "未提供 Email",
        displayName: row.display_name || user.email?.split("@")[0] || "LIGNÉE Admin",
        role: row.role,
        demo: false,
      },
      reason: null,
    };
  } catch {
    return fail("unconfigured", "後台身分服務目前無法使用。");
  }
}

export async function requireAdminRole(allowedRoles: readonly AdminRole[]): Promise<AdminIdentity> {
  const access = await getAdminAccess();
  if (!access.identity || access.status !== "authorized") {
    throw new AdminAuthorizationError("ADMIN_ACCESS_DENIED", access.reason ?? "沒有後台權限。", 401);
  }
  if (!allowedRoles.includes(access.identity.role)) {
    throw new AdminAuthorizationError("ADMIN_ROLE_DENIED", "你的角色無權執行此操作。", 403);
  }
  return access.identity;
}

export async function getAdminPageIdentity(
  allowedRoles: readonly AdminRole[],
): Promise<AdminIdentity | null> {
  const access = await getAdminAccess();
  if (
    access.status !== "authorized" ||
    !access.identity ||
    !allowedRoles.includes(access.identity.role)
  ) {
    return null;
  }
  return access.identity;
}

export async function requireRecentAal2(maxAgeSeconds = 600): Promise<void> {
  const environment = getCommerceEnvironment();
  if (environment.mode === "demo" && process.env.NODE_ENV !== "production") return;
  const client = await getAdminAuthClient();
  const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || data.currentLevel !== "aal2") {
    throw new AdminAuthorizationError("AAL2_REQUIRED", "此操作需要雙重驗證。", 403);
  }
  const timestamps = data.currentAuthenticationMethods
    .filter(
      (entry): entry is { readonly method: string; readonly timestamp: number } =>
        typeof entry === "object" &&
        entry !== null &&
        typeof entry.method === "string" &&
        (entry.method === "totp" || entry.method.startsWith("mfa/")) &&
        typeof entry.timestamp === "number",
    )
    .map((entry) => entry.timestamp);
  const latest = Math.max(0, ...timestamps);
  if (latest < Math.floor(Date.now() / 1000) - maxAgeSeconds) {
    throw new AdminAuthorizationError(
      "RECENT_AAL2_REQUIRED",
      "此高風險操作需要最近 10 分鐘內完成的 TOTP 驗證。",
      403,
    );
  }
}

export class AdminAuthorizationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AdminAuthorizationError";
  }
}

export async function assertAdminMutationOrigin(): Promise<void> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const host = requestHeaders.get("host");
  const environment = getCommerceEnvironment();

  if (!origin) {
    if (environment.mode === "demo" && process.env.NODE_ENV !== "production") return;
    throw new AdminAuthorizationError("ORIGIN_REQUIRED", "缺少操作來源資訊。", 403);
  }

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new AdminAuthorizationError("ORIGIN_INVALID", "操作來源無效。", 403);
  }

  if (environment.mode === "demo" && process.env.NODE_ENV !== "production") {
    if (parsed.host === host) return;
  } else if (parsed.protocol === "https:" && parsed.host === environment.canonicalHost && host === environment.canonicalHost) {
    return;
  }
  throw new AdminAuthorizationError("ORIGIN_MISMATCH", "操作來源與網站不相符。", 403);
}

export function safeAdminReturnPath(value: FormDataEntryValue | null): string {
  if (
    typeof value !== "string" ||
    (value !== "/admin" && !value.startsWith("/admin/")) ||
    value.startsWith("//")
  ) {
    return "/admin";
  }
  return value;
}
