import { fetchProducts, type WooCommerceProduct } from "@/lib/woocommerce";
import TrendingSectionClient from "@/components/TrendingSectionClient";
import { ProductCardProduct } from "@/lib/types/product";
import { enrichWcListProductPricesForCard } from "@/lib/utils/product";

export const revalidate = 60; // ISR – 1 minute so sale data stays fresh

function toProductCardProduct(p: WooCommerceProduct): ProductCardProduct {
  return {
    ...p,
    id: Number(p.id),
    name: String(p.name ?? ""),
    slug: String(p.slug ?? ""),
    price: String(p.price ?? ""),
    regular_price: p.regular_price != null ? String(p.regular_price) : undefined,
    sale_price: p.sale_price != null ? String(p.sale_price) : undefined,
    on_sale: Boolean(p.on_sale),
    sku: p.sku != null ? String(p.sku) : undefined,
    tax_class: p.tax_class != null ? String(p.tax_class) : undefined,
    tax_status: p.tax_status != null ? String(p.tax_status) : undefined,
    average_rating: p.average_rating != null ? String(p.average_rating) : undefined,
    rating_count: p.rating_count != null ? Number(p.rating_count) : undefined,
    images: Array.isArray(p.images) ? p.images : undefined,
  };
}

export default async function TrendingSection() {
  let products: ProductCardProduct[] = [];

  try {
    const result = await fetchProducts({
      per_page: 5,
      orderby: "popularity",
      on_sale: true,
      context: "edit",
    });

    const raw = result?.products || [];
    products = raw.map((p: WooCommerceProduct) =>
      toProductCardProduct(enrichWcListProductPricesForCard(p))
    );
  } catch {
    products = [];
  }

  return <TrendingSectionClient products={products} />;
}
