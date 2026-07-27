import { OwnerRecoveryPasswordResetForm } from "@/components/admin/AdminOwnerRecoveryForms";

export const metadata = { title: "完成 Owner 復原" };

export default function AdminOwnerRecoveryConfirmationPage() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  return (
    <div className="admin-auth-card">
      <span className="admin-eyebrow">Single-use recovery</span>
      <h1>建立新密碼</h1>
      <p>
        復原 session 只在瀏覽器記憶體中使用；驗證片段會立即從網址列移除，
        不會寫入 Server Action、稽核紀錄或工作結果。
      </p>
      {supabaseUrl && publishableKey ? (
        <OwnerRecoveryPasswordResetForm
          publishableKey={publishableKey}
          supabaseUrl={supabaseUrl}
        />
      ) : (
        <p className="admin-feedback" data-status="error" role="alert">
          Auth recovery binding 尚未設定；請聯絡另一位 Owner。
        </p>
      )}
    </div>
  );
}
