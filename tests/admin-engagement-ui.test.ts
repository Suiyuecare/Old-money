// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import {
  cleanup,
  render,
  screen,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";

import { AdminAppointmentsWorkspace } from "@/components/admin/AdminAppointmentsWorkspace";
import { AdminNewsletterWorkspace } from "@/components/admin/AdminNewsletterWorkspace";
import type {
  AdminAppointmentProjection,
  AdminNewsletterCampaignDraft,
  AdminNewsletterConsentProjection,
} from "@/lib/admin/engagement";

const appointment: AdminAppointmentProjection = {
  id: "00000000-0000-4000-8000-000000000901",
  reference: "APT-0000000000",
  kind: "private_showing",
  state: "requested",
  scheduledFor: null,
  hasContact: true,
  hasMessage: true,
  version: 1,
  createdAt: "2026-07-27T01:00:00.000Z",
  updatedAt: "2026-07-27T01:00:00.000Z",
};

const campaign: AdminNewsletterCampaignDraft = {
  id: "00000000-0000-4000-8000-000000000902",
  title: "Estate Letter No. 01",
  subject: "The Private Court",
  previewText: "Notes from the grass court.",
  contentMarkdown: "Review copy.",
  state: "review",
  version: 2,
  createdAt: "2026-07-27T00:20:00.000Z",
  updatedAt: "2026-07-27T00:40:00.000Z",
  deliveryEnabled: false,
};

const consent: AdminNewsletterConsentProjection = {
  id: "00000000-0000-4000-8000-000000000903",
  reference: "CONSENT-0000000000",
  state: "subscribed",
  version: 1,
  consentedAt: "2026-07-27T00:30:00.000Z",
  unsubscribedAt: null,
  createdAt: "2026-07-27T00:30:00.000Z",
  updatedAt: "2026-07-27T00:30:00.000Z",
};

afterEach(() => cleanup());

describe("appointment and newsletter admin UI", () => {
  it("uses retry-stable keys that rotate only after durable success", () => {
    const appointments = readFileSync(
      resolve(
        process.cwd(),
        "components/admin/AdminAppointmentsWorkspace.tsx",
      ),
      "utf8",
    );
    const newsletter = readFileSync(
      resolve(
        process.cwd(),
        "components/admin/AdminNewsletterWorkspace.tsx",
      ),
      "utf8",
    );

    expect(
      appointments.match(/useAdminIdempotencyKey\(/g),
    ).toHaveLength(1);
    expect(
      newsletter.match(/useAdminIdempotencyKey\(/g),
    ).toHaveLength(3);
    expect(appointments).not.toContain("useState(");
    expect(newsletter).not.toContain("useState(");
  });

  it("shows only sealed appointment indicators and versioned state controls", () => {
    const { container } = render(createElement(
      AdminAppointmentsWorkspace,
      {
        page: {
          items: [appointment],
          total: 1,
          limit: 100,
          offset: 0,
        },
      },
    ));

    expect(screen.getByText("聯絡資料：已密封")).toBeInTheDocument();
    expect(screen.getByText("需求留言：已密封")).toBeInTheDocument();
    expect(
      screen.getByText("私人預約狀態、時段與可執行操作"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: `確認時段：${appointment.reference}`,
      }),
    ).toBeInTheDocument();
    expect(
      container.querySelector('input[name="expectedVersion"]'),
    ).toHaveValue("1");
    expect(
      container.querySelector('input[name="contactEnvelope"]'),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('input[name="messageEnvelope"]'),
    ).not.toBeInTheDocument();
  });

  it("formats midnight appointment values as a valid Taipei local input", () => {
    render(createElement(
      AdminAppointmentsWorkspace,
      {
        page: {
          items: [{
            ...appointment,
            state: "confirmed",
            scheduledFor: "2026-07-30T16:00:00.000Z",
            version: 2,
          }],
          total: 1,
          limit: 100,
          offset: 0,
        },
      },
    ));

    expect(
      screen.getByLabelText(`${appointment.reference} 台北時段`),
    ).toHaveValue("2026-07-31T00:00");
  });

  it("keeps recipient collection and campaign approval disabled", () => {
    const { container } = render(createElement(
      AdminNewsletterWorkspace,
      {
        campaigns: {
          items: [campaign],
          total: 1,
          limit: 100,
          offset: 0,
        },
        canArchive: true,
        consents: {
          items: [consent],
          total: 1,
          limit: 100,
          offset: 0,
        },
      },
    ));

    expect(screen.getByText("正式寄送保持關閉")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Owner 核准（尚未開放）" }),
    ).toBeDisabled();
    expect(container.querySelector('input[type="email"]')).toBeNull();
    expect(container.querySelector('input[name="email"]')).toBeNull();
    expect(
      container.querySelector('input[name="expectedVersion"][value="2"]'),
    ).toBeInTheDocument();
    expect(
      screen.getByText("電子報訂閱同意狀態與停止寄送操作"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", {
      name: `停止寄送：${consent.reference}`,
    }))
      .toBeInTheDocument();
  });

  it("renders a Support consent-only workspace without campaign content", () => {
    const { container } = render(createElement(
      AdminNewsletterWorkspace,
      {
        canArchive: false,
        consents: {
          items: [consent],
          total: 1,
          limit: 100,
          offset: 0,
        },
      },
    ));

    expect(screen.getByRole("heading", { name: "訂閱同意紀錄" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Estate Letters 草稿" }))
      .not.toBeInTheDocument();
    expect(screen.getByText(/本權限只管理 consent ledger/))
      .toBeInTheDocument();
    expect(container.querySelector('input[name="title"]')).toBeNull();
  });

  it("renders a Merchandiser campaign-only workspace without consent data", () => {
    const { container } = render(createElement(
      AdminNewsletterWorkspace,
      {
        campaigns: {
          items: [campaign],
          total: 1,
          limit: 100,
          offset: 0,
        },
        canArchive: false,
      },
    ));

    expect(screen.getByRole("heading", { name: "Estate Letters 草稿" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "訂閱同意紀錄" }))
      .not.toBeInTheDocument();
    expect(screen.getByText(/本權限只管理內容草稿/))
      .toBeInTheDocument();
    expect(container.querySelector('input[name="consentId"]')).toBeNull();
  });

  it("keeps one Owner section available when the other RPC fails", () => {
    render(createElement(
      AdminNewsletterWorkspace,
      {
        campaigns: null,
        campaignsError: "草稿 RPC 暫時無法使用。",
        canArchive: true,
        consents: {
          items: [consent],
          total: 1,
          limit: 100,
          offset: 0,
        },
      },
    ));

    expect(screen.getByRole("heading", {
      name: "電子報草稿目前無法讀取",
    })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "訂閱同意紀錄" }))
      .toBeInTheDocument();
  });
});
