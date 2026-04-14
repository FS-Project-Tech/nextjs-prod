import Container from "@/components/Container";
import { fetchProductReviews } from "@/lib/woocommerce";
import type { WooCommerceProduct } from "@/lib/woocommerce";
import ProductReviewsLazy from "./ProductReviewsLazy";

/** Fetches reviews on server; mounts interactive list client-side via dynamic import. */
export default async function ProductReviewsServerSection({
  product,
}: {
  product: WooCommerceProduct;
}) {
  const initialReviews = await fetchProductReviews(product.id, { per_page: 20 });

  return (
    <Container className="mt-10">
      <ProductReviewsLazy
        productId={product.id}
        averageRating={product.average_rating || "0"}
        ratingCount={product.rating_count || 0}
        reviewsAllowed={product.reviews_allowed !== false}
        initialReviews={initialReviews}
      />
    </Container>
  );
}
