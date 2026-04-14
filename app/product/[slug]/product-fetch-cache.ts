import { cache } from "react";
import {
  fetchProductBySlug,
  fetchProductVariations,
  type WooCommerceVariation,
} from "@/lib/woocommerce";

/** One product fetch per request shared by `generateMetadata` + page. */
export const getProductBySlugCached = cache(fetchProductBySlug);

/** Same-request dedupe: main column + accordion both need variations. */
export const getProductVariationsForRequest = cache(
  async (productId: number, hasVariationRows: boolean): Promise<WooCommerceVariation[]> => {
    if (!hasVariationRows) return [];
    return fetchProductVariations(productId).catch(() => [] as WooCommerceVariation[]);
  }
);
