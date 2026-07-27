import { redirect } from "next/navigation";

import { getAdminPageIdentity } from "@/lib/admin/auth";
import type { OperationsWorkspaceArea } from "@/lib/admin/operations-ui";
import { getAdminRepository } from "@/lib/admin/repository";
import type { AdminRole } from "@/lib/admin/types";
import type { OperationsQueueKind } from "@/lib/operations/contracts";

import { AdminOperationsQueue } from "./AdminOperationsQueue";
import { AdminOperationsWorkspace } from "./AdminOperationsWorkspace";
import { AdminSupportAttachmentUploader } from "./AdminSupportAttachmentUploader";
import { AdminPageHeader } from "./AdminUi";

interface QueueDefinition {
  readonly kind: OperationsQueueKind;
  readonly title: string;
  readonly description: string;
  readonly roles: readonly AdminRole[];
}

export async function AdminOperationsPage({
  area,
  roles,
  eyebrow,
  title,
  description,
  queue,
}: {
  readonly area: OperationsWorkspaceArea;
  readonly roles: readonly AdminRole[];
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly queue?: QueueDefinition;
}) {
  const identity = await getAdminPageIdentity(roles);
  if (!identity) redirect("/admin");
  const orders = await getAdminRepository().listOrders();
  return (
    <div className="admin-main">
      <AdminPageHeader eyebrow={eyebrow} title={title} description={description} />
      <AdminOperationsWorkspace
        area={area}
        orders={orders}
        role={identity.role}
      />
      {area === "support" ? <AdminSupportAttachmentUploader /> : null}
      {queue && queue.roles.includes(identity.role) ? (
        <AdminOperationsQueue
          description={queue.description}
          kind={queue.kind}
          title={queue.title}
        />
      ) : null}
    </div>
  );
}

export async function AdminQueuePage({
  roles,
  eyebrow,
  title,
  description,
  queueKind,
  queueTitle,
  queueDescription,
}: {
  readonly roles: readonly AdminRole[];
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly queueKind: OperationsQueueKind;
  readonly queueTitle: string;
  readonly queueDescription: string;
}) {
  if (!await getAdminPageIdentity(roles)) redirect("/admin");
  return (
    <div className="admin-main">
      <AdminPageHeader eyebrow={eyebrow} title={title} description={description} />
      <AdminOperationsQueue
        description={queueDescription}
        kind={queueKind}
        title={queueTitle}
      />
    </div>
  );
}
