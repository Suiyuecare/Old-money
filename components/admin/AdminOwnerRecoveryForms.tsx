"use client";

import Link from "next/link";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  type FormEvent,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";

import { requestOwnerRecoveryAction } from "@/lib/admin/actions";
import type { AdminOwnerRecoveryContext } from "@/lib/admin/staff";
import type { AdminActionState } from "@/lib/admin/types";

import { ActionFeedback } from "./AdminActionFeedback";
import { useAdminIdempotencyKey } from "./useAdminIdempotencyKey";

const idle: AdminActionState = { status: "idle", message: "" };

export function OwnerSelfRecoveryRequestForm({
  context,
}: {
  readonly context: AdminOwnerRecoveryContext;
}) {
  const [state, action, pending] = useActionState(
    requestOwnerRecoveryAction,
    idle,
  );
  const key = useAdminIdempotencyKey(state);

  if (context.pendingRequest) {
    return (
      <div className="admin-empty admin-recovery-pending" role="status">
        <span aria-hidden="true">◇</span>
        <h2>正在等待第二位 Owner 核准</h2>
        <p>
          申請已建立。核准後，此 session 會立即失效，Production worker
          會移除舊 TOTP 並寄送 Auth recovery Email。
        </p>
        <dl>
          <div>
            <dt>申請 ID</dt>
            <dd><code>{context.pendingRequest.requestId}</code></dd>
          </div>
          <div>
            <dt>建立時間</dt>
            <dd>{new Date(context.pendingRequest.requestedAt).toLocaleString("zh-TW")}</dd>
          </div>
          <div>
            <dt>狀態</dt>
            <dd>等待核准</dd>
          </div>
        </dl>
        <p className="admin-form-help">
          請將申請 ID 交給另一位 Owner；申請人無法核准自己的復原。
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="admin-form admin-auth-form">
      <input name="idempotencyKey" type="hidden" value={key} />
      <div className="admin-id-reference">
        <small>目前身分</small>
        <strong>{context.displayName}</strong>
        <span>{context.email}</span>
      </div>
      <label>
        復原原因
        <textarea
          disabled={context.demo}
          maxLength={500}
          minLength={10}
          name="reason"
          placeholder="例如：主要與備用驗證器所在裝置同時遺失"
          required
          rows={5}
        />
      </label>
      <p className="admin-form-help">
        此申請固定綁定目前 session，不接受 user ID，也不能替其他人提出。
        第二位 Owner 核准前不會變更任何 Auth factor。
      </p>
      {context.demo ? (
        <p className="admin-feedback" data-status="error" role="status">
          本機 Demo 不會建立真實 Auth 復原申請。
        </p>
      ) : null}
      <ActionFeedback state={state} />
      <button className="admin-button" disabled={pending || context.demo} type="submit">
        {pending ? "建立中…" : "提出本人復原申請"}
      </button>
      <Link href="/admin/mfa/challenge">返回 TOTP 驗證</Link>
    </form>
  );
}

export function OwnerRecoveryPasswordResetForm({
  publishableKey,
  supabaseUrl,
}: {
  readonly publishableKey: string;
  readonly supabaseUrl: string;
}) {
  const clientRef = useRef<SupabaseClient | null>(null);
  const [status, setStatus] = useState<"checking" | "ready" | "invalid" | "saving">(
    "checking",
  );
  const [message, setMessage] = useState(
    "正在驗證一次性 Auth recovery session…",
  );

  useEffect(() => {
    let active = true;
    const recoveryParameters = new URLSearchParams(
      window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : "",
    );
    if (recoveryParameters.get("type") !== "recovery") {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
      queueMicrotask(() => {
        if (!active) return;
        setStatus("invalid");
        setMessage("復原連結無效或已過期，請聯絡另一位 Owner 檢查復原工作狀態。");
      });
      return () => {
        active = false;
      };
    }
    const client = createClient(supabaseUrl, publishableKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: true,
        flowType: "implicit",
        persistSession: false,
      },
    });
    clientRef.current = client;
    void client.auth.getSession().then(({ data, error }) => {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
      if (!active) return;
      if (error || !data.session) {
        setStatus("invalid");
        setMessage("復原連結無效或已過期，請聯絡另一位 Owner 檢查復原工作狀態。");
        return;
      }
      setStatus("ready");
      setMessage("身分驗證完成。請建立新的專用密碼。");
    });
    return () => {
      active = false;
      clientRef.current = null;
    };
  }, [publishableKey, supabaseUrl]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("passwordConfirmation") ?? "");
    if (password.length < 12 || password.length > 128) {
      setMessage("密碼需為 12 至 128 個字元。");
      return;
    }
    if (password !== confirmation) {
      setMessage("兩次輸入的密碼不一致。");
      return;
    }
    const client = clientRef.current;
    if (!client) {
      setStatus("invalid");
      setMessage("復原 session 尚未就緒，請重新開啟 Email 中的連結。");
      return;
    }
    setStatus("saving");
    setMessage("正在更新密碼…");
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      setStatus("ready");
      setMessage("無法更新密碼；連結可能已過期，請勿重複提交。");
      return;
    }
    await client.auth.signOut({ scope: "local" });
    window.location.replace("/admin/sign-in?reason=owner-recovery-complete");
  }

  if (status === "checking" || status === "invalid") {
    return (
      <div
        className="admin-feedback"
        data-status={status === "invalid" ? "error" : undefined}
        role={status === "invalid" ? "alert" : "status"}
      >
        {message}
      </div>
    );
  }

  return (
    <form className="admin-form admin-auth-form" onSubmit={submit}>
      <p className="admin-feedback" role="status">{message}</p>
      <label>
        新密碼
        <input
          autoComplete="new-password"
          disabled={status === "saving"}
          maxLength={128}
          minLength={12}
          name="password"
          required
          type="password"
        />
      </label>
      <label>
        再次輸入新密碼
        <input
          autoComplete="new-password"
          disabled={status === "saving"}
          maxLength={128}
          minLength={12}
          name="passwordConfirmation"
          required
          type="password"
        />
      </label>
      <button className="admin-button" disabled={status === "saving"} type="submit">
        {status === "saving" ? "更新中…" : "更新密碼並重新登入"}
      </button>
    </form>
  );
}
