"use client";

import { useActionState } from "react";

import {
  archiveTaxonomyAction,
  upsertTaxonomyAction,
} from "@/lib/admin/actions";
import type {
  AdminTaxonomyItem,
  AdminTaxonomyKind,
} from "@/lib/admin/taxonomy";
import type { AdminActionState } from "@/lib/admin/types";

import { ActionFeedback } from "./AdminForms";
import { AdminStatus } from "./AdminUi";
import { useAdminIdempotencyKey } from "./useAdminIdempotencyKey";

const idle: AdminActionState = { status: "idle", message: "" };

export function AdminTaxonomyWorkbench({
  title,
  kind,
  items,
  canArchive,
}: {
  readonly title: string;
  readonly kind: AdminTaxonomyKind;
  readonly items: readonly AdminTaxonomyItem[];
  readonly canArchive: boolean;
}) {
  return (
    <section className="admin-workbench" aria-labelledby={`${kind}-heading`}>
      <header className="admin-workbench__header">
        <div>
          <span className="admin-eyebrow">{kind}</span>
          <h2 id={`${kind}-heading`}>{title}</h2>
          <p>代碼會寫入商品 publication；封存不會刪除既有商品或歷史版本。</p>
        </div>
      </header>
      <details className="admin-disclosure">
        <summary>新增{title}</summary>
        <TaxonomyForm kind={kind} />
      </details>
      {items.length ? (
        <div className="admin-taxonomy-list">
          {items.map((item) => (
            <details className="admin-disclosure" key={item.id}>
              <summary>
                <span>{item.nameZh} · {item.nameEn}</span>
                <AdminStatus label={`${item.status} · v${item.version}`} value={item.status} />
              </summary>
              <TaxonomyForm canArchive={canArchive} item={item} kind={kind} />
            </details>
          ))}
        </div>
      ) : <p className="admin-workbench__empty">尚未建立資料。</p>}
    </section>
  );
}

function TaxonomyForm({
  kind,
  item,
  canArchive = false,
}: {
  readonly kind: AdminTaxonomyKind;
  readonly item?: AdminTaxonomyItem;
  readonly canArchive?: boolean;
}) {
  const [saveState, saveAction, saving] = useActionState(upsertTaxonomyAction, idle);
  const [archiveState, archiveAction, archiving] = useActionState(archiveTaxonomyAction, idle);
  const saveKey = useAdminIdempotencyKey(saveState);
  const archiveKey = useAdminIdempotencyKey(archiveState);
  return (
    <div>
      <form action={saveAction} className="admin-form admin-subform">
        <input name="kind" type="hidden" value={kind} />
        <input name="id" type="hidden" value={item?.id ?? ""} />
        <input name="expectedVersion" type="hidden" value={item?.version ?? ""} />
        <input name="idempotencyKey" type="hidden" value={`${saveKey}:${item?.version ?? 0}`} />
        <div className="admin-form-grid admin-form-grid--three">
          <label>
            代碼
            <input defaultValue={item?.code} disabled={Boolean(item)} name="code" required />
            {item ? <input name="code" type="hidden" value={item.code} /> : null}
          </label>
          <label>
            網址路徑
            <input
              defaultValue={item?.routeSegment}
              name="routeSegment"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              required
            />
          </label>
          <label>英文名稱<input defaultValue={item?.nameEn} name="nameEn" required /></label>
          <label>中文名稱<input defaultValue={item?.nameZh} name="nameZh" required /></label>
          <label>排序<input defaultValue={item?.sortOrder ?? 1} min={1} name="sortOrder" required type="number" /></label>
        </div>
        <label>
          公開說明
          <textarea
            defaultValue={item?.description}
            maxLength={2000}
            name="description"
            required
            rows={4}
          />
          <small>會進入公開 catalog snapshot，請使用已核准的品牌文案。</small>
        </label>
        <div className="admin-subform__actions">
          <ActionFeedback state={saveState} />
          <button className="admin-button" disabled={saving || item?.status === "archived"} type="submit">
            {saving ? "儲存中…" : item ? "儲存變更" : `建立${titleForKind(kind)}`}
          </button>
        </div>
      </form>
      {item ? (
        <form action={archiveAction} className="admin-taxonomy-archive">
          <input name="kind" type="hidden" value={kind} />
          <input name="id" type="hidden" value={item.id} />
          <input name="expectedVersion" type="hidden" value={item.version} />
          <input name="idempotencyKey" type="hidden" value={`${archiveKey}:${item.version}`} />
          <ActionFeedback state={archiveState} />
          <button
            className="admin-button admin-button--danger"
            disabled={!canArchive || archiving || item.status === "archived"}
            type="submit"
          >
            {archiving ? "封存中…" : "封存"}
          </button>
          {!canArchive ? <small>封存需由 Owner 與最近 AAL2 完成。</small> : null}
        </form>
      ) : null}
    </div>
  );
}

function titleForKind(kind: AdminTaxonomyKind): string {
  return kind === "category" ? "分類" : "篇章";
}
