"use client";

import { useActionState } from "react";

import {
  createNewsletterCampaignAction,
  transitionNewsletterCampaignAction,
  unsubscribeNewsletterConsentAction,
  updateNewsletterCampaignAction,
} from "@/lib/admin/engagement-actions";
import type {
  AdminEngagementPage,
  AdminNewsletterCampaignDraft,
  AdminNewsletterCampaignState,
  AdminNewsletterConsentProjection,
  AdminNewsletterConsentState,
} from "@/lib/admin/engagement";
import type { AdminActionState } from "@/lib/admin/types";

import { ActionFeedback } from "./AdminActionFeedback";
import {
  AdminEmpty,
  AdminStatus,
  formatAdminDate,
} from "./AdminUi";
import { useAdminIdempotencyKey } from "./useAdminIdempotencyKey";

const campaignIdle: AdminActionState<AdminNewsletterCampaignDraft> = {
  status: "idle",
  message: "",
};
const consentIdle: AdminActionState<AdminNewsletterConsentProjection> = {
  status: "idle",
  message: "",
};

const campaignStateLabels: Readonly<
  Record<AdminNewsletterCampaignState, string>
> = {
  draft: "草稿",
  review: "待 Owner 核准",
  approved: "已核准",
  archived: "已封存",
};

const consentStateLabels: Readonly<
  Record<AdminNewsletterConsentState, string>
> = {
  pending: "待確認",
  subscribed: "已同意",
  unsubscribed: "停止寄送",
};

export function AdminNewsletterWorkspace({
  campaigns,
  campaignsError = null,
  canArchive,
  consents,
  consentsError = null,
}: {
  readonly campaigns?:
    | AdminEngagementPage<AdminNewsletterCampaignDraft>
    | null;
  readonly campaignsError?: string | null;
  readonly canArchive: boolean;
  readonly consents?:
    | AdminEngagementPage<AdminNewsletterConsentProjection>
    | null;
  readonly consentsError?: string | null;
}) {
  const boundaryDescription = campaigns === undefined
    ? "本權限只管理 consent ledger 的停止寄送。RPC 不回傳收件人資料，也沒有任何對外寄送能力。"
    : consents === undefined
      ? "本權限只管理內容草稿。尚未建立 Resend 寄送、排程或收件人解析；送審不會對外寄信。"
      : "本版管理 consent ledger 與內容草稿。尚未建立 Resend 寄送、排程或 outbox；送審不會對外寄信。";
  return (
    <>
      <section className="admin-runtime-boundary" aria-labelledby="newsletter-boundary-heading">
        <div>
          <span className="admin-eyebrow">Delivery Gate</span>
          <h2 id="newsletter-boundary-heading">正式寄送保持關閉</h2>
          <p>{boundaryDescription}</p>
        </div>
        <AdminStatus label="Disabled" value="blocked" />
      </section>

      {campaigns === undefined
        ? null
        : campaigns
          ? (
              <CampaignsWorkspace
                campaigns={campaigns}
                canArchive={canArchive}
              />
            )
          : (
              <AdminEmpty
                description={`${campaignsError ?? "草稿 RPC 目前無法使用。"} 草稿操作與寄送皆保持 fail-closed。`}
                title="電子報草稿目前無法讀取"
              />
            )}

      {consents === undefined
        ? null
        : consents
          ? <ConsentsWorkspace consents={consents} />
          : (
              <AdminEmpty
                description={`${consentsError ?? "Consent RPC 目前無法使用。"} 停止寄送操作保持 fail-closed。`}
                title="訂閱同意紀錄目前無法讀取"
              />
            )}
    </>
  );
}

