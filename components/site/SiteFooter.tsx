import Link from "next/link";
import type { PublishedCategory } from "@/lib/catalog-runtime";
import { footerNavigationGroups, lettersFromTheEstate } from "@/lib/editorial";
import { BrandMark } from "./BrandMark";
import { NewsletterForm } from "./NewsletterForm";

export function SiteFooter({
  categories,
}: {
  readonly categories: readonly PublishedCategory[];
}) {
  const navigationGroups = footerNavigationGroups.map((group) =>
    group.title === "選購"
      ? {
          ...group,
          links: [
            { label: "全部商品", labelEn: "Shop All", href: "/shop" },
            { label: "男士", labelEn: "Men", href: "/men" },
            { label: "女士", labelEn: "Women", href: "/women" },
            ...categories
              .toSorted((left, right) => left.sortOrder - right.sortOrder)
              .map((category) => ({
                label: category.nameZh,
                labelEn: category.nameEn,
                href: `/category/${category.routeSegment}`,
              })),
          ],
        }
      : group,
  );

  return (
    <footer className="site-footer">
      <section className="newsletter shell" aria-labelledby="letters-title">
        <div>
          <span className="eyebrow">{lettersFromTheEstate.eyebrow}</span>
          <h2 id="letters-title">{lettersFromTheEstate.title}</h2>
          <p>{lettersFromTheEstate.description}</p>
        </div>
        <NewsletterForm />
      </section>

      <div className="site-footer__main shell">
        <div className="site-footer__brand">
          <BrandMark />
          <p>Made to Be Inherited.</p>
          <p className="site-footer__fine">當代英倫宅邸與私人草地球場生活，由 LIGNÉE 自有品牌呈現。</p>
        </div>
        {navigationGroups.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <h3>{group.title}</h3>
            {group.links.map((link) => (
              <Link key={link.href} href={link.href}>{link.label}</Link>
            ))}
          </nav>
        ))}
      </div>

      <div className="site-footer__bottom shell">
        <span>© 2026 LIGNÉE Concept.</span>
        <span>Prototype catalogue · Taiwan</span>
      </div>
    </footer>
  );
}
