"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import {
  commandSignature,
  OperationsClientError,
  operationsResponseJson,
  type OperationsWorkspaceArea,
} from "@/lib/admin/operations-ui";
import type { AdminOrderProjection, AdminRole } from "@/lib/admin/types";
import type {
  OperationsCommandPayload,
  OperationsCommandResult,
  OperationsProjection,
} from "@/lib/operations/contracts";

import { AdminOperationsCommands } from "./AdminOperationsCommands";
import { AdminStatus, formatAdminDate, formatTwd } from "./AdminUi";

interface CommandKey {
  readonly signature: string;
  readonly value: string;
}

export function AdminOperationsWorkspace({
  area,
  role,
  orders,
}: {
  readonly area: OperationsWorkspaceArea;
  readonly role: AdminRole;
  readonly orders: readonly AdminOrderProjection[];
}) {
  const initialAggregateId = orders[0]?.id ?? "";
  const [aggregateId, setAggregateId] = useState(initialAggregateId);
  const [projection, setProjection] = useState<OperationsProjection | null>(null);
  const [loading, setLoading] = useState(Boolean(initialAggregateId));
  const [error, setError] = useState<OperationsClientError | null>(null);
  const commandKeys = useRef(new Map<string, CommandKey>());

  const loadProjection = useCallback(async (id: string, signal?: AbortSignal) => {
    const normalized = id.trim();
    if (!normalized) return;
    setLoading(true);
    setError(null);
    setProjection(null);
    try {
      const response = await fetch(
        `/api/admin/operations/orders/${encodeURIComponent(normalized)}`,
        { cache: "no-store", credentials: "same-origin", signal },
      );
      const payload = await operationsResponseJson<{ readonly order: OperationsProjection }>(response);
      setProjection(payload.order);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setProjection(null);
      setError(caught instanceof OperationsClientError
        ? caught
        : new OperationsClientError("OPERATIONS_LOAD_FAILED", "無法載入訂單營運投影。", 503));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialAggregateId) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => void loadProjection(initialAggregateId, controller.signal),
      0,
    );
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [initialAggregateId, loadProjection]);

  async function execute(command: OperationsCommandPayload) {
    if (!projection) {
      throw new OperationsClientError(
        "OPERATIONS_PROJECTION_REQUIRED",
        "請先載入訂單投影。",
        409,
      );
    }
    const signature = commandSignature(command);
    const existing = commandKeys.current.get(command.type);
    const key = existing?.signature === signature
      ? existing.value
      : crypto.randomUUID();
    commandKeys.current.set(command.type, { signature, value: key });

    const response = await fetch("/api/admin/operations/commands", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        aggregateId: projection.id,
        expectedVersion: projection.version,
        idempotencyKey: key,
        command,
      }),
    });
    const payload = await operationsResponseJson<{
      readonly operation: OperationsCommandResult;
    }>(response);
    setProjection(payload.operation.projection);
    commandKeys.current.delete(command.type);
    return {
      replayed: payload.operation.replayed,
      references: payload.operation.references,
    };
  }

  function submitLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadProjection(aggregateId);
  }

  return (
    <>
      <section className="admin-workbench" aria-labelledby={`${area}-projection-heading`}>
        <header className="admin-workbench__header">
          <div>
            <span className="admin-eyebrow">Versioned Projection</span>
            <h2 id={`${area}-projection-heading`}>訂單營運投影</h2>
            <p>每次命令都使用目前版本與 idempotency key；舊版本會回傳 409，不會覆寫他人操作。</p>
          </div>
        </header>
        {orders.length ? (
          <form className="admin-operation-lookup" onSubmit={submitLookup}>
            <label>
              選擇持久化訂單
              <select
                onChange={(event) => setAggregateId(event.target.value)}
                required
                value={aggregateId}
              >
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.orderNumber} · {order.id}
                  </option>
                ))}
              </select>
            </label>
            <button className="admin-button" disabled={loading} type="submit">
              {loading ? "載入中…" : "載入訂單"}
            </button>
          </form>
        ) : (
          <p className="admin-feedback" role="status">
            目前沒有可操作的持久化訂單。訂單建立並寫入資料庫後才會出現在這裡。
          </p>
        )}
        {error ? (
          <div className="admin-feedback" data-status="error" role="alert">
            {error.message}
            <small>{error.code}</small>
            {error.status === 409 ? (
              <button onClick={() => void loadProjection(aggregateId)} type="button">重新載入最新版本</button>
            ) : null}
          </div>
        ) : null}
        {projection ? <OperationsProjectionSummary projection={projection} /> : null}
      </section>
      {projection ? (
        <AdminOperationsCommands area={area} onExecute={execute} role={role} />
      ) : null}
    </>
  );
}

export function OperationsProjectionSummary({
  projection,
}: {
  readonly projection: OperationsProjection;
}) {
  const statuses = [
    ["訂單", projection.orderStatus],
    ["付款", projection.paymentStatus],
    ["發票", projection.invoiceStatus],
    ["物流", projection.shipmentStatus],
    ["退貨", projection.returnStatus],
    ["退款", projection.refundStatus],
    ["客服", projection.supportStatus],
  ] as const;
  return (
    <div className="admin-operation-projection">
      <div className="admin-operation-projection__identity">
        <div>
          <span>公開訂單編號</span>
          <strong>{projection.publicId}</strong>
          <small>{projection.id} · version {projection.version}</small>
        </div>
        <div>
          <span>訂單總額／已退款</span>
          <strong>{formatTwd(projection.totalGrossTwd)}</strong>
          <small>已退款 {formatTwd(projection.refundedTwd)}</small>
        </div>
      </div>
      <dl className="admin-operation-statuses">
        {statuses.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd><AdminStatus label={value} value={value} /></dd>
          </div>
        ))}
      </dl>
      <dl className="admin-operation-references">
        <div><dt>MerchantTradeNo</dt><dd>{projection.merchantTradeNo}</dd></div>
        <div><dt>Provider Trade No</dt><dd>{projection.providerTradeNo ?? "—"}</dd></div>
        <div><dt>發票 RelateNumber</dt><dd>{projection.invoiceRelateNumber ?? "—"}</dd></div>
        <div><dt>追蹤碼</dt><dd>{projection.trackingIds.join("、") || "—"}</dd></div>
        <div><dt>最後更新</dt><dd><time dateTime={projection.updatedAt}>{formatAdminDate(projection.updatedAt)}</time></dd></div>
      </dl>
    </div>
  );
}
