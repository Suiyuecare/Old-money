import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/AdminShell";
import { getAdminAccess } from "@/lib/admin/auth";

export default async function AdminConsoleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const access = await getAdminAccess();
  if (!access.identity || access.status !== "authorized") {
    const destination: string = {
      authorized: "/admin",
      anonymous: "/admin/sign-in",
      "mfa-enrollment-required": "/admin/mfa/setup",
      "mfa-challenge-required": "/admin/mfa/challenge",
      "membership-required": "/admin/sign-in?reason=membership",
      unconfigured: "/admin/sign-in?reason=unconfigured",
    }[access.status] ?? "/admin/sign-in";
    redirect(destination);
  }
  return <AdminShell identity={access.identity}>{children}</AdminShell>;
}
