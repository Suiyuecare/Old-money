import { redirect } from "next/navigation";

import { AdminAppointmentsWorkspace } from "@/components/admin/AdminAppointmentsWorkspace";
import {
  AdminEmpty,
  AdminPageHeader,
} from "@/components/admin/AdminUi";
import { getAdminPageIdentity } from "@/lib/admin/auth";
import {
  getAdminEngagementAdapter,
  type AdminEngagementPage,
  type AdminAppointmentProjection,
} from "@/lib/admin/engagement";

export const metadata = { title: "私人預約" };

export default async function AdminAppointmentsPage() {
  const identity = await getAdminPageIdentity(["owner", "support"]);
  if (!identity) redirect("/admin");

  let page: AdminEngagementPage<AdminAppointmentProjection> | null = null;
  let unavailableMessage: string | null = null;
  try {
    page = await getAdminEngagementAdapter().listAppointments({
      limit: 100,
      offset: 0,
    });
  } catch (error) {
    unavailableMessage = error instanceof Error
      ? error.message
      : "預約 durable RPC 目前無法使用。";
  }

  return (
    <div className="admin-main">
      <AdminPageHeader
        description="管理私人鑑賞、量身與到店時段；列表不解密或顯示客戶聯絡資料。"
        eyebrow="Private Appointments"
        title="私人預約"
      />
      {page ? (
        <AdminAppointmentsWorkspace page={page} />
      ) : (
        <AdminEmpty
          description={`${unavailableMessage} 操作已保持 fail-closed。`}
          title="預約資料目前無法讀取"
        />
      )}
    </div>
  );
}
