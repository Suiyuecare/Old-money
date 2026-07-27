"use client";

import { useEffect, useRef, useState } from "react";

import type { OrderAccessView } from "@/lib/order-access/contracts";

import styles from "../orders.module.css";

const orderStates = new Set<OrderAccessView["status"]>([
  "awaiting_payment",
  "paid",
  "processing",
  "cancel_requested",
  "cancelled",
  "shipped",
  "delivered",
  "closed",
]);

const paymentStates = new Set<OrderAccessView["paymentStatus"]>([
  "pending",
  "verification_pending",
  "paid",
  "partially_refunded",
  "refunded",
  "exception",
]);

const shipmentStates = new Set<OrderAccessView["shipmentStatus"]>([
  "not_created",
  "label_pending",
  "label_created",
  "manual_tracking",
  "cancellation_pending",
  "cancelled",
  "picked_up",
  "delivered",
  "exception",
]);

const orderStateLabels: Readonly<
  Record<OrderAccessView["status"], string>
> = {
  awaiting_payment: "等待付款",
  paid: "已付款",
  processing: "處理中",
  cancel_requested: "取消申請中",
  cancelled: "已取消",
  shipped: "已出貨",
  delivered: "已送達",
  closed: "已結案",
};

const paymentStateLabels: Readonly<
  Record<OrderAccessView["paymentStatus"], string>
> = {
  pending: "待付款",
  verification_pending: "付款確認中",
  paid: "已付款",
  partially_refunded: "部分退款",
  refunded: "已退款",
  exception: "需要人工確認",
};

const shipmentStateLabels: Readonly<
  Record<OrderAccessView["shipmentStatus"], string>
> = {
  not_created: "尚未建立",
  label_pending: "託運單建立中",
  label_created: "託運單已建立",
  manual_tracking: "人工追蹤",
  cancellation_pending: "取消配送中",
  cancelled: "配送已取消",
  picked_up: "物流已收件",
  delivered: "已送達",
  exception: "需要人工確認",
};

function isOrderAccessView(value: unknown): value is OrderAccessView {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OrderAccessView>;
  return (
    typeof candidate.publicId === "string" &&
    orderStates.has(candidate.status as OrderAccessView["status"]) &&
    paymentStates.has(
      candidate.paymentStatus as OrderAccessView["paymentStatus"],
    ) &&
    shipmentStates.has(
      candidate.shipmentStatus as OrderAccessView["shipmentStatus"],
    ) &&
    typeof candidate.grossTwd === "number" &&
    Number.isSafeInteger(candidate.grossTwd) &&
    candidate.grossTwd >= 0 &&
    Array.isArray(candidate.trackingIds) &&
    candidate.trackingIds.every(
      (trackingId) => typeof trackingId === "string",
    ) &&
    typeof candidate.updatedAt === "string" &&
    Number.isFinite(Date.parse(candidate.updatedAt))
  );
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Taipei",
  }).format(new Date(value));
}

