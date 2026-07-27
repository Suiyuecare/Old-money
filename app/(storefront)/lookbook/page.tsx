import type { Metadata } from "next";
import Image from "next/image";

import { lookbookAssets } from "@/lib/visual-inventory";

import styles from "./lookbook.module.css";

export const metadata: Metadata = {
  title: "Estate Lookbook",
  description: "瀏覽 LIGNÉE Estate No. 01 的 36 幅 Sandbox 莊園與草地球場編輯影像。",
};

const estateAssets = lookbookAssets.filter(
  (asset) => asset.role === "estate-lifestyle",
);
const tennisAssets = lookbookAssets.filter(
  (asset) => asset.role === "tennis-lifestyle",
);

function LookbookSection({
  headingId,
  title,
  titleZh,
  assets,
}: {
  readonly headingId: string;
  readonly title: string;
  readonly titleZh: string;
  readonly assets: typeof lookbookAssets;
}) {
  return (
    <section className="shell section" aria-labelledby={headingId}>
      <header className={styles.sectionHeading}>
        <span className="eyebrow">{title}</span>
        <h2 id={headingId}>{titleZh}</h2>
        <p>{assets.length} 幅內部 Sandbox 編輯衍生影像</p>
      </header>
      <div className={styles.grid}>
        {assets.map((asset, index) => (
          <figure className={styles.frame} key={asset.id}>
            <Image
              src={asset.variants.webp}
              alt={asset.alt}
              fill
              sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 34vw"
              priority={index < 2}
            />
            <figcaption>
              <span>{String(index + 1).padStart(2, "0")}</span>
              Sandbox review · final photography pending
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export default function LookbookPage() {
  return (
    <>
      <header className={styles.hero}>
        <span className="eyebrow">Estate No. 01 · Visual study</span>
        <h1>Estate Lookbook</h1>
        <p>
          36 幅影像呈現宅邸與草地球場的視覺方向；皆為內部 Sandbox 衍生素材，不代表最終攝影、人物授權或實體商品相符。
        </p>
      </header>
      <LookbookSection
        headingId="lookbook-estate"
        title="The Estate"
        titleZh="宅邸日常"
        assets={estateAssets}
      />
      <LookbookSection
        headingId="lookbook-private-court"
        title="The Private Court"
        titleZh="草地球場"
        assets={tennisAssets}
      />
    </>
  );
}
