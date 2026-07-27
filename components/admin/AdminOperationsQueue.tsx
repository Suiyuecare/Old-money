"use client";

import { useCallback, useEffect, useState } from "react";

import {
  operationsQueueDisplayRow,
  operationsResponseJson,
  type OperationsQueueDisplayRow,
} from "@/lib/admin/operations-ui";
import type {
  OperationsQueueKind,
  OperationsQueuePage,
} from "@/lib/operations/contracts";

import { AdminStatus, formatAdminDate } from "./AdminUi";

const pageSize = 25;

export function AdminOperationsQueue({
  kind,
  title,
  description,
}: {
  readonly kind: OperationsQueueKind;
  readonly title: string;
  readonly description: string;
}) {
  const [rows, setRows] = useState<readonly OperationsQueueDisplayRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/operations/queue?kind=${encodeURIComponent(kind)}&limit=${pageSize}&offset=${offset}`,
        { cache: "no-store", credentials: "same-origin", signal },
      );
      const page = await operationsResponseJson<OperationsQueuePage>(response);
      setRows(page.items.map((item) => operationsQueueDisplayRow(kind, item)));
      setTotal(page.total);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "無法載入佇列。");
      setRows([]);
      setTotal(0);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [kind, offset]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [load]);

  return (
    <section className="admin-workbench" aria-labelledby={`${kind}-queue-heading`}>
      <header className="admin-workbench__header">
        <div>
          <span className="admin-eyebrow">Durable Queue</span>
          <h2 id={`${kind}-queue-heading`}>{title}</h2>
          <p>{description}</p>
        </div>
        <button
          className="admin-button admin-button--secondary"
          disabled={loading}
          onClick={() => void load()}
          type="button"
        >
          {loading ? "載入中…" : "重新整理"}
        </button>
      </header>

      {error ? (
        <div className="admin-feedback" data-status="error" role="alert">
          {error}
          <button onClick={() => void load()} type="button">重試</button>
        </div>
      ) : null}
      {!error && loading ? <p className="admin-workbench__empty" role="status">正在讀取 durable queue…</p> : null}
      {!error && !loading && rows.length === 0 ? (
        <p className="admin-workbench__empty" role="status">目前沒有待處理項目。</p>
      ) : null}
      {rows.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">操作／事件</th>
                <th scope="col">證據</th>
                <th scope="col">狀態</th>
                <th scope="col">更新時間</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.primary}</th>
                  <td>{row.secondary}</td>
                  <td><AdminStatus label={row.status} value={row.status} /></td>
                  <td><time dateTime={row.updatedAt}>{formatAdminDate(row.updatedAt)}</time></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {total > pageSize ? (
        <nav className="admin-pagination" aria-label={`${title}分頁`}>
          <button
            disabled={loading || offset === 0}
            onClick={() => setOffset((value) => Math.max(0, value - pageSize))}
            type="button"
          >
            上一頁
          </button>
          <span>{offset + 1}–{Math.min(offset + pageSize, total)}／{total}</span>
          <button
            disabled={loading || offset + pageSize >= total}
            onClick={() => setOffset((value) => value + pageSize)}
            type="button"
          >
            下一頁
          </button>
        </nav>
      ) : null}
    </section>
  );
}
