import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import {
  adminEngagementRequestHash,
  createRoleScopedNewsletterReadAdapter,
  createRpcAdminEngagementAdapter,
  getAdminEngagementAdapter,
  resetDemoAdminEngagementForTests,
  type AdminEngagementAdapter,
  type AdminEngagementRpcClient,
} from "@/lib/admin/engagement";
import { adminNavigation } from "@/lib/admin/navigation";

const originalMode = process.env.LIGNEE_MODE;
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

const appointment = {
  id: "00000000-0000-4000-8000-000000000801",
  reference: "APT-0000000000",
  kind: "private_showing",
  state: "confirmed",
  scheduledFor: "2026-07-30T06:30:00.000Z",
  hasContact: true,
  hasMessage: true,
  version: 2,
  createdAt: "2026-07-27T01:00:00.000Z",
  updatedAt: "2026-07-27T02:00:00.000Z",
} as const;

const campaign = {
  id: "00000000-0000-4000-8000-000000000803",
  title: "Letters from the Estate · No. 01",
  subject: "The Private Court",
  previewText: "Notes from the grass court.",
  contentMarkdown: "A considered note.",
  state: "draft",
  version: 1,
  createdAt: "2026-07-27T00:20:00.000Z",
  updatedAt: "2026-07-27T00:20:00.000Z",
  deliveryEnabled: false,
} as const;

afterEach(() => {
  if (originalMode === undefined) delete process.env.LIGNEE_MODE;
  else process.env.LIGNEE_MODE = originalMode;
  if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalSupabaseUrl;
  if (originalSupabaseKey === undefined) {
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
  } else {
    process.env.SUPABASE_PUBLISHABLE_KEY = originalSupabaseKey;
  }
});

