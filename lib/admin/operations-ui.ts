import {
  operationsCommandAuthorization,
  type OperationsCommandPayload,
  type OperationsCommandType,
  type OperationsQueueKind,
} from "@/lib/operations/contracts";

import type { AdminRole } from "./types";

export type OperationsWorkspaceArea =
  | "fulfillment"
  | "returns"
  | "refunds"
  | "payments"
  | "invoices"
  | "support";

const areaCommands: Readonly<
  Record<OperationsWorkspaceArea, readonly OperationsCommandType[]>
> = Object.freeze({
  fulfillment: [
    "shipment.create",
    "shipment.manual_tracking",
    "shipment.status.update",
    "shipment.cancel",
  ],
  returns: [
    "return.open",
    "return.decision",
    "return.receive",
    "return.inspect",
  ],
  refunds: ["refund.request", "refund.execute"],
  payments: ["payment.reconcile", "order.cancel.request"],
  invoices: ["invoice.issue", "invoice.adjust"],
  support: [
    "support.open",
    "support.note",
    "support.resolve",
    "order.cancel.request",
  ],
});

export function operationsCommandsForRole(
  area: OperationsWorkspaceArea,
  role: AdminRole,
): readonly OperationsCommandType[] {
  return areaCommands[area].filter((type) =>
    operationsCommandAuthorization[type].roles.includes(role),
  );
}

export function isHighRiskOperationsCommand(
  type: OperationsCommandType,
): boolean {
  return operationsCommandAuthorization[type].requireRecentAal2;
}

export function splitAggregateIds(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return [];
  return [...new Set(
    value
      .split(/[\s,，]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  )].slice(0, 10);
}

export interface OperationsQueueDisplayRow {
  readonly id: string;
  readonly primary: string;
  readonly secondary: string;
  readonly status: string;
  readonly aggregateId: string | null;
  readonly updatedAt: string;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value ? value : fallback;
}

export function operationsQueueDisplayRow(
  kind: OperationsQueueKind,
  value: unknown,
): OperationsQueueDisplayRow {
  const item = record(value);
  const aggregateId = text(item.aggregateId) || null;
  const id = text(item.id, text(item.operationKey, "unknown"));

  if (kind === "provider_events") {
    const provider = text(item.provider, "provider");
    const eventType = text(item.eventType, "event");
    return {
      id,
      primary: `${provider} · ${eventType}`,
      secondary: [
        text(item.providerObjectId, "無 provider object"),
        item.verified === true ? "驗簽通過" : "未驗簽",
        item.duplicate === true ? "重播事件" : "首次事件",
      ].join(" · "),
      status: text(item.normalizedStatus, "received"),
      aggregateId: null,
      updatedAt: text(item.receivedAt, "1970-01-01T00:00:00.000Z"),
    };
  }

  if (kind === "support") {
    return {
      id,
      primary: text(item.publicId, id),
      secondary: `訂單 ${text(item.orderStatus, "unknown")} · 付款 ${text(item.paymentStatus, "unknown")}`,
      status: text(item.supportStatus, "open"),
      aggregateId: text(item.id) || null,
      updatedAt: text(item.updatedAt, "1970-01-01T00:00:00.000Z"),
    };
  }

  return {
    id,
    primary: text(item.operationKey, text(item.type, id)),
    secondary: [
      text(item.type, "operation"),
      aggregateId ? `aggregate ${aggregateId}` : "無 aggregate",
      typeof item.attemptCount === "number" ? `嘗試 ${item.attemptCount}` : "",
    ].filter(Boolean).join(" · "),
    status: text(item.state, "unknown"),
    aggregateId,
    updatedAt: text(
      item.updatedAt,
      text(item.availableAt, text(item.createdAt, "1970-01-01T00:00:00.000Z")),
    ),
  };
}

export interface OperationsApiErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
  };
}

export class OperationsClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OperationsClientError";
  }
}

export async function operationsResponseJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as T & OperationsApiErrorBody;
  if (response.ok) return payload;
  throw new OperationsClientError(
    payload.error?.code ?? `HTTP_${response.status}`,
    payload.error?.message ?? "營運服務目前無法完成操作。",
    response.status,
  );
}

export function commandSignature(command: OperationsCommandPayload): string {
  return stableJson(command);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
