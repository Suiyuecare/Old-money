// @vitest-environment jsdom

import { createElement } from "react";
import {
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: () => ({
    auth: { getSession },
  }),
}));

import { AdminInviteConfirmation } from "@/components/admin/AdminInviteConfirmation";

afterEach(() => {
  cleanup();
  getSession.mockReset();
  window.history.replaceState(null, "", "/");
});

describe("admin invitation confirmation", () => {
  it("persists a default-template fragment session before showing the password form", async () => {
    window.history.replaceState(
      null,
      "",
      "/admin/invite/confirm#access_token=sensitive&refresh_token=sensitive",
    );
    getSession.mockResolvedValue({
      data: { session: { user: { id: "owner-one" } } },
      error: null,
    });

    render(createElement(AdminInviteConfirmation, {
      publishableKey: "sb_publishable_test",
      supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
      tokenHash: "",
    }));

    expect(screen.getByText("正在安全地驗證邀請連結…")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("建立密碼")).toBeInTheDocument(),
    );
    expect(window.location.hash).toBe("");
  });

  it("supports the server-verifiable TokenHash template without a browser exchange", () => {
    render(createElement(AdminInviteConfirmation, {
      publishableKey: "sb_publishable_test",
      supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
      tokenHash: "a".repeat(40),
    }));

    expect(screen.getByLabelText("建立密碼")).toBeInTheDocument();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("fails closed when the fragment cannot establish a session", async () => {
    getSession.mockResolvedValue({
      data: { session: null },
      error: new Error("expired"),
    });

    render(createElement(AdminInviteConfirmation, {
      publishableKey: "sb_publishable_test",
      supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
      tokenHash: "",
    }));

    await waitFor(() =>
      expect(
        screen.getByText("邀請連結無效或已逾期。請聯絡 Owner 重新邀請。"),
      ).toBeInTheDocument(),
    );
  });
});
