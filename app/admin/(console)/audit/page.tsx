import Link from "next/link";
import { redirect } from "next/navigation";

import {
  AdminEmpty,
  AdminPageHeader,
  AdminStatus,
  formatAdminDate,
} from "@/components/admin/AdminUi";
import { getAdminPageIdentity } from "@/lib/admin/auth";
import {
  getAdminGovernanceAdapter,
  type AdminAuditPage,
} from "@/lib/admin/governance";

export const metadata = { title: "Audit Log" };

const pageSize = 50;

function safeFilter(value: string | string[] | undefined, maximum: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maximum);
}

function safePage(value: string | string[] | undefined): number {
  if (typeof value !== "string" || !/^[1-9]\d{0,5}$/.test(value)) return 1;
  return Math.max(1, Number(value));
}

function auditHref(page: number, entityType: string, action: string): string {
  const query = new URLSearchParams();
  if (entityType) query.set("entityType", entityType);
  if (action) query.set("action", action);
  if (page > 1) query.set("page", String(page));
  const suffix = query.toString();
  return suffix ? `/admin/audit?${suffix}` : "/admin/audit";
}

export default async function AdminAuditPageRoute({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly entityType?: string | string[];
    readonly action?: string | string[];
    readonly page?: string | string[];
  }>;
}) {
  const identity = await getAdminPageIdentity(["owner"]);
  if (!identity) redirect("/admin");
  const query = await searchParams;
  const entityType = safeFilter(query.entityType, 80);
  const action = safeFilter(query.action, 120);
  const requestedPage = safePage(query.page);
  let audit: AdminAuditPage | null = null;
  try {
    audit = await getAdminGovernanceAdapter().listAuditEvents({
      limit: pageSize,
      offset: (requestedPage - 1) * pageSize,
      entityType: entityType || null,
      action: action || null,
    });
  } catch {
    // A missing or malformed RPC is rendered as an explicit fail-closed state.
  }
  if (!audit) {
    return (
      <div className="admin-main">
        <AdminPageHeader
          description="所有高風險操作只追加記錄，不允許透過後台修改或刪除。"
          eyebrow="Append-only"
          title="Audit Log"
        />
        <div className="admin-runtime-warning" role="alert">
          Audit RPC 尚未就緒或回傳格式無法驗證。頁面不會改讀私有表格，
          也不會放寬為非 Owner 存取。
        </div>
        <AdminEmpty
          description="完成新 LIGNÉE Supabase migration 後，Owner 可從安全 RPC 讀取去識別化事件。"
          title="Audit Log 無法安全讀取"
        />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(audit.total / audit.limit));
  if (requestedPage > totalPages) {
    redirect(auditHref(totalPages, entityType, action));
  }
  const currentPage = requestedPage;
  const first = audit.total ? audit.offset + 1 : 0;
  const last = Math.min(audit.offset + audit.items.length, audit.total);

  return (
    <div className="admin-main">
      <AdminPageHeader
        description="Owner 專用的 append-only 操作軌跡；RPC 刻意不回傳管理員 UUID、Email 或顧客 PII。"
        eyebrow="Append-only"
        title="Audit Log"
      />

      <form action="/admin/audit" className="admin-audit-filter" method="get">
        <label>
          Entity type
          <input
            defaultValue={entityType}
            maxLength={80}
            name="entityType"
            placeholder="例：runtime_controls"
          />
        </label>
        <label>
          Action
          <input
            defaultValue={action}
            maxLength={120}
            name="action"
            placeholder="例：runtime_controls.update"
          />
        </label>
        <button className="admin-button" type="submit">套用篩選</button>
        {(entityType || action) ? (
          <Link className="admin-button admin-button--secondary" href="/admin/audit">
            清除
          </Link>
        ) : null}
      </form>

      <div className="admin-audit-summary" role="status">
        <span>共 {audit.total} 筆不可變事件</span>
        <span>{first}–{last}</span>
      </div>

      {audit.items.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table admin-audit-table">
            <thead>
              <tr>
                <th scope="col">時間</th>
                <th scope="col">動作</th>
                <th scope="col">Entity</th>
                <th scope="col">異動欄位</th>
                <th scope="col">Request</th>
              </tr>
            </thead>
            <tbody>
              {audit.items.map((event) => (
                <tr key={event.id}>
                  <td>
                    <time dateTime={event.occurredAt}>{formatAdminDate(event.occurredAt)}</time>
                    <small>{event.actorScope}</small>
                  </td>
                  <th scope="row">
                    <AdminStatus label={event.action} value="completed" />
                  </th>
                  <td>
                    <strong>{event.entityType}</strong>
                    <small>{event.entityId}</small>
                  </td>
                  <td>
                    <ul className="admin-audit-fields">
                      {event.changedFields.length
                        ? event.changedFields.map((field) => <li key={field}>{field}</li>)
                        : <li>無欄位異動</li>}
                    </ul>
                  </td>
                  <td>
                    <code className="admin-audit-request">{event.requestId}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <AdminEmpty
          description="調整 entity type 或 action 後再試；事件本身不會被刪除。"
          title="沒有符合條件的稽核事件"
        />
      )}

      {totalPages > 1 ? (
        <nav aria-label="Audit Log 分頁" className="admin-pagination">
          {currentPage > 1 ? (
            <Link
              className="admin-button admin-button--secondary"
              href={auditHref(currentPage - 1, entityType, action)}
            >
              上一頁
            </Link>
          ) : <span aria-hidden="true" />}
          <span>第 {currentPage} / {totalPages} 頁</span>
          {currentPage < totalPages ? (
            <Link
              className="admin-button admin-button--secondary"
              href={auditHref(currentPage + 1, entityType, action)}
            >
              下一頁
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
