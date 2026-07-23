import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond } from "next/font/google";
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

const cormorant = Cormorant_Garamond({
  variable: "--font-display-latin",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});

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

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ? process.env.NEXT_PUBLIC_SITE_URL
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "LIGNÉE — Made to Be Inherited.",
    template: "%s — LIGNÉE",
  },
  description:
    "LIGNÉE 以當代英倫莊園生活為靈感，呈現值得長久相伴的衣著與日常物件。概念展示，不提供真實交易。",
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
    description: "當代英倫莊園生活風格概念展示；不提供真實交易。",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "LIGNÉE — Made to Be Inherited. 概念展示",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LIGNÉE — Made to Be Inherited.",
    description: "當代英倫莊園生活風格概念展示；不提供真實交易。",
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
      className={`${cormorant.variable} ${ming.variable}`}
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
