import type { ProductCardProduct } from "@/lib/types/product";
import type { WooCommerceProduct } from "@/lib/woocommerce/types";

/**
 * Map WooCommerce REST `/products` rows to the same card shape used by Typesense listing.
 */
export function wooProductToListingCard(p: WooCommerceProduct): ProductCardProduct {
  const img = p.images?.[0];
  const firstSrc = img?.src || "";
  const firstAlt = (img?.alt || p.name || "").trim() || p.name;

  let sale_percentage: number | null = null;
  const reg = p.regular_price;
  const sale = p.sale_price;
  if (reg && sale && Number(reg) > 0 && p.on_sale) {
    sale_percentage = Math.round(((Number(reg) - Number(sale)) / Number(reg)) * 100);
  }

  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    sku: p.sku || "",
    price: p.price || "0",
    regular_price: p.regular_price || "",
    sale_price: p.sale_price || "",
    on_sale: Boolean(p.on_sale),
    sale_percentage,
    image: firstSrc,
    images: firstSrc ? [{ src: firstSrc, alt: firstAlt }] : [],
    average_rating: p.average_rating || "0",
    rating_count: p.rating_count ?? 0,
    tax_class: p.tax_class,
    tax_status: p.tax_status,
    tags: p.tags,
    variation_id: undefined,
  };
}
