import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import { getCommerceEnvironmentWithRuntimeControls } from "@/lib/commerce/runtime-environment";
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

export async function generateMetadata(): Promise<Metadata> {
  const environment =
    await getCommerceEnvironmentWithRuntimeControls();
  const indexingEnabled = environment.controls.searchIndexEnabled;

  return {
    metadataBase: new URL(environment.canonicalOrigin),
    title: {
      default: "LIGNÉE — Made to Be Inherited.",
      template: "%s — LIGNÉE",
    },
    description:
      "LIGNÉE 以 Alderwick House 與私人草地球場生活呈現 Estate 系列。",
    robots: indexingEnabled
      ? {
          index: true,
          follow: true,
          googleBot: { index: true, follow: true },
        }
      : {
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
      description: "當代英倫宅邸與私人草地球場生活。",
      images: [
        {
          url: "/og.png",
          width: 1200,
          height: 630,
          alt: "LIGNÉE — Made to Be Inherited.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "LIGNÉE — Made to Be Inherited.",
      description: "當代英倫宅邸與私人草地球場生活。",
      images: ["/og.png"],
    },
  };
}

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
      <body>{children}</body>
    </html>
  );
}
