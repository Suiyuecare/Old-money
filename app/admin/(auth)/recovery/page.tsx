import { redirect, unstable_rethrow } from "next/navigation";

import { OwnerSelfRecoveryRequestForm } from "@/components/admin/AdminOwnerRecoveryForms";
import { getAdminAuthClient } from "@/lib/admin/auth";
import {
  getAdminOwnerRecoveryContext,
  type AdminOwnerRecoveryContext,
} from "@/lib/admin/staff";
import { isTrustedDemoEnvironment } from "@/lib/commerce/config";

export const metadata = { title: "Owner 安全復原" };

export default async function AdminOwnerRecoveryPage() {
  let context: AdminOwnerRecoveryContext;
  const demo = isTrustedDemoEnvironment();
  try {
    if (!demo) {
      const client = await getAdminAuthClient();
      const {
        data: { user },
        error,
      } = await client.auth.getUser();
      if (error || !user) {
        redirect("/admin/sign-in?returnPath=/admin/recovery");
      }
    }
    context = await getAdminOwnerRecoveryContext();
  } catch (error) {
    unstable_rethrow(error);
    redirect("/admin/sign-in?reason=recovery&returnPath=/admin/recovery");
  }

  return (
    <div className="admin-auth-card">
      <span className="admin-eyebrow">Identity-bound · AAL1 accepted</span>
      <h1>Owner 安全復原</h1>
      <p>
        若主要與備用 TOTP 都無法使用，請先以 Email 與密碼建立有效 session，
        再由此頁替本人提出一次性申請。
      </p>
      <OwnerSelfRecoveryRequestForm context={context} />
    </div>
  );
}
