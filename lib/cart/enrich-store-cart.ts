import type { CartItem } from "@/lib/types/cart";

/** Minimal Store API cart item fields used to merge into client lines. */
export type StoreCartLineLike = {
  key?: string;
  id?: number | string;
  quantity?: number;
  type?: string;
  prices?: { price?: string; sale_price?: string; regular_price?: string };
};

export type StoreCartLike = {
  items?: StoreCartLineLike[];
};

function priceFromStoreLine(si: StoreCartLineLike | undefined, fallback: string): string {
  const raw =
    si?.prices?.price || si?.prices?.sale_price || si?.prices?.regular_price || fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n.toFixed(2) : fallback;
}

function storeLineMatchesClientLine(sl: StoreCartLineLike, line: CartItem): boolean {
  const sid = Number(sl.id);
  if (!Number.isFinite(sid)) return false;
  if (line.variationId && line.variationId > 0) {
    return sid === line.variationId;
  }
  return sid === line.productId;
}

/**
 * After a Store API cart read, align client `remaining` lines with Woo:
 * assign `wc_store_item_key`, authoritative `qty`, and display `price`.
 * Prefers matching by existing `wc_store_item_key`, then first unused store line with same product/variation id.
 */
export function enrichClientCartFromStore(
  remaining: CartItem[],
  store: StoreCartLike | null | undefined,
): CartItem[] {
  const storeLines = Array.isArray(store?.items) ? [...store.items] : [];
  const used = new Set<number>();

  return remaining.map((line) => {
    let idx = -1;
    if (line.wc_store_item_key) {
      idx = storeLines.findIndex(
        (s, i) => !used.has(i) && s.key && s.key === line.wc_store_item_key,
      );
    }
    if (idx < 0) {
      idx = storeLines.findIndex((s, i) => !used.has(i) && storeLineMatchesClientLine(s, line));
    }
    if (idx >= 0) used.add(idx);
    const si = idx >= 0 ? storeLines[idx] : undefined;
    return {
      ...line,
      qty: si?.quantity ?? line.qty,
      price: priceFromStoreLine(si, line.price),
      wc_store_item_key: si?.key || line.wc_store_item_key,
    };
  });
}
