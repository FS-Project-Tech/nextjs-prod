import ProductInfoAccordion from "@/components/ProductInfoAccordion";
import Container from "@/components/Container";
import type { WooCommerceProduct } from "@/lib/woocommerce";
import { getProductVariationsForRequest } from "./product-fetch-cache";

/** Server-only accordion (description, specs) — no client reviews bundle here. */
export default async function ProductAccordionOnlySection({
  product,
}: {
  product: WooCommerceProduct;
}) {
  const hasVariationRows = Boolean(product.variations?.length);
  const variations = await getProductVariationsForRequest(product.id, hasVariationRows);

  return (
    <Container className="mt-10">
      <ProductInfoAccordion product={product} variations={variations} />
    </Container>
  );
}
