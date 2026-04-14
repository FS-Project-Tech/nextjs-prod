import RelatedProductsSection from "@/components/RelatedProductsSection";
import Container from "@/components/Container";
import { fetchProducts } from "@/lib/woocommerce";
import type { WooCommerceProduct } from "@/lib/woocommerce";
import type { ProductCardProduct } from "@/lib/types/product";

function toProductCardProduct(p: any): ProductCardProduct {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    sku: p.sku,
    price: p.price,
    sale_price: p.sale_price,
    regular_price: p.regular_price,
    on_sale: p.on_sale,
    tax_class: p.tax_class,
    tax_status: p.tax_status,
    average_rating: p.average_rating,
    rating_count: p.rating_count,
    images: p.images,
  };
}

export default async function ProductRelatedSections({ product }: { product: WooCommerceProduct }) {
  const firstCategoryId = product.categories?.[0]?.id;
  if (!firstCategoryId) return null;

  const brandAttribute = product.attributes?.find(
    (attr: { slug?: string; options?: string[] }) => attr.slug === "product_brand"
  );
  const currentBrandId = brandAttribute?.options?.[0]
    ? Number(brandAttribute.options[0])
    : undefined;

  const categoryProductsResult = await fetchProducts({ per_page: 20, category: firstCategoryId });
  const categoryProducts = Array.isArray(categoryProductsResult?.products)
    ? categoryProductsResult.products
    : [];

  const topSellingProducts = categoryProducts.slice(0, 6);
  const otherBrandProducts = currentBrandId
    ? categoryProducts.filter((p: any) => {
        const brandAttr = p.attributes?.find((attr: any) => attr.slug === "product_brand");
        const brandId = brandAttr?.options?.[0] ? Number(brandAttr.options[0]) : null;
        return brandId && brandId !== currentBrandId;
      })
    : [];

  return (
    <Container className="mt-10 space-y-10">
      <RelatedProductsSection
        title="Top most selling products"
        products={topSellingProducts.slice(0, 5).map(toProductCardProduct)}
        viewAllHref={`/shop?category=${firstCategoryId}&orderby=popularity`}
      />

      <RelatedProductsSection
        title="Similar products from other brands"
        products={otherBrandProducts.slice(0, 6).map(toProductCardProduct)}
        viewAllHref={
          currentBrandId
            ? `/shop?category=${firstCategoryId}&exclude_brand=${currentBrandId}`
            : undefined
        }
      />
    </Container>
  );
}
