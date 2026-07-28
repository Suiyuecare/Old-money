import Link from "next/link";

import { SignInForm } from "@/components/admin/AdminForms";
import { isTrustedDemoEnvironment } from "@/lib/commerce/config";

export const metadata = { title: "管理員登入" };

export default async function AdminSignInPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly reason?: string; readonly returnPath?: string }>;
}) {
  const params = await searchParams;
  const demo = isTrustedDemoEnvironment();
  return (
    <div className="admin-auth-card">
      <span className="admin-eyebrow">Invite Only · AAL2</span>
      <h1>營運後台登入</h1>
      <p>僅限受邀的 LIGNÉE 團隊成員。登入後仍須以 TOTP 完成雙重驗證。</p>
      {demo ? (
        <div className="admin-empty">
          <span aria-hidden="true">◇</span>
          <h2>本機 Demo Owner 已啟用</h2>
          <p>開發環境使用隔離的展示資料，不會連線至正式資料庫。</p>
          <Link className="admin-button" href="/admin">進入 Demo 後台</Link>
        </div>
      ) : (
        <SignInForm
          returnPath={params.returnPath}
          unconfigured={params.reason === "unconfigured"}
        />
      )}
    </div>
  );
}
