import { redirect } from "next/navigation";

import { AdminNewsletterWorkspace } from "@/components/admin/AdminNewsletterWorkspace";
import { AdminPageHeader } from "@/components/admin/AdminUi";
import { getAdminPageIdentity } from "@/lib/admin/auth";
import {
  createRoleScopedNewsletterReadAdapter,
  getAdminEngagementAdapter,
  type AdminEngagementPage,
  type AdminNewsletterCampaignDraft,
  type AdminNewsletterConsentProjection,
} from "@/lib/admin/engagement";

export const metadata = { title: "Estate Letters" };

function loadError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function loadPage<T>(
  loader: () => Promise<T>,
  fallback: string,
): Promise<{ readonly page: T | null; readonly error: string | null }> {
  try {
    return { page: await loader(), error: null };
  } catch (error) {
    return { page: null, error: loadError(error, fallback) };
  }
}

export default async function AdminNewsletterPage() {
  const identity = await getAdminPageIdentity([
    "owner",
    "merchandiser",
    "support",
  ]);
  if (!identity) redirect("/admin");

  const reads = createRoleScopedNewsletterReadAdapter(
    identity.role,
    getAdminEngagementAdapter,
  );
  const listCampaigns = reads.listCampaigns;
  const listConsents = reads.listConsents;
  const [campaignResult, consentResult] = await Promise.all([
    listCampaigns
      ? loadPage(
          () => listCampaigns({ limit: 100, offset: 0 }),
          "電子報草稿 durable RPC 目前無法使用。",
        )
      : Promise.resolve(undefined),
    listConsents
      ? loadPage(
          () => listConsents({ limit: 100, offset: 0 }),
          "Consent durable RPC 目前無法使用。",
        )
      : Promise.resolve(undefined),
  ]);
  const campaigns:
    | AdminEngagementPage<AdminNewsletterCampaignDraft>
    | null
    | undefined = campaignResult?.page;
  const consents:
    | AdminEngagementPage<AdminNewsletterConsentProjection>
    | null
    | undefined = consentResult?.page;
  const campaignsError = campaignResult?.error ?? null;
  const consentsError = consentResult?.error ?? null;

  const description = identity.role === "owner"
    ? "管理 consent ledger 與 Estate Letters 草稿；正式寄送與排程仍安全關閉。"
    : identity.role === "support"
      ? "處理訂閱停止寄送；不顯示 Email、token 或內容草稿。"
      : "建立與送審 Estate Letters 草稿；不存取訂閱者資料。";

  return (
    <div className="admin-main">
      <AdminPageHeader
        description={description}
        eyebrow="Estate Letters"
        title="電子報"
      />
      <AdminNewsletterWorkspace
        campaigns={campaigns}
        campaignsError={campaignsError}
        canArchive={identity.role === "owner"}
        consents={consents}
        consentsError={consentsError}
      />
    </div>
  );
}
