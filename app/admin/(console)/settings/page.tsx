import { redirect } from "next/navigation";

import { AdminLaunchAttestationForms } from "@/components/admin/AdminLaunchAttestationForms";
import { AdminRuntimeControlsForm } from "@/components/admin/AdminRuntimeControlsForm";
import { AdminEmpty, AdminPageHeader } from "@/components/admin/AdminUi";
import { getAdminPageIdentity } from "@/lib/admin/auth";
import {
  getAdminGovernanceAdapter,
  type AdminRuntimeControls,
} from "@/lib/admin/governance";
import { getCommerceEnvironment } from "@/lib/commerce/config";

export const metadata = { title: "Runtime Controls" };

export default async function AdminSettingsPage() {
  const identity = await getAdminPageIdentity(["owner"]);
  if (!identity) redirect("/admin");
  const environment = getCommerceEnvironment();
  let controls: AdminRuntimeControls | null = null;
  try {
    controls = await getAdminGovernanceAdapter().readRuntimeControls();
  } catch {
    // A missing or malformed RPC is rendered as an explicit fail-closed state.
  }
  const catalogFactsApproved = Boolean(
    environment.mode === "demo"
    || (
      environment.expectedCatalogApprovalRevision
      && controls?.catalogApprovalRevision
        === environment.expectedCatalogApprovalRevision
    ),
  );
  const legalFactsApproved = Boolean(
    environment.mode === "demo"
    || (
      environment.expectedLegalApprovalRevision
      && controls?.legalApprovalRevision
        === environment.expectedLegalApprovalRevision
    ),
  );
  const productionCanaryCompleted = Boolean(
    environment.mode === "demo"
    || (
      environment.expectedCanaryEvidenceSha256
      && controls?.canaryEvidenceSha256
        === environment.expectedCanaryEvidenceSha256
    ),
  );
  return (
    <div className="admin-main">
      <AdminPageHeader
        description="管理交易、索引與緊急快取開關；資料庫設定永遠不能越過 deployment 的安全硬上限。"
        eyebrow="Fail Closed"
        title="Runtime Controls"
      />
      {controls ? (
        <>
          <AdminRuntimeControlsForm
            commerceCapable={environment.commerceCapable}
            controls={controls}
            deploymentMode={environment.mode}
            key={`runtime-controls-${controls.version}`}
            launchGates={{
              providerCredentialsConfigured: environment.providerCredentialsConfigured,
              databaseConfigured: environment.databaseConfigured,
              operationalFactsConfigured: environment.operationalFactsConfigured,
              workerAuthorizationConfigured: environment.workerAuthorizationConfigured,
              incidentChannelConfigured: environment.incidentChannelConfigured,
              deadmanConfigured: environment.deadmanConfigured,
              catalogFactsApproved,
              legalFactsApproved,
              productionCanaryCompleted,
            }}
          />
          <AdminLaunchAttestationForms
            controls={controls}
            key={`launch-attestations-${controls.version}`}
          />
        </>
      ) : (
        <>
        <div className="admin-runtime-warning" role="alert">
          Runtime Controls RPC 尚未就緒或目前無法驗證回傳契約。所有收款、Apple Pay、
          canary 與索引能力均維持 fail closed；不會改用環境變數猜測開關狀態。
        </div>
        <AdminEmpty
          description="完成新 LIGNÉE Supabase migration 並確認 Owner AAL2 後，版本化設定會顯示在此。"
          title="Runtime Controls 無法安全讀取"
        />
        </>
      )}
    </div>
  );
}
