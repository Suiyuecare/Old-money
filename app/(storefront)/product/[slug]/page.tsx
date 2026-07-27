import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { ProductDetailClient } from "@/components/products/ProductDetailClient";
import { SafeJsonLd } from "@/components/seo/SafeJsonLd";
import { getCatalogSnapshot } from "@/lib/commerce/container";
import { getCommerceEnvironmentWithRuntimeControls } from "@/lib/commerce/runtime-environment";
import {
  createCatalogSnapshotIndex,
  createPublishedProductJsonLd,
} from "@/lib/catalog-runtime";

interface ProductPageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const catalog = createCatalogSnapshotIndex(await getCatalogSnapshot());
  const product = catalog.getProductBySlug(slug);

  if (!product) {
    return {
      title: "找不到商品",
      description: "這件 LIGNÉE 概念商品目前不存在。",
    };
  }

  const socialDescription = `${product.description} LIGNÉE 概念展示，不提供真實交易。`;
  const environment =
    await getCommerceEnvironmentWithRuntimeControls();
  const indexingEnabled = environment.controls.searchIndexEnabled;

  return {
    title: product.name,
    description: `${product.subtitle}。${product.description} LIGNÉE 概念展示，不提供真實交易。`,
    openGraph: {
      type: "website",
      locale: "zh_TW",
      siteName: "LIGNÉE",
      title: `${product.name} — LIGNÉE`,
      description: socialDescription,
      images: [{ url: product.image.path, alt: product.image.alt }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.name} — LIGNÉE`,
      description: socialDescription,
      images: [product.image.path],
    },
    alternates: {
      canonical: `https://estatelignee.com/product/${product.slug}`,
    },
    robots: {
      index: indexingEnabled,
      follow: indexingEnabled,
      nocache: !indexingEnabled,
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const snapshot = await getCatalogSnapshot();
  const catalog = createCatalogSnapshotIndex(snapshot);
  const product = catalog.getProductBySlug(slug);

  if (!product) notFound();
  const nonce = (await headers()).get("x-nonce") ?? "";
  const allowStructuredOffer = (
    await getCommerceEnvironmentWithRuntimeControls()
  ).controls.searchIndexEnabled;

  return (
    <>
      {allowStructuredOffer ? (
        <SafeJsonLd
          nonce={nonce}
          value={createPublishedProductJsonLd(product, catalog)}
        />
      ) : null}
      <ProductDetailClient
        key={product.id}
        media={catalog.getMediaForProduct(product.id)}
        product={product}
        relatedProducts={catalog.getRelatedProducts(product.id)}
      />
    </>
  );
}
