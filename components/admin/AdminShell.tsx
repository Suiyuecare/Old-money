"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { logoutAction } from "@/lib/admin/actions";
import { adminNavigation } from "@/lib/admin/navigation";
import type { AdminIdentity } from "@/lib/admin/types";

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

const mobileQuery = "(max-width: 820px)";

function subscribeMobile(callback: () => void): () => void {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function mobileSnapshot(): boolean {
  return window.matchMedia(mobileQuery).matches;
}

export function AdminShell({
  identity,
  children,
}: {
  readonly identity: AdminIdentity;
  readonly children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const mobile = useSyncExternalStore(subscribeMobile, mobileSnapshot, () => false);

  useEffect(() => {
    if (!open || !mobile) return;
    const panel = sidebar.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        window.requestAnimationFrame(() => menuButton.current?.focus());
        return;
      }
      if (event.key !== "Tab" || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [mobile, open]);

  return (
    <div className="admin-console">
      <header className="admin-mobile-header">
        <Link className="admin-wordmark" href="/admin" aria-label="LIGNÉE 後台首頁">
          LIGNÉE <span>Operations</span>
        </Link>
        <button
          className="admin-menu-button"
          type="button"
          aria-expanded={open}
          aria-controls="admin-sidebar"
          ref={menuButton}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? "關閉" : "選單"}
        </button>
      </header>

      <aside
        aria-hidden={mobile && !open ? true : undefined}
        aria-label="後台側欄"
        className="admin-sidebar"
        data-open={open || undefined}
        id="admin-sidebar"
        inert={mobile && !open ? true : undefined}
        ref={sidebar}
      >
        <div className="admin-sidebar__brand">
          <Link className="admin-wordmark" href="/admin">
            LIGNÉE <span>Estate Operations</span>
          </Link>
          <p>Made to Be Inherited.</p>
        </div>

        <nav className="admin-navigation" aria-label="後台主要導覽">
          {adminNavigation.map((group) => {
            const items = group.items.filter((item) => item.roles.includes(identity.role));
            if (!items.length) return null;
            return (
              <section key={group.label} aria-labelledby={`admin-nav-${group.label}`}>
                <h2 id={`admin-nav-${group.label}`}>{group.label}</h2>
                {items.map((item) => (
                  <Link
                    aria-current={isActive(pathname, item.href) ? "page" : undefined}
                    data-active={isActive(pathname, item.href) || undefined}
                    href={item.href}
                    key={item.href}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </section>
            );
          })}
        </nav>

        <div className="admin-sidebar__identity">
          <span className="admin-role">{identity.demo ? "Local Demo" : identity.role}</span>
          <strong>{identity.displayName}</strong>
          <small>{identity.email}</small>
          <form action={logoutAction}>
            <button type="submit">登出</button>
          </form>
        </div>
      </aside>

      {open ? (
        <button
          className="admin-backdrop"
          type="button"
          aria-label="關閉後台選單"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <main className="admin-content" id="admin-content" tabIndex={-1}>
        <div className="admin-env-bar" role="status">
          <span>{identity.demo ? "LOCAL DEMO DATA" : "PRODUCTION DISABLED"}</span>
          <span>Checkout 與 live providers 保持關閉</span>
        </div>
        {children}
      </main>
    </div>
  );
}
