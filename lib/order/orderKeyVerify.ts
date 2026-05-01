import { timingSafeEqual } from "node:crypto";

const WC_ORDER_PREFIX = "wc_order_";

/**
 * Woo REST may return `order_key` with or without the `wc_order_` prefix; URLs sometimes include it.
 * Strip repeatedly in case of redundant prefixes. Compare the canonical secret portion only.
 */
function canonicalOrderKeySecret(k: string): string {
  let s = String(k || "").trim();
  if (!s) return "";
  while (
    s.length >= WC_ORDER_PREFIX.length &&
    s.slice(0, WC_ORDER_PREFIX.length).toLowerCase() === WC_ORDER_PREFIX
  ) {
    s = s.slice(WC_ORDER_PREFIX.length);
  }
  return s;
}

export function keysMatchWooOrder(wooKey: string, provided: string): boolean {
  const a = canonicalOrderKeySecret(wooKey).toLowerCase();
  const b = canonicalOrderKeySecret(provided).toLowerCase();
  if (!a || !b) return false;
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}
