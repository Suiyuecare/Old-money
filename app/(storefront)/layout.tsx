import { PrototypeBanner } from "@/components/site/PrototypeBanner";
import { RouteFocusManager } from "@/components/site/RouteFocusManager";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import "@/components/site/site.css";
import { CartDrawer } from "@/components/store/CartDrawer";
import { StoreProvider } from "@/components/store/StoreProvider";
import { getCatalogSnapshot } from "@/lib/commerce/container";

export default async function StorefrontLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const catalogSnapshot = await getCatalogSnapshot();
  return (
    <div data-surface="storefront">
      <StoreProvider catalogSnapshot={catalogSnapshot}>
        <a className="skip-link" href="#main-content">
          跳至主要內容
        </a>
        <PrototypeBanner />
        <SiteHeader />
        <CartDrawer />
        <RouteFocusManager />
        <main id="main-content">{children}</main>
        <SiteFooter categories={catalogSnapshot.categories} />
      </StoreProvider>
    </div>
  );
}
