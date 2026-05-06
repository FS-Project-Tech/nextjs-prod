import dynamic from "next/dynamic";
import ProductGallery from "@/components/ProductGallery";
import ProductDetailPanelSkeleton from "@/components/ProductDetailPanelSkeleton";
import { ProductVariationGalleryProvider } from "@/components/product/ProductVariationGalleryProvider";
import type { CategoryTrailItem, WooCommerceProduct } from "@/lib/woocommerce";
import { getProductVariationsForRequest } from "./product-fetch-cache";

const ProductDetailPanel = dynamic(() => import("@/components/ProductDetailPanel"), {
  loading: () => <ProductDetailPanelSkeleton />,
});

export default async function ProductMainColumn({
  product,
  categoryTrail = [],
}: {
  product: WooCommerceProduct;
  categoryTrail?: CategoryTrailItem[];
}) {
  const hasVariationRows = Boolean(product.variations?.length);
  const variations = await getProductVariationsForRequest(product.id, hasVariationRows);

  return (
    <ProductVariationGalleryProvider
      baseImages={product.images.map((img) => ({
        id: img.id,
        src: img.src,
        alt: img.alt || product.name,
        name: img.name,
      }))}
    >
      <section className="lg:col-span-2">
        <ProductGallery />
      </section>

      <section className="lg:col-span-2">
        <ProductDetailPanel product={product} variations={variations} categoryTrail={categoryTrail} />
      </section>
    </ProductVariationGalleryProvider>
  );
}
