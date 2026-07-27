import Link from "next/link";

export default function AdminAuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="admin-auth">
      <aside className="admin-auth__brand" aria-label="LIGNÉE Operations">
        <Link className="admin-wordmark" href="/">
          LIGNÉE <span>Estate Operations</span>
        </Link>
        <blockquote>Made to Be Inherited.</blockquote>
        <small>Private administration · Verified identity required</small>
      </aside>
      <main className="admin-auth__content" id="admin-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
