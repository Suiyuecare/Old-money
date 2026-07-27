// @vitest-environment jsdom

import { createElement, StrictMode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OrderAccessRequestForm } from "@/app/(service)/orders/OrderAccessRequestForm";
import { OrderAccessClient } from "@/app/(service)/orders/access/OrderAccessClient";

const accessedOrder = {
  publicId: "LIG-20260727-1001",
  status: "processing",
  paymentStatus: "paid",
  shipmentStatus: "label_pending",
  grossTwd: 9_800,
  trackingIds: ["TCAT-1234567890", "MANUAL-ESTATE-02"],
  updatedAt: "2026-07-28T01:00:00.000Z",
} as const;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("order access fragment exchange", () => {
  it("clears the URL before exchanging the token in a same-origin body", async () => {
    const token = "A".repeat(43);
    window.history.replaceState(
      null,
      "",
      `/orders/access#token=${token}`,
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        granted: true,
        order: accessedOrder,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      createElement(
        StrictMode,
        null,
        createElement(OrderAccessClient),
      ),
    );
    expect(window.location.pathname).toBe("/orders/access");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");

    await waitFor(() =>
      expect(
        screen.getByText("訂單 LIG-20260727-1001"),
      ).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestPath, requestInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(requestPath).toBe("/api/order-access/exchanges");
    expect(requestPath).not.toContain(token);
    expect(requestInit).toMatchObject({
      method: "POST",
      credentials: "same-origin",
    });
    expect(JSON.parse(String(requestInit.body))).toEqual({ token });
  });

  it("restores an HttpOnly session without a fragment and shows durable fulfillment data", async () => {
    window.history.replaceState(null, "", "/orders/access");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ order: accessedOrder }),
      })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      createElement(
        StrictMode,
        null,
        createElement(OrderAccessClient),
      ),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: "訂單 LIG-20260727-1001",
        }),
      ).toBeInTheDocument(),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/order-access/session",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      credentials: "same-origin",
    });
    expect(
      screen.getByRole("list", { name: "物流追蹤碼" }),
    ).toHaveTextContent("TCAT-1234567890");
    expect(
      screen.getByRole("list", { name: "物流追蹤碼" }),
    ).toHaveTextContent("MANUAL-ESTATE-02");
    expect(
      container.querySelector(
        'time[datetime="2026-07-28T01:00:00.000Z"]',
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "結束安全查詢" }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "安全查詢已結束" }),
      ).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/order-access/session",
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "DELETE",
      credentials: "same-origin",
    });
    expect(
      screen.getByRole("link", { name: "返回安全訂單查詢" }),
    ).toHaveAttribute("href", "/orders");
  });

  it("fails closed when neither the fragment nor an HttpOnly session grants access", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );

    render(createElement(OrderAccessClient));

    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: "安全連結無效或已失效",
        }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("link", { name: "返回安全訂單查詢" }),
    ).toHaveAttribute("href", "/orders");
  });
});

describe("order access request form", () => {
  function enterRequestFields() {
    fireEvent.change(screen.getByLabelText("訂單編號"), {
      target: { value: "LIG-20260727-1001" },
    });
    fireEvent.change(screen.getByLabelText("結帳 Email"), {
      target: { value: "buyer@example.com" },
    });
  }

  it("provides an accessible form and preserves the anti-enumeration response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 202 });
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(OrderAccessRequestForm));

    const form = screen.getByRole("form", {
      name: "寄送安全查詢連結",
    });
    expect(form).toHaveAttribute(
      "aria-describedby",
      "order-access-request-help",
    );
    expect(screen.getByLabelText("訂單編號")).toBeRequired();
    expect(screen.getByLabelText("結帳 Email")).toBeRequired();
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-live",
      "polite",
    );

    enterRequestFields();
    fireEvent.submit(form);

    await waitFor(() =>
      expect(
        screen.getByText(
          "若資料相符，安全連結將寄至該信箱；請同時檢查垃圾郵件。",
        ),
      ).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(path).toBe("/api/order-access/requests");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      publicId: "LIG-20260727-1001",
      email: "buyer@example.com",
      idempotencyKey: expect.stringMatching(
        /^[A-Za-z0-9._:-]{16,128}$/,
      ),
    });
  });

  it("uses the API in production-disabled mode and retains the key for an uncertain retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(OrderAccessRequestForm));

    enterRequestFields();
    const submit = screen.getByRole("button", {
      name: "寄送安全連結",
    });
    fireEvent.click(submit);

    await waitFor(() =>
      expect(
        screen.getByRole("alert"),
      ).toHaveTextContent(
        "目前無法受理安全查詢，請稍後使用相同資料重試。",
      ),
    );
    fireEvent.click(submit);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const first = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    ) as { readonly idempotencyKey: string };
    const retry = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit).body),
    ) as { readonly idempotencyKey: string };
    expect(retry.idempotencyKey).toBe(first.idempotencyKey);
  });
});
