import type { PublishedProduct } from "./contracts";
import type { CatalogSnapshotIndex } from "./selectors";

const IN_STOCK = "https://schema.org/InStock";
const OUT_OF_STOCK = "https://schema.org/OutOfStock";

/**
 * Builds Product structured data from one immutable publication snapshot.
 * Availability and pricing must never be inferred from the draft product
 * record or a stale static base price.
 */
export function createPublishedProductJsonLd(
  product: PublishedProduct,
  catalog: CatalogSnapshotIndex,
  origin = "https://estatelignee.com",
): Readonly<Record<string, unknown>> {
  const skus = catalog.getSkusForProduct(product.id);
  const priceRange = catalog.getProductPriceRange(product.id);
  const availability = skus.some(
    (sku) =>
      sku.enabledInProduction && sku.displayStatus === "available",
  )
    ? IN_STOCK
    : OUT_OF_STOCK;
  const url = `${origin}/product/${product.slug}`;

  const offers = priceRange
    ? priceRange.isRange
      ? {
          "@type": "AggregateOffer",
          priceCurrency: "TWD",
          lowPrice: priceRange.min,
          highPrice: priceRange.max,
          offerCount: skus.length,
          availability,
          url,
        }
      : {
          "@type": "Offer",
          priceCurrency: "TWD",
          price: priceRange.min,
          availability,
          url,
        }
    : undefined;

  return Object.freeze({
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: [`${origin}${product.image.path}`],
    sku: product.productCode,
    brand: { "@type": "Brand", name: "LIGNÉE" },
    ...(offers ? { offers } : {}),
  });
}
