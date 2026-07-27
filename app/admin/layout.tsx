import type { Metadata } from "next";

import "@/components/admin/admin.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "營運後台 — LIGNÉE",
    template: "%s — LIGNÉE Operations",
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default function AdminRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="admin-root" data-surface="admin">
      <a className="admin-skip" href="#admin-content">跳至後台主要內容</a>
      {children}
    </div>
  );
}