describe("durable appointment and newsletter adapters", () => {
  it("exposes only the newsletter reads allowed for each admin role", async () => {
    let campaignCalls = 0;
    let consentCalls = 0;
    const adapter = {
      async listNewsletterCampaigns() {
        campaignCalls += 1;
        return { items: [], total: 0, limit: 50, offset: 0 };
      },
      async listNewsletterConsents() {
        consentCalls += 1;
        return { items: [], total: 0, limit: 50, offset: 0 };
      },
    } as unknown as AdminEngagementAdapter;
    const factory = () => adapter;

    const owner = createRoleScopedNewsletterReadAdapter("owner", factory);
    const merchandiser = createRoleScopedNewsletterReadAdapter(
      "merchandiser",
      factory,
    );
    const support = createRoleScopedNewsletterReadAdapter("support", factory);
    const fulfillment = createRoleScopedNewsletterReadAdapter(
      "fulfillment",
      factory,
    );

    expect(owner.listCampaigns).toBeTypeOf("function");
    expect(owner.listConsents).toBeTypeOf("function");
    expect(merchandiser.listCampaigns).toBeTypeOf("function");
    expect(merchandiser.listConsents).toBeNull();
    expect(support.listCampaigns).toBeNull();
    expect(support.listConsents).toBeTypeOf("function");
    expect(fulfillment.listCampaigns).toBeNull();
    expect(fulfillment.listConsents).toBeNull();

    await merchandiser.listCampaigns?.();
    await support.listConsents?.();
    expect({ campaignCalls, consentCalls }).toEqual({
      campaignCalls: 1,
      consentCalls: 1,
    });
  });

  it("uses exact API RPC arguments and deterministic request hashes", async () => {
    const calls: {
      readonly name: string;
      readonly args: Readonly<Record<string, unknown>> | undefined;
    }[] = [];
    const client: AdminEngagementRpcClient = {
      async rpc(name, args) {
        calls.push({ name, args });
        if (name === "admin_appointments_list") {
          return {
            data: {
              items: [appointment],
              total: 1,
              limit: 25,
              offset: 0,
            },
            error: null,
          };
        }
        if (name === "admin_appointment_state_command") {
          return { data: appointment, error: null };
        }
        if (name === "admin_newsletter_campaign_create") {
          return { data: campaign, error: null };
        }
        return {
          data: null,
          error: { code: "PGRST202", message: "missing RPC" },
        };
      },
    };
    const adapter = createRpcAdminEngagementAdapter(async () => client);

    const page = await adapter.listAppointments({
      state: "confirmed",
      limit: 25,
      offset: 0,
    });
    expect(page.items[0]).toEqual(appointment);
    expect(page.items[0]).not.toHaveProperty("contactEnvelope");
    expect(page.items[0]).not.toHaveProperty("messageEnvelope");

    await adapter.transitionAppointment({
      appointmentId: appointment.id,
      targetState: "confirmed",
      scheduledFor: appointment.scheduledFor,
    }, {
      expectedVersion: 1,
      idempotencyKey: "appointment-confirm-0001",
    });
    await adapter.createNewsletterCampaign({
      title: campaign.title,
      subject: campaign.subject,
      previewText: campaign.previewText,
      contentMarkdown: campaign.contentMarkdown,
    }, {
      expectedVersion: 0,
      idempotencyKey: "newsletter-create-0001",
    });

    expect(calls[0]).toEqual({
      name: "admin_appointments_list",
      args: {
        p_state: "confirmed",
        p_limit: 25,
        p_offset: 0,
      },
    });
    expect(calls[1]).toEqual({
      name: "admin_appointment_state_command",
      args: {
        p_appointment_id: appointment.id,
        p_expected_version: 1,
        p_target_state: "confirmed",
        p_scheduled_for: appointment.scheduledFor,
        p_idempotency_key: "appointment-confirm-0001",
        p_request_hash: adminEngagementRequestHash(
          "appointment.state",
          {
            appointmentId: appointment.id,
            expectedVersion: 1,
            targetState: "confirmed",
            scheduledFor: appointment.scheduledFor,
          },
        ),
      },
    });
    expect(calls[2]).toEqual({
      name: "admin_newsletter_campaign_create",
      args: {
        p_expected_version: 0,
        p_title: campaign.title,
        p_subject: campaign.subject,
        p_preview_text: campaign.previewText,
        p_content_markdown: campaign.contentMarkdown,
        p_idempotency_key: "newsletter-create-0001",
        p_request_hash: adminEngagementRequestHash(
          "newsletter.campaign.create",
          {
            expectedVersion: 0,
            title: campaign.title,
            subject: campaign.subject,
            previewText: campaign.previewText,
            contentMarkdown: campaign.contentMarkdown,
          },
        ),
      },
    });
  });

  it("fails closed on malformed projections and maps row conflicts to 409", async () => {
    const malformed = createRpcAdminEngagementAdapter(async () => ({
      async rpc() {
        return {
          data: {
            items: [{
              ...appointment,
              contactEnvelope: { ciphertext: "must-not-cross-boundary" },
            }],
            total: 1,
            limit: 50,
            offset: 0,
          },
          error: null,
        };
      },
    }));
    await expect(malformed.listAppointments()).rejects.toMatchObject({
      code: "ADMIN_ENGAGEMENT_RPC_INVALID_RESPONSE",
      status: 502,
    });

    const conflict = createRpcAdminEngagementAdapter(async () => ({
      async rpc() {
        return {
          data: null,
          error: { message: "ROW_VERSION_CONFLICT" },
        };
      },
    }));
    await expect(conflict.transitionNewsletterCampaign(
      campaign.id,
      "review",
      {
        expectedVersion: 1,
        idempotencyKey: "newsletter-review-0001",
      },
    )).rejects.toMatchObject({
      code: "ROW_VERSION_CONFLICT",
      status: 409,
    });
  });

  it("enforces demo CAS, idempotency, safe transitions and no delivery state", async () => {
    process.env.LIGNEE_MODE = "demo";
    resetDemoAdminEngagementForTests();
    const adapter = getAdminEngagementAdapter();

    const requested = (await adapter.listAppointments()).items[0];
    expect(requested?.state).toBe("requested");
    if (!requested) return;
    const context = {
      expectedVersion: requested.version,
      idempotencyKey: "appointment-confirm-demo-0001",
    };
    const confirmed = await adapter.transitionAppointment({
      appointmentId: requested.id,
      targetState: "confirmed",
      scheduledFor: "2026-07-30T06:30:00.000Z",
    }, context);
    expect(confirmed).toMatchObject({ state: "confirmed", version: 2 });
    await expect(adapter.transitionAppointment({
      appointmentId: requested.id,
      targetState: "confirmed",
      scheduledFor: "2026-07-30T06:30:00.000Z",
    }, context)).resolves.toMatchObject({
      state: "confirmed",
      version: 2,
      replayed: true,
    });
    await expect(adapter.transitionAppointment({
      appointmentId: requested.id,
      targetState: "confirmed",
      scheduledFor: "2026-07-31T06:30:00.000Z",
    }, context)).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_CONFLICT",
      status: 409,
    });
    await expect(adapter.transitionAppointment({
      appointmentId: requested.id,
      targetState: "completed",
      scheduledFor: null,
    }, {
      expectedVersion: requested.version,
      idempotencyKey: "appointment-complete-stale-0001",
    })).rejects.toMatchObject({
      code: "ROW_VERSION_CONFLICT",
      status: 409,
    });

    const consent = (await adapter.listNewsletterConsents()).items[0];
    if (!consent) return;
    const stopped = await adapter.unsubscribeNewsletterConsent(consent.id, {
      expectedVersion: consent.version,
      idempotencyKey: "newsletter-consent-stop-0001",
    });
    expect(stopped.state).toBe("unsubscribed");

    const created = await adapter.createNewsletterCampaign({
      title: "Estate Letter No. 02",
      subject: "An Afternoon at the Estate",
      previewText: "",
      contentMarkdown: "Draft content only.",
    }, {
      expectedVersion: 0,
      idempotencyKey: "newsletter-campaign-create-0002",
    });
    expect(created).toMatchObject({
      state: "draft",
      version: 1,
      deliveryEnabled: false,
    });
    const review = await adapter.transitionNewsletterCampaign(
      created.id,
      "review",
      {
        expectedVersion: created.version,
        idempotencyKey: "newsletter-campaign-review-0002",
      },
    );
    expect(review).toMatchObject({
      state: "review",
      deliveryEnabled: false,
    });
    await expect(adapter.updateNewsletterCampaign(created.id, {
      title: created.title,
      subject: created.subject,
      previewText: created.previewText,
      contentMarkdown: "Must stay locked while in review.",
    }, {
      expectedVersion: review.version,
      idempotencyKey: "newsletter-campaign-edit-review-0002",
    })).rejects.toMatchObject({
      code: "NEWSLETTER_CAMPAIGN_NOT_EDITABLE",
      status: 422,
    });
  });

  it("keeps server actions and production pages behind both authorization layers", () => {
    const actions = readFileSync(
      new URL("../lib/admin/engagement-actions.ts", import.meta.url),
      "utf8",
    );
    expect(
      actions.match(/await assertAdminMutationOrigin\(\)/g),
    ).toHaveLength(5);
    expect(actions).toContain("await requireAdminRole([\"owner\", \"support\"])");
    expect(actions).toContain(
      "await requireAdminRole([\"owner\", \"merchandiser\"])",
    );
    expect(actions).toContain("await requireRecentAal2()");
    expect(actions).toContain("expectedVersion");
    expect(actions).toContain("idempotencyKey");

    const appointmentsPage = readFileSync(
      new URL(
        "../app/admin/(console)/appointments/page.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const newsletterPage = readFileSync(
      new URL(
        "../app/admin/(console)/newsletter/page.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    for (const source of [appointmentsPage, newsletterPage]) {
      expect(source).not.toContain("listOperationalRows");
    }
    expect(appointmentsPage).toContain("getAdminEngagementAdapter()");
    expect(newsletterPage).toContain("getAdminEngagementAdapter,");
    expect(newsletterPage).toContain("\"support\"");
    expect(newsletterPage).toContain(
      "createRoleScopedNewsletterReadAdapter",
    );
    expect(newsletterPage).not.toContain(".listNewsletterCampaigns(");
    expect(newsletterPage).not.toContain(".listNewsletterConsents(");

    const newsletterNavigation = adminNavigation
      .flatMap((group) => group.items)
      .find((item) => item.href === "/admin/newsletter");
    expect(newsletterNavigation?.roles).toEqual([
      "owner",
      "merchandiser",
      "support",
    ]);

    const unsubscribeAction = actions.slice(
      actions.indexOf("export async function unsubscribeNewsletterConsentAction"),
      actions.indexOf("export async function createNewsletterCampaignAction"),
    );
    expect(unsubscribeAction).toContain(
      "await requireAdminRole([\"owner\", \"support\"])",
    );
    expect(unsubscribeAction).not.toContain("\"merchandiser\"");

    const migration = readFileSync(
      new URL(
        "../supabase/migrations/20260727175343_add_durable_appointments_and_newsletter_backoffice.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(migration).toContain("force row level security");
    expect(migration).toContain("from public, anon, authenticated, service_role");
    expect(migration).toContain("NEWSLETTER_DELIVERY_NOT_CONFIGURED");
    expect(
      migration.match(/request_hash_value := encode\(/g),
    ).toHaveLength(5);
    expect(
      migration.match(/p_idempotency_key,\s+request_hash_value\s+\)/g),
    ).toHaveLength(5);
    expect(migration).not.toMatch(
      /p_idempotency_key,\s+p_request_hash\s+\)/,
    );
    expect(migration).not.toContain("insert into ops_private.outbox_jobs");
    expect(migration).not.toMatch(/\bnet\.http_/i);
  });
});