export function OrderAccessClient() {
  const [state, setState] = useState<
    "checking" | "ready" | "unavailable" | "ended"
  >("checking");
  const [order, setOrder] = useState<OrderAccessView | null>(null);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState(false);
  const tokenRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (tokenRef.current === undefined) {
      tokenRef.current = new URLSearchParams(
        window.location.hash.slice(1),
      ).get("token");
      // Fragments are not sent to the server. Clear it before starting the
      // exchange so it cannot survive in copied URLs, screenshots, or browser
      // history. The ref preserves the token across React's development-only
      // effect replay without putting it into component state or storage.
      if (window.location.hash) {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}`,
        );
      }
    }
    const token = tokenRef.current;
    const controller = new AbortController();
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      void (async () => {
        try {
          const response = token
            ? await fetch("/api/order-access/exchanges", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token }),
                signal: controller.signal,
              })
            : await fetch("/api/order-access/session", {
                method: "GET",
                credentials: "same-origin",
                signal: controller.signal,
              });
          if (!response.ok) {
            setState("unavailable");
            return;
          }
          const payload = (await response.json()) as {
            readonly order?: unknown;
          };
          if (!isOrderAccessView(payload.order)) {
            setState("unavailable");
            return;
          }
          setOrder(payload.order);
          setState("ready");
        } catch (error) {
          if (
            !(error instanceof DOMException) ||
            error.name !== "AbortError"
          ) {
            setState("unavailable");
          }
        }
      })();
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  async function endAccessSession() {
    if (ending) return;
    setEnding(true);
    setEndError(false);
    try {
      const response = await fetch("/api/order-access/session", {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) {
        setEndError(true);
        return;
      }
      setOrder(null);
      setState("ended");
    } catch {
      setEndError(true);
    } finally {
      setEnding(false);
    }
  }

  const announcement =
    state === "checking"
      ? "正在檢查安全連結"
      : state === "ready"
        ? `已載入訂單 ${order?.publicId ?? ""}`
        : state === "ended"
          ? "安全查詢工作階段已結束"
          : "安全連結無效或已失效";

  return (
    <div
      className={styles.accessCard}
      aria-busy={state === "checking" || ending}
    >
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <h2 className={styles.accessTitle}>
        {state === "checking"
          ? "正在檢查安全連結"
          : state === "ready"
            ? `訂單 ${order?.publicId ?? ""}`
            : state === "ended"
              ? "安全查詢已結束"
              : "安全連結無效或已失效"}
      </h2>
      {state === "ready" && order ? (
        <>
          <dl className={styles.accessSummary}>
            <div>
              <dt>訂單狀態</dt>
              <dd>{orderStateLabels[order.status]}</dd>
            </div>
            <div>
              <dt>付款狀態</dt>
              <dd>{paymentStateLabels[order.paymentStatus]}</dd>
            </div>
            <div>
              <dt>配送狀態</dt>
              <dd>{shipmentStateLabels[order.shipmentStatus]}</dd>
            </div>
            <div>
              <dt>訂單金額</dt>
              <dd>NT$ {order.grossTwd.toLocaleString("zh-TW")}</dd>
            </div>
            <div>
              <dt>物流追蹤碼</dt>
              <dd>
                {order.trackingIds.length > 0 ? (
                  <ul
                    className={styles.trackingList}
                    aria-label="物流追蹤碼"
                  >
                    {order.trackingIds.map((trackingId) => (
                      <li key={trackingId}>
                        <code>{trackingId}</code>
                      </li>
                    ))}
                  </ul>
                ) : (
                  "尚未提供"
                )}
              </dd>
            </div>
            <div>
              <dt>最後更新</dt>
              <dd>
                <time dateTime={order.updatedAt}>
                  {formatUpdatedAt(order.updatedAt)}
                </time>
              </dd>
            </div>
          </dl>
          <div className={styles.accessActions}>
            <button
              className="button-secondary"
              type="button"
              onClick={endAccessSession}
              disabled={ending}
            >
              {ending ? "正在結束…" : "結束安全查詢"}
            </button>
            {endError ? (
              <p className={styles.accessError} role="alert">
                暫時無法結束工作階段，請稍後再試。
              </p>
            ) : null}
          </div>
        </>
      ) : state === "checking" ? (
        <p>正在確認短效連結或既有的安全工作階段。</p>
      ) : state === "ended" ? (
        <p>
          這部裝置上的訂單查詢權限已撤銷。若要再次查詢，請重新申請安全連結。
        </p>
      ) : (
        <p>
          連結可能已使用、逾期，或這部裝置沒有有效工作階段。請回到安全訂單查詢重新申請。
        </p>
      )}
      <p className="muted">
        安全 token 不會保留在網址、瀏覽紀錄或分析資料中。
      </p>
      {state === "unavailable" || state === "ended" ? (
        <a className="text-link" href="/orders">
          返回安全訂單查詢
        </a>
      ) : null}
    </div>
  );
}
