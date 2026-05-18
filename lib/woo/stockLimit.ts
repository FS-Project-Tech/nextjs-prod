/**
 * Client-side quantity caps when WooCommerce "Manage stock" is enabled.
 */

export type StockCapSource = {
  manage_stock?: boolean;
  stock_quantity?: number | null;
};

/** Max orderable units, or null when stock is not managed / unlimited. */
export function getStockCap(source: StockCapSource | null | undefined): number | null {
  if (!source?.manage_stock) return null;
  const raw = source.stock_quantity;
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/** Clamp cart line qty to [1, cap] when cap is set; cap 0 yields 0. */
export function clampToStockCap(qty: number, cap: number | null): number {
  const base = Math.max(0, Math.floor(qty));
  if (cap == null) return Math.max(1, base);
  if (cap <= 0) return 0;
  return Math.min(Math.max(1, base), cap);
}

export function canIncrementQty(currentQty: number, cap: number | null): boolean {
  if (cap == null) return true;
  return currentQty < cap;
}

/** PDP quantity field max when cart qty = displayQty * unitMultiplier. */
export function maxDisplayQuantityForStock(
  cap: number | null,
  unitMultiplier: number,
): number | null {
  if (cap == null) return null;
  const mult =
    Number.isFinite(unitMultiplier) && unitMultiplier > 0
      ? Math.floor(unitMultiplier)
      : 1;
  if (cap <= 0) return 0;
  return Math.max(1, Math.floor(cap / mult));
}

export function resolveStockCapSource(
  product: StockCapSource,
  variation?: StockCapSource | null,
): StockCapSource {
  if (variation?.manage_stock) {
    return {
      manage_stock: true,
      stock_quantity: variation.stock_quantity ?? null,
    };
  }
  if (product.manage_stock) {
    return {
      manage_stock: true,
      stock_quantity: product.stock_quantity ?? null,
    };
  }
  return { manage_stock: false, stock_quantity: null };
}
