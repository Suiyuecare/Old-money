"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useState } from "react";

import {
  isHighRiskOperationsCommand,
  operationsCommandsForRole,
  splitAggregateIds,
  type OperationsWorkspaceArea,
} from "@/lib/admin/operations-ui";
import type { AdminRole } from "@/lib/admin/types";
import type {
  OperationsCommandPayload,
  OperationsCommandType,
} from "@/lib/operations/contracts";

interface CommandFeedback {
  readonly status: "success" | "error";
  readonly message: string;
  readonly code?: string;
}

export type ExecuteOperationsCommand = (
  command: OperationsCommandPayload,
) => Promise<{
  readonly replayed: boolean;
  readonly references: Readonly<Record<string, string>>;
}>;

function integer(formData: FormData, name: string): number {
  return Number.parseInt(String(formData.get(name) ?? ""), 10);
}

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function CommandForm({
  type,
  title,
  description,
  onExecute,
  children,
  build,
}: {
  readonly type: OperationsCommandType;
  readonly title: string;
  readonly description: string;
  readonly onExecute: ExecuteOperationsCommand;
  readonly children: ReactNode;
  readonly build: (formData: FormData) => OperationsCommandPayload;
}) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<CommandFeedback | null>(null);
  const highRisk = isHighRiskOperationsCommand(type);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFeedback(null);
    try {
      const result = await onExecute(build(new FormData(event.currentTarget)));
      const references = Object.entries(result.references)
        .map(([label, value]) => `${label}: ${value}`)
        .join(" · ");
      setFeedback({
        status: "success",
        message: [
          result.replayed
            ? "已安全重播既有操作結果。"
            : "操作已接受並更新訂單投影。",
          references,
        ].filter(Boolean).join(" "),
      });
    } catch (caught) {
      setFeedback({
        status: "error",
        message: caught instanceof Error ? caught.message : "操作失敗。",
        code: caught && typeof caught === "object" && "code" in caught
          ? String(caught.code)
          : undefined,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="admin-operation-card admin-form" onSubmit={submit}>
      <header>
        <div>
          <span className="admin-eyebrow">{type}</span>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        {highRisk ? <span className="admin-risk-label">最近 AAL2</span> : null}
      </header>
      <div className="admin-operation-card__fields">{children}</div>
      {highRisk ? (
        <p className="admin-form-help">
          送出時會由伺服器重新驗證最近 10 分鐘內的 TOTP。
          {" "}<Link href="/admin/mfa/challenge">重新驗證</Link>
        </p>
      ) : null}
      {feedback ? (
        <p className="admin-feedback" data-status={feedback.status} role={feedback.status === "error" ? "alert" : "status"}>
          {feedback.message}
          {feedback.code ? <small>{feedback.code}</small> : null}
        </p>
      ) : null}
      <button className="admin-button" disabled={pending} type="submit">
        {pending ? "處理中…" : title}
      </button>
    </form>
  );
}

export function AdminOperationsCommands({
  area,
  role,
  onExecute,
}: {
  readonly area: OperationsWorkspaceArea;
  readonly role: AdminRole;
  readonly onExecute: ExecuteOperationsCommand;
}) {
  const allowed = new Set(operationsCommandsForRole(area, role));
  const show = (type: OperationsCommandType) => allowed.has(type);

  return (
    <section className="admin-operation-command-grid" aria-label="可用營運操作">
      {show("shipment.create") ? (
        <CommandForm
          build={(data) => ({ type: "shipment.create", parcelCount: integer(data, "parcelCount") })}
          description="建立黑貓 Sandbox 包裹工作；遠端副作用由 durable worker 執行。"
          onExecute={onExecute}
          title="建立包裹"
          type="shipment.create"
        >
          <label>包裹數量<input defaultValue={1} max={3} min={1} name="parcelCount" required type="number" /></label>
        </CommandForm>
      ) : null}
      {show("shipment.manual_tracking") ? (
        <CommandForm
          build={(data) => ({ type: "shipment.manual_tracking", trackingId: text(data, "trackingId") })}
          description="Provider 暫不可用時，登記已人工確認的追蹤碼。"
          onExecute={onExecute}
          title="登記人工追蹤碼"
          type="shipment.manual_tracking"
        >
          <label>追蹤碼<input minLength={3} name="trackingId" required /></label>
        </CommandForm>
      ) : null}
      {show("shipment.status.update") ? (
        <CommandForm
          build={(data) => ({
            type: "shipment.status.update",
            trackingId: text(data, "trackingId"),
            state: text(data, "state") as "picked_up" | "delivered",
          })}
          description="依已核實的承運狀態更新取件或送達；送達後才開放 14 日退貨流程。"
          onExecute={onExecute}
          title="更新配送狀態"
          type="shipment.status.update"
        >
          <label>追蹤碼<input minLength={3} name="trackingId" required /></label>
          <label>
            配送狀態
            <select defaultValue="picked_up" name="state">
              <option value="picked_up">已取件</option>
              <option value="delivered">已送達</option>
            </select>
          </label>
        </CommandForm>
      ) : null}
      {show("shipment.cancel") ? (
        <CommandForm
          build={(data) => ({
            type: "shipment.cancel",
            trackingId: text(data, "trackingId"),
            reason: text(data, "reason"),
          })}
          description="建立取消包裹工作，不因 timeout 直接假設取消成功。"
          onExecute={onExecute}
          title="取消包裹"
          type="shipment.cancel"
        >
          <label>追蹤碼<input minLength={3} name="trackingId" required /></label>
          <label>原因<textarea minLength={3} name="reason" required rows={3} /></label>
        </CommandForm>
      ) : null}

      {show("return.open") ? (
        <CommandForm
          build={(data) => ({
            type: "return.open",
            unitIds: splitAggregateIds(data.get("unitIds")),
            reason: text(data, "reason"),
          })}
          description="依 14 日政策建立退貨申請；不直接建立換貨。"
          onExecute={onExecute}
          title="建立退貨申請"
          type="return.open"
        >
          <label>訂單品項 ID（逗號或換行分隔）<textarea name="unitIds" required rows={3} /></label>
          <label>申請原因<textarea minLength={3} name="reason" required rows={3} /></label>
        </CommandForm>
      ) : null}
      {show("return.decision") ? (
        <CommandForm
          build={(data) => ({
            type: "return.decision",
            returnId: text(data, "returnId"),
            decision: text(data, "decision") as "authorize" | "reject",
            reason: text(data, "reason"),
          })}
          description="Support 審核退貨資格並留下判定理由。"
          onExecute={onExecute}
          title="審核退貨"
          type="return.decision"
        >
          <label>退貨案件 ID<input name="returnId" required /></label>
          <label>判定<select name="decision"><option value="authorize">核准</option><option value="reject">拒絕</option></select></label>
          <label>判定理由<textarea minLength={3} name="reason" required rows={3} /></label>
        </CommandForm>
      ) : null}
      {show("return.receive") ? (
        <CommandForm
          build={(data) => ({
            type: "return.receive",
            returnId: text(data, "returnId"),
            receivedUnitIds: splitAggregateIds(data.get("receivedUnitIds")),
          })}
          description="Fulfillment 記錄實際收到的品項，未收到者不會進入驗收。"
          onExecute={onExecute}
          title="登記退貨到貨"
          type="return.receive"
        >
          <label>退貨案件 ID<input name="returnId" required /></label>
          <label>已收到品項 ID<textarea name="receivedUnitIds" required rows={3} /></label>
        </CommandForm>
      ) : null}
      {show("return.inspect") ? (
        <CommandForm
          build={(data) => ({
            type: "return.inspect",
            returnId: text(data, "returnId"),
            accepted: text(data, "accepted") === "true",
            disposition: text(data, "disposition") as "sellable" | "damaged",
            note: text(data, "note"),
          })}
          description="記錄驗收與商品去向；可售回補仍由庫存 movement ledger 完成。"
          onExecute={onExecute}
          title="完成退貨驗收"
          type="return.inspect"
        >
          <label>退貨案件 ID<input name="returnId" required /></label>
          <label>驗收結果<select name="accepted"><option value="true">接受退貨</option><option value="false">拒絕退貨</option></select></label>
          <label>商品去向<select name="disposition"><option value="sellable">可重新販售</option><option value="damaged">損壞／隔離</option></select></label>
          <label>驗收註記<textarea minLength={3} name="note" required rows={3} /></label>
        </CommandForm>
      ) : null}

      {show("refund.request") ? (
        <CommandForm
          build={(data) => ({
            type: "refund.request",
            amountTwd: integer(data, "amountTwd"),
            reason: text(data, "reason"),
            providerTradeNo: text(data, "providerTradeNo"),
          })}
          description="Support 建立退款申請，Owner 核准執行前不會呼叫金流。"
          onExecute={onExecute}
          title="建立退款申請"
          type="refund.request"
        >
          <label>退款金額（TWD）<input min={1} name="amountTwd" required type="number" /></label>
          <label>Provider 交易編號<input name="providerTradeNo" required /></label>
          <label>原因<textarea minLength={3} name="reason" required rows={3} /></label>
        </CommandForm>
      ) : null}
      {show("refund.execute") ? (
        <CommandForm
          build={(data) => ({ type: "refund.execute", refundId: text(data, "refundId") })}
          description="Owner 執行已核准退款；未知結果會進入 reconciliation，不直接重送。"
          onExecute={onExecute}
          title="執行退款"
          type="refund.execute"
        >
          <label>退款申請 ID<input name="refundId" required /></label>
        </CommandForm>
      ) : null}

      {show("payment.reconcile") ? (
        <CommandForm
          build={(data) => ({
            type: "payment.reconcile",
            merchantTradeNo: text(data, "merchantTradeNo"),
          })}
          description="透過 QueryTradeInfo 查詢未知付款結果，保留查詢證據。"
          onExecute={onExecute}
          title="查詢付款狀態"
          type="payment.reconcile"
        >
          <label>MerchantTradeNo<input maxLength={20} name="merchantTradeNo" pattern="[A-Za-z0-9]{1,20}" required /></label>
        </CommandForm>
      ) : null}

      {show("invoice.issue") ? (
        <CommandForm
          build={() => ({ type: "invoice.issue" })}
          description="依結帳時已加密保存的發票選項建立 B2C 發票工作；後台不會再次收集或保存明文 Email。"
          onExecute={onExecute}
          title="開立電子發票"
          type="invoice.issue"
        >
          <p className="admin-form-help">
            載具與統編資料只會在 worker 租用工作後於記憶體解密，
            不會寫入通用 command 或 durable job payload。
          </p>
        </CommandForm>
      ) : null}
      {show("invoice.adjust") ? (
        <CommandForm
          build={(data) => ({
            type: "invoice.adjust",
            kind: text(data, "kind") as "void" | "allowance",
            relateNumber: text(data, "relateNumber"),
            amountTwd: integer(data, "amountTwd"),
            reason: text(data, "reason"),
          })}
          description="作廢或折讓皆為高風險操作，需 Owner 與最近 TOTP。"
          onExecute={onExecute}
          title="發票作廢／折讓"
          type="invoice.adjust"
        >
          <label>處理方式<select name="kind"><option value="void">作廢</option><option value="allowance">折讓</option></select></label>
          <label>RelateNumber<input name="relateNumber" required /></label>
          <label>金額（TWD）<input min={1} name="amountTwd" required type="number" /></label>
          <label>原因<textarea minLength={3} name="reason" required rows={3} /></label>
        </CommandForm>
      ) : null}

      {show("support.open") ? (
        <CommandForm
          build={(data) => ({
            type: "support.open",
            subject: text(data, "subject"),
            note: text(data, "note"),
          })}
          description="在訂單下建立客服案件，後續註記都保留稽核軌跡。"
          onExecute={onExecute}
          title="建立客服案件"
          type="support.open"
        >
          <label>主旨<input minLength={3} name="subject" required /></label>
          <label>首則紀錄<textarea name="note" required rows={4} /></label>
        </CommandForm>
      ) : null}
      {show("support.note") ? (
        <CommandForm
          build={(data) => ({
            type: "support.note",
            caseId: text(data, "caseId"),
            note: text(data, "note"),
          })}
          description="追加內部案件註記，不覆寫既有紀錄。"
          onExecute={onExecute}
          title="追加客服註記"
          type="support.note"
        >
          <label>案件 ID<input name="caseId" required /></label>
          <label>註記<textarea name="note" required rows={4} /></label>
        </CommandForm>
      ) : null}
      {show("support.resolve") ? (
        <CommandForm
          build={(data) => ({
            type: "support.resolve",
            caseId: text(data, "caseId"),
            resolution: text(data, "resolution"),
          })}
          description="以明確處理結果結案；若需退款仍須走退款流程。"
          onExecute={onExecute}
          title="結束客服案件"
          type="support.resolve"
        >
          <label>案件 ID<input name="caseId" required /></label>
          <label>處理結果<textarea minLength={3} name="resolution" required rows={4} /></label>
        </CommandForm>
      ) : null}
      {show("order.cancel.request") ? (
        <CommandForm
          build={(data) => ({ type: "order.cancel.request", reason: text(data, "reason") })}
          description="建立取消請求；庫存回補與金流處理由工作流程逐步完成。"
          onExecute={onExecute}
          title="申請取消訂單"
          type="order.cancel.request"
        >
          <label>取消原因<textarea minLength={3} name="reason" required rows={3} /></label>
        </CommandForm>
      ) : null}
    </section>
  );
}
