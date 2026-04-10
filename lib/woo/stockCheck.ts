import {
  batchFetchCheckoutCatalogLines,
  catalogLineKey,
  type CheckoutCatalogRow,
} from "@/lib/woo/batchCheckoutCatalog";

export class CheckoutStockError extends Error {
  readonly code = "INSUFFICIENT_STOCK" as const;
  constructor(
    message: string,
    readonly productId: number,
    readonly variationId?: number,
  ) {
    super(message);
    this.name = "CheckoutStockError";
  }
}

export type CheckoutStockCatalog = Map<string, CheckoutCatalogRow>;

function assertStockFromCatalog(
  lines: Array<{ product_id: number; variation_id?: number; quantity: number }>,
  catalog: CheckoutStockCatalog,
): void {
  for (const li of lines) {
    const key = catalogLineKey(li.product_id, li.variation_id);
    const p = catalog.get(key);
    if (!p) {
      throw new CheckoutStockError(
        `Product ${li.product_id} could not be loaded for stock check.`,
        li.product_id,
        li.variation_id,
      );
    }
    const stockStatus = String(p.stock_status || "").toLowerCase();
    if (stockStatus === "outofstock") {
      throw new CheckoutStockError(
        `Product ${li.product_id} is out of stock.`,
        li.product_id,
        li.variation_id,
      );
    }
    const manage = Boolean(p.manage_stock);
    if (manage) {
      const qtyRaw = p.stock_quantity;
      const qty =
        typeof qtyRaw === "number" && Number.isFinite(qtyRaw)
          ? qtyRaw
          : Number.parseInt(String(qtyRaw ?? "NaN"), 10);
      if (!Number.isFinite(qty) || qty < li.quantity) {
        throw new CheckoutStockError(
          `Insufficient stock for product ${li.product_id}.`,
          li.product_id,
          li.variation_id,
        );
      }
    }
  }
}

/**
 * Ensures each line has stock per Woo product/variation API (never trust the client).
 * Pass `catalog` from {@link batchFetchCheckoutCatalogLines} to avoid a second Woo round-trip.
 */
export async function assertCheckoutLineItemsStock(
  lines: Array<{ product_id: number; variation_id?: number; quantity: number }>,
  options?: { catalog?: CheckoutStockCatalog },
): Promise<void> {
  const catalog = options?.catalog ?? (await batchFetchCheckoutCatalogLines(lines));
  assertStockFromCatalog(lines, catalog);
}
