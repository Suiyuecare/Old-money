import { PrototypeBanner } from "@/components/site/PrototypeBanner";
import { RouteFocusManager } from "@/components/site/RouteFocusManager";
import { ServiceHeader } from "@/components/site/ServiceHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import "@/components/site/site.css";

export default function ServiceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div data-surface="storefront">
      <a className="skip-link" href="#main-content">
        跳至主要內容
      </a>
      <PrototypeBanner />
      <ServiceHeader />
      <RouteFocusManager />
      <main id="main-content">{children}</main>
      <SiteFooter categories={[]} />
    </div>
  );
}
