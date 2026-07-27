import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";

import { MfaChallengeForm } from "@/components/admin/AdminForms";
import { getAdminAuthClient, safeAdminReturnPath } from "@/lib/admin/auth";
import { getCommerceEnvironment } from "@/lib/commerce/config";

export const metadata = { title: "管理員雙重驗證" };

export default async function AdminMfaChallengePage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly returnPath?: string }>;
}) {
  const params = await searchParams;
  const returnPath = safeAdminReturnPath(params.returnPath ?? null);
  if (getCommerceEnvironment().mode === "demo" && process.env.NODE_ENV !== "production") {
    redirect(returnPath);
  }

  let factors: readonly { readonly id: string; readonly label: string }[] = [];
  try {
    const client = await getAdminAuthClient();
    const { data: userData } = await client.auth.getUser();
    if (!userData.user) redirect("/admin/sign-in");
    const { data } = await client.auth.mfa.listFactors();
    const verified = data?.totp.filter((factor) => factor.status === "verified") ?? [];
    if (verified.length < 2) redirect(`/admin/mfa/setup?returnPath=${encodeURIComponent(returnPath)}`);
    factors = verified.map((factor, index) => ({
      id: factor.id,
      label: factor.friendly_name || (index === 0 ? "主要驗證器" : `備用驗證器 ${index}`),
    }));
  } catch (error) {
    unstable_rethrow(error);
    redirect("/admin/sign-in?reason=unconfigured");
  }

  return (
    <div className="admin-auth-card">
      <span className="admin-eyebrow">Authenticator Assurance Level 2</span>
      <h1>完成雙重驗證</h1>
      <p>輸入主要或備用驗證器目前顯示的 6 位數代碼。</p>
      <MfaChallengeForm factors={factors} returnPath={returnPath} />
      <p className="admin-form-help">
        兩組驗證器都無法使用？
        {" "}<Link href="/admin/recovery">前往 Owner 安全復原</Link>
      </p>
    </div>
  );
}
