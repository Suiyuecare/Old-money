import { notFound } from "next/navigation";

import { AdminEmpty, AdminPageHeader, OperationalTable } from "@/components/admin/AdminUi";
import { getAdminAccess } from "@/lib/admin/auth";
import { adminNavigation, adminScreenCopy } from "@/lib/admin/navigation";
import { getAdminRepository } from "@/lib/admin/repository";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly section: string }>;
}) {
  const copy = adminScreenCopy[(await params).section];
  return { title: copy?.title ?? "後台" };
}

export default async function AdminOperationalPage({
  params,
}: {
  readonly params: Promise<{ readonly section: string }>;
}) {
  const { section } = await params;
  const copy = adminScreenCopy[section];
  if (!copy) notFound();
  const access = await getAdminAccess();
  const navItem = adminNavigation
    .flatMap((group) => group.items)
    .find((item) => item.href === `/admin/${section}`);
  if (!access.identity || !navItem?.roles.includes(access.identity.role)) notFound();
  const rows = await getAdminRepository().listOperationalRows(section);
  return (
    <div className="admin-main">
      <AdminPageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />
      {rows.length ? (
        <OperationalTable rows={rows} />
      ) : (
        <AdminEmpty title={copy.empty} description="當 durable RPC 產生資料後，會安全地顯示在這裡。" />
      )}
    </div>
  );
}
