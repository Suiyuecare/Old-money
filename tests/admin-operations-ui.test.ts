// @vitest-environment jsdom

import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminOperationsWorkspace } from "@/components/admin/AdminOperationsWorkspace";
import {
  isHighRiskOperationsCommand,
  operationsCommandsForRole,
  operationsQueueDisplayRow,
  splitAggregateIds,
} from "@/lib/admin/operations-ui";
import type { AdminOrderProjection } from "@/lib/admin/types";
import type { OperationsProjection } from "@/lib/operations/contracts";

const projection: OperationsProjection = {
  id: "demo-order-id-000001",
  publicId: "LIG-20260727-1001",
  version: 7,
  orderStatus: "processing",
  paymentStatus: "paid",
  invoiceStatus: "not_requested",
  shipmentStatus: "not_created",
  returnStatus: "none",
  refundStatus: "none",
  supportStatus: "none",
  totalGrossTwd: 32600,
  refundedTwd: 0,
  merchantTradeNo: "LIG202607271001",
  providerTradeNo: "300012345678",
  invoiceRelateNumber: null,
  trackingIds: [],
  updatedAt: "2026-07-27T01:45:00.000Z",
};

const durableOrder: AdminOrderProjection = {
  id: projection.id,
  orderNumber: projection.publicId,
  customerName: "訪客",
  customerEmailMasked: "—",
  status: "processing",
  paymentStatus: "paid",
  fulfillmentStatus: "picking",
  totalTwd: projection.totalGrossTwd,
  itemCount: 3,
  createdAt: projection.updatedAt,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("admin operations UI contracts", () => {
  it("filters commands by area and role and marks high-risk effects", () => {
    expect(operationsCommandsForRole("refunds", "support")).toEqual(["refund.request"]);
    expect(operationsCommandsForRole("refunds", "owner")).toEqual([
      "refund.request",
      "refund.execute",
    ]);
    expect(isHighRiskOperationsCommand("refund.execute")).toBe(true);
    expect(isHighRiskOperationsCommand("refund.request")).toBe(false);
    expect(operationsCommandsForRole("returns", "fulfillment")).toEqual([
      "return.receive",
      "return.inspect",
    ]);
    expect(operationsCommandsForRole("fulfillment", "fulfillment")).toEqual([
      "shipment.create",
      "shipment.manual_tracking",
      "shipment.status.update",
      "shipment.cancel",
    ]);
  });

  it("normalizes durable jobs and deduplicates entered unit IDs", () => {
    expect(splitAggregateIds("unit-1, unit-2\nunit-1")).toEqual(["unit-1", "unit-2"]);
    expect(operationsQueueDisplayRow("provider_operations", {
      id: "job-1",
      operationKey: "shipment-create-order-1",
      aggregateId: "order-1",
      type: "shipment.create",
      state: "queued",
      attemptCount: 2,
      updatedAt: "2026-07-27T00:00:00.000Z",
    })).toMatchObject({
      id: "job-1",
      primary: "shipment-create-order-1",
      status: "queued",
      aggregateId: "order-1",
    });
  });

  it("does not preload a synthetic order when durable storage is empty", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    render(createElement(AdminOperationsWorkspace, {
      area: "support",
      role: "support",
      orders: [],
    }));

    expect(screen.getByText(
      "目前沒有可操作的持久化訂單。訂單建立並寫入資料庫後才會出現在這裡。",
    )).toBeInTheDocument();
    expect(screen.queryByText(/demo-order-id/)).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts the current expected version with a stable idempotency key", async () => {
    const updated = { ...projection, version: 8, shipmentStatus: "label_pending" as const };
    const requests: RequestInit[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) {
        return new Response(JSON.stringify({ order: projection }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      requests.push(init);
      return new Response(JSON.stringify({
        operation: {
          projection: updated,
          replayed: false,
          enqueuedOperationKeys: ["shipment-create-order-1"],
          references: {},
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }));

    render(createElement(AdminOperationsWorkspace, {
      area: "fulfillment",
      role: "fulfillment",
      orders: [durableOrder],
    }));

    await screen.findByText(projection.publicId);
    fireEvent.click(screen.getByRole("button", { name: "建立包裹" }));
    await waitFor(() => expect(requests).toHaveLength(1));

    const body = JSON.parse(String(requests[0]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      aggregateId: projection.id,
      expectedVersion: 7,
      command: { type: "shipment.create", parcelCount: 1 },
    });
    expect(body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => {
      expect(screen.getByText((_text, element) =>
        element?.tagName === "SMALL"
        && element.textContent?.includes("version 8") === true,
      )).toBeInTheDocument();
    });
  });

  it("issues invoices from encrypted order facts without collecting Email again", async () => {
    const requests: RequestInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (
          _input: RequestInfo | URL,
          init?: RequestInit,
        ) => {
          if (!init?.method) {
            return new Response(
              JSON.stringify({ order: projection }),
              {
                status: 200,
                headers: {
                  "content-type": "application/json",
                },
              },
            );
          }
          requests.push(init);
          return new Response(
            JSON.stringify({
              operation: {
                projection: {
                  ...projection,
                  version: 8,
                  invoiceStatus: "pending_issue",
                },
                replayed: false,
                enqueuedOperationKeys: [
                  "invoice-issue-order-1",
                ],
                references: {
                  invoiceId:
                    "72000000-0000-4000-8000-000000000002",
                },
              },
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
              },
            },
          );
        },
      ),
    );

    render(
      createElement(AdminOperationsWorkspace, {
        area: "invoices",
        role: "support",
        orders: [durableOrder],
      }),
    );

    await screen.findByText(projection.publicId);
    expect(
      screen.queryByRole("textbox", { name: /email/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "開立電子發票",
      }),
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    const body = JSON.parse(
      String(requests[0]?.body),
    ) as Record<string, unknown>;
    expect(body).toMatchObject({
      aggregateId: projection.id,
      expectedVersion: projection.version,
      command: { type: "invoice.issue" },
    });
    expect(JSON.stringify(body)).not.toContain("@");
    expect(
      (body.command as Record<string, unknown>).option,
    ).toBeUndefined();
  });
});
