"use client";

import { useActionState } from "react";

import Link from "next/link";

import {
  approveOwnerRecoveryAction,
  changeStaffStateAction,
  inviteStaffAction,
} from "@/lib/admin/actions";
import type { AdminStaffMembership } from "@/lib/admin/staff";
import type { AdminActionState } from "@/lib/admin/types";

import { ActionFeedback } from "./AdminActionFeedback";
import { AdminStatus, formatAdminDate } from "./AdminUi";
import { useAdminIdempotencyKey } from "./useAdminIdempotencyKey";

const idle: AdminActionState = { status: "idle", message: "" };

export function StaffInviteForm({ enabled }: { readonly enabled: boolean }) {
  const [state, action, pending] = useActionState(inviteStaffAction, idle);
  const key = useAdminIdempotencyKey(state);
  return (
    <form action={action} className="admin-form admin-subform">
      <input name="idempotencyKey" type="hidden" value={key} />
      <div className="admin-form-grid">
        <label>顯示名稱<input disabled={!enabled} maxLength={100} name="displayName" required /></label>
        <label>受邀 Email<input autoComplete="off" disabled={!enabled} name="email" required type="email" /></label>
        <label>
          角色
          <select defaultValue="merchandiser" disabled={!enabled} name="role">
            <option value="owner">Owner</option>
            <option value="merchandiser">Merchandiser</option>
            <option value="fulfillment">Fulfillment</option>
            <option value="support">Support</option>
          </select>
        </label>
      </div>
      <p className="admin-form-help">
        邀請僅在 Production 透過 server-only secret 執行；Preview 與本機永不呼叫 Auth Admin。
      </p>
      {!enabled ? (
        <p className="admin-feedback" data-status="error" role="status">
          此 deployment 不是可執行邀請的 Production 環境，功能已安全關閉。
        </p>
      ) : null}
      <div className="admin-subform__actions">
        <ActionFeedback state={state} />
        <button className="admin-button" disabled={!enabled || pending} type="submit">
          {pending ? "邀請中…" : "寄送後台邀請"}
        </button>
      </div>
    </form>
  );
}

export function StaffMemberships({
  memberships,
  currentUserId,
}: {
  readonly memberships: readonly AdminStaffMembership[];
  readonly currentUserId: string;
}) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th scope="col">人員</th>
            <th scope="col">狀態</th>
            <th scope="col">Sessions</th>
            <th scope="col">權限操作</th>
          </tr>
        </thead>
        <tbody>
          {memberships.map((membership) => (
            <tr key={membership.userId}>
              <th scope="row">
                {membership.displayName}
                <small>{membership.email} · {membership.userId}</small>
              </th>
              <td>
                <AdminStatus label={`${membership.role} · ${membership.state}`} value={membership.state} />
                <small>v{membership.version} · {formatAdminDate(membership.updatedAt)}</small>
              </td>
              <td>
                {membership.sessionsRevokedAt
                  ? <time dateTime={membership.sessionsRevokedAt}>{formatAdminDate(membership.sessionsRevokedAt)} 後失效</time>
                  : "有效"}
              </td>
              <td>
                <StaffStateForm
                  currentUserId={currentUserId}
                  membership={membership}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StaffStateForm({
  membership,
  currentUserId,
}: {
  readonly membership: AdminStaffMembership;
  readonly currentUserId: string;
}) {
  const [state, action, pending] = useActionState(changeStaffStateAction, idle);
  const key = useAdminIdempotencyKey(state);
  const durableId = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(membership.userId);
  const self = membership.userId === currentUserId;
  return (
    <form action={action} className="admin-staff-command">
      <input name="userId" type="hidden" value={membership.userId} />
      <input name="expectedVersion" type="hidden" value={membership.version} />
      <input name="idempotencyKey" type="hidden" value={`${key}:${membership.version}`} />
      <label>
        <span className="sr-only">角色</span>
        <select aria-label={`${membership.displayName} 角色`} defaultValue={membership.role} name="role">
          <option value="owner">Owner</option>
          <option value="merchandiser">Merchandiser</option>
          <option value="fulfillment">Fulfillment</option>
          <option value="support">Support</option>
        </select>
      </label>
      <label>
        <span className="sr-only">狀態</span>
        <select aria-label={`${membership.displayName} 狀態`} defaultValue={membership.state} name="state">
          <option value="active">啟用</option>
          <option value="suspended" disabled={self}>停權</option>
          <option value="revoked" disabled={self}>撤銷</option>
        </select>
      </label>
      <button disabled={pending || !durableId} type="submit">
        {pending ? "處理中…" : "套用"}
      </button>
      {!durableId ? <small>Demo 身分不可變更。</small> : null}
      {self ? <small>不可從目前 session 停權或撤銷自己。</small> : null}
      <ActionFeedback state={state} />
    </form>
  );
}

export function OwnerRecoveryForms() {
  const [approveState, approveAction, approving] = useActionState(approveOwnerRecoveryAction, idle);
  const approveKey = useAdminIdempotencyKey(approveState);
  return (
    <div className="admin-recovery-grid">
      <div className="admin-form admin-subform">
        <span className="admin-eyebrow">Owner A</span>
        <h3>由本人提出申請</h3>
        <p>
          復原入口只接受目前已用密碼登入的 active Owner，且只能替自己提出；
          不接受在此輸入其他人的 user ID。
        </p>
        <Link className="admin-button" href="/admin/recovery">
          前往安全復原入口
        </Link>
      </div>
      <form action={approveAction} className="admin-form admin-subform">
        <span className="admin-eyebrow">Owner B</span>
        <h3>核准並撤銷 sessions</h3>
        <input name="idempotencyKey" type="hidden" value={approveKey} />
        <label>復原申請 ID<input name="requestId" required type="text" /></label>
        <label>申請版本<input defaultValue={1} min={1} name="expectedVersion" required type="number" /></label>
        <p className="admin-form-help">
          必須由另一位 Owner 以最近 10 分鐘 AAL2 完成；核准會立即使目標帳號既有 sessions 失效，
          並由 Production worker 清除舊 TOTP、寄送不含後台資料的 Auth recovery Email。
          {" "}<Link href="/admin/mfa/challenge?returnPath=/admin/staff">重新驗證 TOTP</Link>
        </p>
        <ActionFeedback state={approveState} />
        <button className="admin-button admin-button--danger" disabled={approving} type="submit">
          {approving ? "核准中…" : "核准復原"}
        </button>
      </form>
    </div>
  );
}
