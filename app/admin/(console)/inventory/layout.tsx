import { redirect } from "next/navigation";

import { requireAdminRole } from "@/lib/admin/auth";

export default async function AdminInventoryLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  try {
    await requireAdminRole(["owner", "fulfillment"]);
  } catch {
    redirect("/admin?denied=inventory");
  }
  return children;
}
