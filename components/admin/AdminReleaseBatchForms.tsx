"use client";

import { useActionState } from "react";

import {
  createReleaseBatchAction,
  publishReleaseBatchAction,
  setReleaseBatchReadinessAction,
} from "@/lib/admin/actions";
import type { AdminReleaseBatch } from "@/lib/admin/release-batches";
import type { AdminTaxonomyItem } from "@/lib/admin/taxonomy";
import type {
  AdminActionState,
  AdminProductDraft,
} from "@/lib/admin/types";

import { ActionFeedback } from "./AdminActionFeedback";
import { AdminStatus, formatAdminDate } from "./AdminUi";
import { useAdminIdempotencyKey } from "./useAdminIdempotencyKey";

const idle: AdminActionState = { status: "idle", message: "" };

export function AdminReleaseBatchWorkbench({
  batches,
  chapters,
  products,
  canPublish,
  unavailableMessage,
}: {
  readonly batches: readonly AdminReleaseBatch[];
  readonly chapters: readonly AdminTaxonomyItem[];
  readonly products: readonly AdminProductDraft[];
  readonly canPublish: boolean;
  readonly unavailableMessage?: string;
}) {
  return (
    <section className="admin-workbench" aria-labelledby="release-batches-heading">
      <header className="admin-workbench__header">
        <div>
          <span className="admin-eyebrow">Series Publication</span>
          <h2 id="release-batches-heading">篇章批次發布</h2>
          <p>同一批次的商品會在單一 transaction 建立不可變 publication snapshots 與一筆 catalog revision。</p>
        </div>
      </header>
      {unavailableMessage ? (
        <p className="admin-feedback" data-status="error" role="alert">{unavailableMessage}</p>
      ) : (
        <>
          <details className="admin-disclosure">
            <summary>建立系列批次</summary>
            <CreateReleaseBatchForm chapters={chapters} products={products} />
          </details>
          {batches.length ? (
            <div className="admin-release-batch-list">
              {batches.map((batch) => (
                <ReleaseBatchRow batch={batch} canPublish={canPublish} key={batch.id} />
              ))}
            </div>
          ) : <p className="admin-workbench__empty">尚未建立系列發布批次。</p>}
        </>
      )}
    </section>
  );
}

function CreateReleaseBatchForm({
  chapters,
  products,
}: {
  readonly chapters: readonly AdminTaxonomyItem[];
  readonly products: readonly AdminProductDraft[];
}) {
  const [state, action, pending] = useActionState(createReleaseBatchAction, idle);
  const key = useAdminIdempotencyKey(state);
  return (
    <form action={action} className="admin-form admin-subform">
      <input name="idempotencyKey" type="hidden" value={key} />
      <div className="admin-form-grid">
        <label>批次名稱<input name="name" required /></label>
        <label>
          Estate 篇章
          <select name="chapterId" required>
            {chapters.filter((chapter) => chapter.status === "active").map((chapter) => (
              <option key={chapter.id} value={chapter.id}>{chapter.nameEn} · {chapter.nameZh}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        商品 ID（每行或逗號分隔）
        <textarea name="productIds" required rows={6} />
      </label>
      <details className="admin-id-reference">
        <summary>查看可用商品 ID</summary>
        <ul>
          {products.map((product) => (
            <li key={product.id}><code>{product.id}</code> · {product.productCode} · {product.subtitle}</li>
          ))}
        </ul>
      </details>
      <div className="admin-subform__actions">
        <ActionFeedback state={state} />
        <button className="admin-button" disabled={pending || chapters.length === 0} type="submit">
          {pending ? "建立中…" : "建立批次草稿"}
        </button>
      </div>
    </form>
  );
}

function ReleaseBatchRow({
  batch,
  canPublish,
}: {
  readonly batch: AdminReleaseBatch;
  readonly canPublish: boolean;
}) {
  const [readinessState, readinessAction, updating] = useActionState(setReleaseBatchReadinessAction, idle);
  const [publishState, publishAction, publishing] = useActionState(publishReleaseBatchAction, idle);
  const readinessKey = useAdminIdempotencyKey(readinessState);
  const publishKey = useAdminIdempotencyKey(publishState);
  return (
    <article className="admin-release-batch">
      <header>
        <div>
          <h3>{batch.name}</h3>
          <p>{batch.chapterCode || batch.chapterId} · {batch.productIds.length} 件商品 · v{batch.version}</p>
          <small>更新於 {formatAdminDate(batch.updatedAt)}</small>
        </div>
        <AdminStatus label={batch.state} value={batch.state} />
      </header>
      <details className="admin-id-reference">
        <summary>批次商品 ID</summary>
        <ul>{batch.productIds.map((id) => <li key={id}><code>{id}</code></li>)}</ul>
      </details>
      <div className="admin-release-batch__actions">
        <form action={readinessAction} className="admin-inline-form">
          <input name="batchId" type="hidden" value={batch.id} />
          <input name="expectedVersion" type="hidden" value={batch.version} />
          <input name="idempotencyKey" type="hidden" value={`${readinessKey}:${batch.version}`} />
          <label>
            <span className="sr-only">批次狀態</span>
            <select defaultValue={batch.state === "published" ? "ready" : batch.state} disabled={!canPublish || batch.state === "published"} name="state">
              <option value="draft">草稿</option>
              <option value="review">審核中</option>
              <option value="ready">可發布</option>
              <option value="blocked">阻擋</option>
            </select>
          </label>
          <button disabled={!canPublish || updating || batch.state === "published"} type="submit">
            {updating ? "…" : "更新狀態"}
          </button>
          <ActionFeedback state={readinessState} />
        </form>
        <form action={publishAction}>
          <input name="batchId" type="hidden" value={batch.id} />
          <input name="expectedVersion" type="hidden" value={batch.version} />
          <input name="idempotencyKey" type="hidden" value={`${publishKey}:${batch.version}`} />
          <button
            className="admin-button"
            disabled={!canPublish || publishing || batch.state !== "ready"}
            type="submit"
          >
            {publishing ? "發布中…" : "發布整個系列"}
          </button>
          <ActionFeedback state={publishState} />
        </form>
      </div>
      {!canPublish ? <p className="admin-form-help">批次 readiness 與發布需由 Owner 以最近 AAL2 完成。</p> : null}
    </article>
  );
}
