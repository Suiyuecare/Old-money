import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { ProductDetailClient } from "@/components/products/ProductDetailClient";
import { SafeJsonLd } from "@/components/seo/SafeJsonLd";
import { getCommerceEnvironment } from "@/lib/commerce/config";
import {
  getProductBySlug,
  getRelatedProducts,
} from "@/lib/catalog";

interface ProductPageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductBySlug(slug);

  if (!product) {
    return {
      title: "找不到商品",
      description: "這件 LIGNÉE 概念商品目前不存在。",
    };
  }

  const socialDescription = `${product.description} LIGNÉE 概念展示，不提供真實交易。`;

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
    robots: { index: false, follow: false },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = getProductBySlug(slug);

  if (!product) notFound();
  const nonce = (await headers()).get("x-nonce") ?? "";
  const allowStructuredOffer = getCommerceEnvironment().controls.searchIndexEnabled;

  return (
    <>
      {allowStructuredOffer ? (
        <SafeJsonLd nonce={nonce} value={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.name,
          description: product.description,
          image: [`https://estatelignee.com${product.image.path}`],
          sku: product.productCode,
          brand: { "@type": "Brand", name: "LIGNÉE" },
          offers: {
            "@type": "Offer",
            priceCurrency: "TWD",
            price: product.basePriceTwd,
            availability: "https://schema.org/InStock",
            url: `https://estatelignee.com/product/${product.slug}`,
          },
        }} />
      ) : null}
      <ProductDetailClient
        key={product.id}
        product={product}
        relatedProducts={getRelatedProducts(product.id)}
      />
    </>
  );
}
