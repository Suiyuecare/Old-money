import type { CategoryId } from "@/lib/catalog";
import { categoryHeroAssets } from "@/lib/visual-inventory";

import styles from "./catalog.module.css";

export function CategoryHero({
  category,
  alt,
}: {
  readonly category: CategoryId;
  readonly alt: string;
}) {
  const { desktop, mobile } = categoryHeroAssets[category];
  return (
    <picture className={styles.categoryHero}>
      <source
        media="(max-width: 700px)"
        type="image/avif"
        srcSet={mobile.variants.avif}
      />
      <source
        media="(max-width: 700px)"
        type="image/webp"
        srcSet={mobile.variants.webp}
      />
      <source type="image/avif" srcSet={desktop.variants.avif} />
      <source type="image/webp" srcSet={desktop.variants.webp} />
      <img
        src={desktop.variants.webp}
        alt={alt}
        width={desktop.width}
        height={desktop.height}
        loading="eager"
        fetchPriority="high"
      />
    </picture>
  );
}
