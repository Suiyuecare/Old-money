import { redirect } from "next/navigation";

import { requireAdminRole } from "@/lib/admin/auth";

export default async function AdminProductsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  try {
    await requireAdminRole(["owner", "merchandiser"]);
  } catch {
    redirect("/admin?denied=products");
  }
  return children;
}
