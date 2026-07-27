// @vitest-environment jsdom

import { createElement } from "react";
import {
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";

import { useAdminIdempotencyKey } from "@/components/admin/useAdminIdempotencyKey";
import type { AdminActionState } from "@/lib/admin/types";

function KeyProbe({
  state,
}: {
  readonly state: AdminActionState<unknown>;
}) {
  return createElement(
    "output",
    { "data-testid": "key" },
    useAdminIdempotencyKey(state),
  );
}

afterEach(() => cleanup());

describe("admin idempotency key lifecycle", () => {
  it("preserves unresolved retries and rotates after every durable success", async () => {
    const idle: AdminActionState<unknown> = {
      status: "idle",
      message: "",
    };
    const view = render(createElement(KeyProbe, { state: idle }));
    const initial = screen.getByTestId("key").textContent;

    const error: AdminActionState<unknown> = {
      status: "error",
      message: "暫時無法確認結果",
    };
    view.rerender(createElement(KeyProbe, { state: error }));
    expect(screen.getByTestId("key")).toHaveTextContent(initial ?? "");

    const firstSuccess: AdminActionState<unknown> = {
      status: "success",
      message: "已寫入",
    };
    view.rerender(createElement(KeyProbe, { state: firstSuccess }));
    await waitFor(() => {
      expect(screen.getByTestId("key").textContent).not.toBe(initial);
    });
    const firstRotated = screen.getByTestId("key").textContent;

    const secondSuccess: AdminActionState<unknown> = {
      status: "success",
      message: "第二次寫入",
    };
    view.rerender(createElement(KeyProbe, { state: secondSuccess }));
    await waitFor(() => {
      expect(screen.getByTestId("key").textContent).not.toBe(firstRotated);
    });
  });
});
