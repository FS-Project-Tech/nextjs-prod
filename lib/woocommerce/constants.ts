/** WooCommerce REST: catalog listings exclude out-of-stock. */
export const WC_REST_INSTOCK = { stock_status: "instock" as const };

/** Published + in-stock — use for storefront product lists (never drafts/private/pending). */
export const WC_REST_CATALOG = {
  stock_status: "instock" as const,
  status: "publish" as const,
};
