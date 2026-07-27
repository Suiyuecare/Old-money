"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BrandMark } from "./BrandMark";

const navigation = [
  { label: "首頁", labelEn: "Home", href: "/" },
  { label: "男士", labelEn: "Men", href: "/men" },
  { label: "女士", labelEn: "Women", href: "/women" },
  { label: "全部商品", labelEn: "Shop", href: "/shop" },
  { label: "莊園篇章", labelEn: "Collections", href: "/collections" },
  { label: "Estate Journal", labelEn: "Journal", href: "/journal" },
] as const;

/**
 * A catalog-independent header for legal and post-purchase routes. These
 * pages must remain reachable while the public catalog correctly fails closed.
 */
export function ServiceHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <button
          aria-controls="service-mobile-navigation"
          aria-expanded={open}
          className="menu-button"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <span aria-hidden="true" className="menu-button__lines" />
          <span className="sr-only">{open ? "關閉選單" : "開啟選單"}</span>
        </button>

        <BrandMark compact />

        <nav aria-label="主要導覽" className="desktop-nav">
          {navigation.map((item) => (
            <Link href={item.href} key={item.href}>{item.label}</Link>
          ))}
        </nav>

        <nav aria-label="服務工具" className="utility-nav">
          <Link href="/orders">訂單查詢</Link>
          <Link href="/shipping-returns">客戶服務</Link>
        </nav>
      </div>

      <div
        className="mobile-nav"
        data-open={open || undefined}
        id="service-mobile-navigation"
      >
        <nav aria-label="行動版主要導覽">
          {navigation.map((item) => (
            <Link
              href={item.href}
              key={item.href}
              onClick={() => setOpen(false)}
            >
              <span>{item.label}</span>
              <span>{item.labelEn}</span>
            </Link>
          ))}
        </nav>
        <div className="mobile-nav__utility">
          <Link href="/orders" onClick={() => setOpen(false)}>訂單查詢</Link>
          <Link href="/shipping-returns" onClick={() => setOpen(false)}>
            客戶服務
          </Link>
        </div>
      </div>
    </header>
  );
}
