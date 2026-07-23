import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductDetailClient } from "@/components/products/ProductDetailClient";
import {
  getProductBySlug,
  getRelatedProducts,
  products,
} from "@/lib/catalog";

interface ProductPageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return products.map((product) => ({ slug: product.slug }));
}

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
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = getProductBySlug(slug);

  if (!product) notFound();

  return (
    <ProductDetailClient
      key={product.id}
      product={product}
      relatedProducts={getRelatedProducts(product.id)}
    />
  );
}
