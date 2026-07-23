import Link from "next/link";
import { footerNavigationGroups, lettersFromTheEstate } from "@/lib/editorial";
import { BrandMark } from "./BrandMark";
import { NewsletterForm } from "./NewsletterForm";

export function SiteFooter() {
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
          <p className="site-footer__fine">一個受當代英倫鄉間生活啟發的虛構品牌世界。</p>
        </div>
        {footerNavigationGroups.map((group) => (
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
