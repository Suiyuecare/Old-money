"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useStore } from "@/components/store/StoreProvider";
import { primaryNavigation } from "@/lib/editorial";
import { BrandMark } from "./BrandMark";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { cartItemCount, hydrated, openCartDrawer, wishlistCount } = useStore();
  const cartCount = hydrated ? String(cartItemCount) : "–";
  const savedCount = hydrated ? String(wishlistCount) : "–";

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
          className="menu-button"
          type="button"
          aria-expanded={open}
          aria-controls="mobile-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          <span aria-hidden="true" className="menu-button__lines" />
          <span className="sr-only">{open ? "關閉選單" : "開啟選單"}</span>
        </button>

        <BrandMark compact />

        <nav className="desktop-nav" aria-label="主要導覽">
          {primaryNavigation.slice(0, 6).map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <nav className="utility-nav" aria-label="購物工具">
          <Link href="/search">搜尋</Link>
          <Link href="/wishlist">
            收藏 <span>({savedCount})</span>
            <span className="sr-only">，收藏清單，共 {hydrated ? `${wishlistCount} 件` : "載入中"}</span>
          </Link>
          <button
            type="button"
            onClick={openCartDrawer}
          >
            <span className="utility-nav__bag-long">購物袋</span>
            <span className="utility-nav__bag-short">Bag</span>{" "}
            <span>({cartCount})</span>
            <span className="sr-only">，開啟購物袋，共 {hydrated ? `${cartItemCount} 件` : "載入中"}</span>
          </button>
        </nav>
      </div>

      <div id="mobile-navigation" className="mobile-nav" data-open={open || undefined}>
        <nav aria-label="行動版主要導覽">
          {primaryNavigation.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
              <span>{item.label}</span>
              <span>{"labelEn" in item ? item.labelEn : "Journal"}</span>
            </Link>
          ))}
        </nav>
        <div className="mobile-nav__utility">
          <Link href="/search" onClick={() => setOpen(false)}>搜尋</Link>
          <Link href="/wishlist" onClick={() => setOpen(false)}>收藏清單 ({savedCount})</Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              openCartDrawer();
            }}
          >
            購物袋 ({cartCount})
          </button>
        </div>
      </div>
    </header>
  );
}
