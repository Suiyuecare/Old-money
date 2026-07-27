import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CatalogPage } from "@/components/catalog/CatalogPage";
import { createCatalogSnapshotIndex } from "@/lib/catalog-runtime";
import { getCatalogSnapshot } from "@/lib/commerce/container";

interface CategoryPageProps {
  readonly params: Promise<{ slug: string }>;
}

async function resolveCategory(slug: string) {
  const snapshot = await getCatalogSnapshot();
  const category = snapshot.categories.find(
    (candidate) =>
      candidate.routeSegment === slug || candidate.code === slug,
  );
  return category ? { category, snapshot } : undefined;
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolveCategory(slug);
  if (!resolved) return { title: "找不到分類" };

  return {
    title: resolved.category.nameZh,
    description: resolved.category.description,
  };
}

export default async function DynamicCategoryPage({
  params,
}: CategoryPageProps) {
  const { slug } = await params;
  const resolved = await resolveCategory(slug);
  if (!resolved) notFound();

  const catalog = createCatalogSnapshotIndex(resolved.snapshot);
  const products = catalog.selectProducts({
    category: resolved.category.code,
  });

  return (
    <CatalogPage
      eyebrow={resolved.category.nameEn}
      title={resolved.category.nameZh}
      description={resolved.category.description}
      products={products}
    />
  );
}
