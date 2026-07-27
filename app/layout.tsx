import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import { StoreProvider } from "@/components/store/StoreProvider";
import { CartDrawer } from "@/components/store/CartDrawer";
import { PrototypeBanner } from "@/components/site/PrototypeBanner";
import { RouteFocusManager } from "@/components/site/RouteFocusManager";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import "@/components/site/site.css";
import "./globals.css";

const ming = localFont({
  src: "./fonts/lignee-ming-subset.woff2",
  variable: "--font-ming",
  display: "swap",
  weight: "200 900",
  style: "normal",
  preload: true,
  adjustFontFallback: false,
  fallback: ["Songti TC", "PMingLiU", "MingLiU", "serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://estatelignee.com"),
  title: {
    default: "LIGNÉE — Made to Be Inherited.",
    template: "%s — LIGNÉE",
  },
  description:
    "LIGNÉE 以 Alderwick House 與私人草地球場生活呈現 50 件 Estate No. 01 首發系列。Sandbox 展示，不提供真實交易。",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    type: "website",
    locale: "zh_TW",
    siteName: "LIGNÉE",
    title: "LIGNÉE — Made to Be Inherited.",
    description: "當代英倫宅邸與私人草地球場生活；Sandbox 不提供真實交易。",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "LIGNÉE — Made to Be Inherited. Sandbox",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LIGNÉE — Made to Be Inherited.",
    description: "當代英倫宅邸與私人草地球場生活；Sandbox 不提供真實交易。",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  themeColor: "#f1eee6",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Force per-request rendering so Next can attach proxy.ts's nonce to its
  // framework scripts. No request value is retained or exposed to the page.
  await headers();

  return (
    <html
      lang="zh-Hant"
      className={ming.variable}
      data-scroll-behavior="smooth"
    >
      <body>
        <StoreProvider>
          <a className="skip-link" href="#main-content">
            跳至主要內容
          </a>
          <PrototypeBanner />
          <SiteHeader />
          <CartDrawer />
          <RouteFocusManager />
          <main id="main-content">{children}</main>
          <SiteFooter />
        </StoreProvider>
      </body>
    </html>
  );
}
