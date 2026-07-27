import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";

import { MfaEnrollmentForm } from "@/components/admin/AdminForms";
import { getAdminAuthClient, safeAdminReturnPath } from "@/lib/admin/auth";
import { getCommerceEnvironment } from "@/lib/commerce/config";

export const metadata = { title: "設定雙重驗證" };

export default async function AdminMfaSetupPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly returnPath?: string }>;
}) {
  const params = await searchParams;
  const returnPath = safeAdminReturnPath(params.returnPath ?? null);
  const demo = getCommerceEnvironment().mode === "demo" && process.env.NODE_ENV !== "production";
  if (demo) {
    return (
      <div className="admin-auth-card">
        <span className="admin-eyebrow">Local Demo</span>
        <h1>MFA 模擬完成</h1>
        <p>本機展示環境不建立真實登入憑證；Preview 與 Production 仍會強制 AAL2。</p>
        <Link className="admin-button" href={returnPath}>返回後台</Link>
      </div>
    );
  }

  let verifiedCount = 0;
  try {
    const client = await getAdminAuthClient();
    const { data: userData } = await client.auth.getUser();
    if (!userData.user) redirect("/admin/sign-in");
    const { data } = await client.auth.mfa.listFactors();
    verifiedCount = data?.totp.filter((factor) => factor.status === "verified").length ?? 0;
    if (verifiedCount >= 2) {
      const { data: assurance } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance?.currentLevel === "aal2") redirect(returnPath);
      redirect(`/admin/mfa/challenge?returnPath=${encodeURIComponent(returnPath)}`);
    }
  } catch (error) {
    unstable_rethrow(error);
    redirect("/admin/sign-in?reason=unconfigured");
  }

  return (
    <div className="admin-auth-card">
      <span className="admin-eyebrow">Step {verifiedCount + 1} of 2</span>
      <h1>{verifiedCount === 0 ? "設定主要驗證器" : "設定備用驗證器"}</h1>
      <p>
        後台要求兩組獨立 TOTP。備用驗證器可在主要裝置遺失時安全復原帳號。
      </p>
      <MfaEnrollmentForm label={verifiedCount === 0 ? "primary" : "backup"} />
    </div>
  );
}
