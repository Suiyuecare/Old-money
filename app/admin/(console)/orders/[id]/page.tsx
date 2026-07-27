import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { OperationsProjectionSummary } from "@/components/admin/AdminOperationsWorkspace";
import { AdminPageHeader } from "@/components/admin/AdminUi";
import { getAdminPageIdentity } from "@/lib/admin/auth";
import { getRequestOperationsRepository } from "@/lib/operations/container";

const aggregateIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

export const metadata = { title: "訂單明細" };
export const dynamic = "force-dynamic";

export default async function AdminOrderDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const identity = await getAdminPageIdentity([
    "owner",
    "fulfillment",
    "support",
  ]);
  if (!identity) redirect("/admin");

  const parsedId = aggregateIdSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();

  const projection = await (
    await getRequestOperationsRepository()
  ).findProjection(parsedId.data);
  if (!projection) notFound();

  return (
    <div className="admin-main">
      <AdminPageHeader
        eyebrow="Guest Order"
        title={`訂單 ${projection.publicId}`}
        description="顯示目前持久化營運投影；各項命令仍須在對應工作區重新驗證角色、版本與 AAL2。"
        action={{ href: "/admin/orders", label: "返回訂單" }}
      />
      <OperationsProjectionSummary projection={projection} />
      <nav aria-label="訂單作業捷徑" className="admin-panel">
        <h2>前往作業工作區</h2>
        <div className="admin-actions">
          {identity.role === "owner" || identity.role === "fulfillment" ? (
            <>
              <Link className="admin-button" href="/admin/fulfillment">揀貨與包裹</Link>
              <Link className="admin-button" href="/admin/returns">退貨驗收</Link>
            </>
          ) : null}
          {identity.role === "owner" || identity.role === "support" ? (
            <>
              <Link className="admin-button" href="/admin/support">客服案件</Link>
              <Link className="admin-button" href="/admin/refunds">退款作業</Link>
            </>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