function CampaignsWorkspace({
  campaigns,
  canArchive,
}: {
  readonly campaigns: AdminEngagementPage<AdminNewsletterCampaignDraft>;
  readonly canArchive: boolean;
}) {
  return (
    <section className="admin-workbench" aria-labelledby="campaigns-heading">
      <header className="admin-workbench__header">
        <div>
          <span className="admin-eyebrow">Campaign Drafts</span>
          <h2 id="campaigns-heading">Estate Letters 草稿</h2>
          <p>建立、編輯與送審品牌內容；送審不等於核准或寄送。</p>
        </div>
      </header>
      <details className="admin-disclosure">
        <summary>建立新草稿</summary>
        <CampaignEditor />
      </details>
      {campaigns.items.length ? (
        <div className="admin-release-batch-list">
          {campaigns.items.map((campaign) => (
            <CampaignCard
              campaign={campaign}
              canArchive={canArchive}
              key={campaign.id}
            />
          ))}
        </div>
      ) : (
        <AdminEmpty
          description="建立第一封 Estate Letters 草稿；目前沒有任何寄送能力。"
          title="尚未建立電子報草稿"
        />
      )}
    </section>
  );
}

function ConsentsWorkspace({
  consents,
}: {
  readonly consents: AdminEngagementPage<AdminNewsletterConsentProjection>;
}) {
  return (
    <section className="admin-workbench" aria-labelledby="consents-heading">
      <header className="admin-workbench__header">
        <div>
          <span className="admin-eyebrow">Consent Ledger</span>
          <h2 id="consents-heading">訂閱同意紀錄</h2>
          <p>
            共 {consents.total} 筆。RPC 不回傳 Email、email HMAC
            或確認 token；後台只能執行停止寄送。
          </p>
        </div>
      </header>
      {consents.items.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="sr-only">
              電子報訂閱同意狀態與停止寄送操作
            </caption>
            <thead>
              <tr>
                <th scope="col">Consent</th>
                <th scope="col">狀態</th>
                <th scope="col">同意／停止時間</th>
                <th scope="col">安全操作</th>
              </tr>
            </thead>
            <tbody>
              {consents.items.map((consent) => (
                <tr key={consent.id}>
                  <th scope="row">
                    {consent.reference}
                    <small>v{consent.version}</small>
                  </th>
                  <td>
                    <AdminStatus
                      label={consentStateLabels[consent.state]}
                      value={consent.state}
                    />
                  </td>
                  <td>
                    {consent.unsubscribedAt
                      ? `停止：${formatAdminDate(consent.unsubscribedAt)}`
                      : consent.consentedAt
                        ? `同意：${formatAdminDate(consent.consentedAt)}`
                        : "尚待確認"}
                  </td>
                  <td>
                    <ConsentStopForm consent={consent} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <AdminEmpty
          description="目前沒有可顯示的 consent；公開展示表單不會收集 Email。"
          title="尚無訂閱同意紀錄"
        />
      )}
    </section>
  );
}

function CampaignEditor({
  campaign,
}: {
  readonly campaign?: AdminNewsletterCampaignDraft;
}) {
  const actionFunction = campaign
    ? updateNewsletterCampaignAction
    : createNewsletterCampaignAction;
  const [state, action, pending] = useActionState(
    actionFunction,
    campaignIdle,
  );
  const key = useAdminIdempotencyKey(state);
  return (
    <form
      action={action}
      aria-busy={pending}
      className="admin-form admin-subform"
    >
      {campaign ? (
        <input name="campaignId" type="hidden" value={campaign.id} />
      ) : null}
      <input
        name="expectedVersion"
        type="hidden"
        value={campaign?.version ?? 0}
      />
      <input
        name="idempotencyKey"
        type="hidden"
        value={`${key}:${campaign?.version ?? 0}`}
      />
      <div className="admin-form-grid">
        <label>
          內部標題
          <input
            defaultValue={campaign?.title}
            maxLength={160}
            name="title"
            required
          />
        </label>
        <label>
          Email 主旨
          <input
            defaultValue={campaign?.subject}
            maxLength={200}
            name="subject"
            required
          />
        </label>
      </div>
      <label>
        Preview text
        <input
          defaultValue={campaign?.previewText}
          maxLength={300}
          name="previewText"
        />
      </label>
      <label>
        Markdown 內容草稿
        <textarea
          defaultValue={campaign?.contentMarkdown}
          maxLength={50_000}
          name="contentMarkdown"
          required
          rows={10}
        />
      </label>
      <p className="admin-form-help">
        此表單只儲存內容；不接受收件人 Email，也不會建立寄送工作。
      </p>
      <ActionFeedback state={state} />
      <button className="admin-button" disabled={pending} type="submit">
        {pending ? "儲存中…" : campaign ? "更新草稿" : "建立草稿"}
      </button>
    </form>
  );
}

function CampaignCard({
  campaign,
  canArchive,
}: {
  readonly campaign: AdminNewsletterCampaignDraft;
  readonly canArchive: boolean;
}) {
  return (
    <article className="admin-release-batch">
      <header>
        <div>
          <h3>{campaign.title}</h3>
          <p>{campaign.subject} · v{campaign.version}</p>
          <small>更新於 {formatAdminDate(campaign.updatedAt)}</small>
        </div>
        <AdminStatus
          label={campaignStateLabels[campaign.state]}
          value={campaign.state}
        />
      </header>
      <p>{campaign.previewText || "尚未填寫 preview text。"}</p>
      {campaign.state === "draft" ? (
        <details className="admin-disclosure">
          <summary>編輯內容草稿</summary>
          <CampaignEditor campaign={campaign} />
        </details>
      ) : (
        <details className="admin-disclosure">
          <summary>查看已鎖定內容</summary>
          <pre className="admin-campaign-preview">
            {campaign.contentMarkdown}
          </pre>
        </details>
      )}
      <div className="admin-engagement-actions">
        {campaign.state === "draft" ? (
          <CampaignStateForm
            campaign={campaign}
            label="送交審核"
            targetState="review"
          />
        ) : null}
        {campaign.state === "review" ? (
          <>
            <CampaignStateForm
              campaign={campaign}
              label="退回草稿"
              targetState="draft"
            />
            <button
              className="admin-button"
              disabled
              title="正式 Email credentials、寄送 outbox 與 canary 尚未完成"
              type="button"
            >
              Owner 核准（尚未開放）
            </button>
          </>
        ) : null}
        {canArchive && campaign.state !== "archived" ? (
          <CampaignStateForm
            campaign={campaign}
            danger
            label="封存草稿"
            targetState="archived"
          />
        ) : null}
      </div>
      <p className="admin-form-help">
        Delivery：關閉。沒有排程、收件人解析或 Resend 副作用。
      </p>
    </article>
  );
}

function CampaignStateForm({
  campaign,
  danger = false,
  label,
  targetState,
}: {
  readonly campaign: AdminNewsletterCampaignDraft;
  readonly danger?: boolean;
  readonly label: string;
  readonly targetState: "draft" | "review" | "archived";
}) {
  const [state, action, pending] = useActionState(
    transitionNewsletterCampaignAction,
    campaignIdle,
  );
  const key = useAdminIdempotencyKey(state);
  return (
    <form
      action={action}
      aria-busy={pending}
      className="admin-inline-form"
    >
      <input name="campaignId" type="hidden" value={campaign.id} />
      <input name="expectedVersion" type="hidden" value={campaign.version} />
      <input
        name="idempotencyKey"
        type="hidden"
        value={`${key}:${campaign.version}:${targetState}`}
      />
      <input name="targetState" type="hidden" value={targetState} />
      <button
        aria-label={`${label}：${campaign.title}`}
        className={danger ? "admin-button admin-button--danger" : undefined}
        disabled={pending}
        type="submit"
      >
        {pending ? "處理中…" : label}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

function ConsentStopForm({
  consent,
}: {
  readonly consent: AdminNewsletterConsentProjection;
}) {
  const [state, action, pending] = useActionState(
    unsubscribeNewsletterConsentAction,
    consentIdle,
  );
  const key = useAdminIdempotencyKey(state);
  if (consent.state === "unsubscribed") {
    return <small>已停止，不可由後台重新訂閱。</small>;
  }
  return (
    <form
      action={action}
      aria-busy={pending}
      className="admin-inline-form"
    >
      <input name="consentId" type="hidden" value={consent.id} />
      <input name="expectedVersion" type="hidden" value={consent.version} />
      <input
        name="idempotencyKey"
        type="hidden"
        value={`${key}:${consent.version}:unsubscribe`}
      />
      <button
        aria-label={`停止寄送：${consent.reference}`}
        className="admin-button admin-button--danger"
        disabled={pending}
        type="submit"
      >
        {pending ? "處理中…" : "停止寄送"}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}
