import { redirect } from "next/navigation";

import {
  OwnerRecoveryForms,
  StaffInviteForm,
  StaffMemberships,
} from "@/components/admin/AdminStaffForms";
import { AdminPageHeader } from "@/components/admin/AdminUi";
import { getAdminPageIdentity } from "@/lib/admin/auth";
import {
  isProductionStaffInviteEnvironment,
  listAdminStaff,
} from "@/lib/admin/staff";

export const metadata = { title: "人員與角色" };

export default async function AdminStaffPage() {
  const identity = await getAdminPageIdentity(["owner"]);
  if (!identity) redirect("/admin");
  const staff = await listAdminStaff();
  const invitationEnabled = isProductionStaffInviteEnvironment();
  return (
    <div className="admin-main">
      <AdminPageHeader
        eyebrow="Access Control"
        title="人員與角色"
        description="管理 Owner、Merchandiser、Fulfillment 與 Support；所有帳號強制兩組 TOTP 與 AAL2。"
      />
      <section className="admin-workbench" aria-labelledby="invite-heading">
        <header className="admin-workbench__header">
          <div>
            <span className="admin-eyebrow">Production Invitation</span>
            <h2 id="invite-heading">邀請管理員</h2>
            <p>建立 Auth 邀請與 durable membership；任一步失敗都會撤銷邀請，不留下只有 Auth 的孤立帳號。</p>
          </div>
        </header>
        <StaffInviteForm enabled={invitationEnabled} />
      </section>
      <section className="admin-workbench" aria-labelledby="staff-heading">
        <header className="admin-workbench__header">
          <div>
            <span className="admin-eyebrow">Memberships</span>
            <h2 id="staff-heading">現有人員</h2>
          </div>
        </header>
        {staff.length
          ? <StaffMemberships currentUserId={identity.userId} memberships={staff} />
          : <p className="admin-workbench__empty">目前沒有可顯示的 membership。</p>}
      </section>
      <section className="admin-workbench" aria-labelledby="recovery-heading">
        <header className="admin-workbench__header">
          <div>
            <span className="admin-eyebrow">Dual-owner Recovery</span>
            <h2 id="recovery-heading">Owner 帳號復原</h2>
            <p>復原必須由另一位 Owner 核准，並撤銷原帳號所有 sessions。</p>
          </div>
        </header>
        <OwnerRecoveryForms />
      </section>
    </div>
  );
}
