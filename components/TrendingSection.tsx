import { fetchProducts, fetchProduct, fetchProductVariations, type WooCommerceProduct } from "@/lib/woocommerce";
import TrendingSectionClient from "@/components/TrendingSectionClient";
import { ProductCardProduct } from "@/lib/types/product";

export const revalidate = 60; // ISR – 1 minute so sale data stays fresh

export default async function TrendingSection() {
  let products: ProductCardProduct[] = [];

  try {
    const result = await fetchProducts({
      per_page: 5,
      orderby: "popularity",
      on_sale: true,
    });

    const raw = result?.products || [];
    const normalized = raw.map((p: WooCommerceProduct) => ({
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
    })) as ProductCardProduct[];

    // Always fetch full product for each on-sale item so we get regular_price + sale_price (list endpoint often omits them)
    const enriched = await Promise.all(
      normalized.map(async (p) => {
        try {
          const full = await fetchProduct(p.id);
          const fullAny = full as unknown as Record<string, unknown>;
          let regular = full.regular_price != null && full.regular_price !== "" ? String(full.regular_price) : p.regular_price;
          let sale = full.sale_price != null && full.sale_price !== "" ? String(full.sale_price) : p.sale_price;
          const displayPrice = full.price != null && full.price !== "" ? String(full.price) : p.price;

          // Variable products: prices are on variations; get from first variation if parent has none
          if ((!regular || !sale) && fullAny.type === "variable" && Array.isArray(fullAny.variations) && (fullAny.variations as number[]).length > 0) {
            try {
              const variations = await fetchProductVariations(p.id, { per_page: 1, page: 1 });
              const v = variations[0];
              if (v) {
                if (v.regular_price) regular = String(v.regular_price);
                if (v.sale_price) sale = String(v.sale_price);
              }
            } catch {
              // keep existing regular/sale
            }
          }

          return {
            ...p,
            regular_price: regular ?? p.regular_price,
            sale_price: sale ?? p.sale_price,
            price: displayPrice ?? p.price,
          };
        } catch {
          return p;
        }
      })
    );

    products = enriched;
  } catch {}

  return <TrendingSectionClient products={products} />;
}
