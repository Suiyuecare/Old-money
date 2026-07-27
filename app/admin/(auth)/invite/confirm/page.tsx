import { AdminInviteConfirmation } from "@/components/admin/AdminInviteConfirmation";

export const metadata = { title: "接受後台邀請" };

export default async function AdminInviteConfirmationPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly token_hash?: string }>;
}) {
  const { token_hash: tokenHash = "" } = await searchParams;
  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";

  return (
    <div className="admin-auth-card">
      <span className="admin-eyebrow">Owner Invitation</span>
      <h1>建立管理員帳號</h1>
      <p>設定專用密碼後，下一步會註冊主要與備用兩組 TOTP 驗證器。</p>
      {supabaseUrl && publishableKey ? (
        <AdminInviteConfirmation
          publishableKey={publishableKey}
          supabaseUrl={supabaseUrl}
          tokenHash={tokenHash}
        />
      ) : (
        <p className="admin-feedback" data-status="error" role="alert">
          正式 Auth 尚未完成綁定，邀請暫時無法驗證。
        </p>
      )}
    </div>
  );
}
