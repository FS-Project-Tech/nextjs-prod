import {
  HEADLESS_EWAY_PAYMENT_ORDER_TOTAL_META_KEY,
  HEADLESS_EWAY_RETURN_MODE_META_KEY,
  HEADLESS_EWAY_PAYMENT_URL_META_KEY,
  HEADLESS_PAYMENT_INITIATED_META_KEY,
  HEADLESS_VALIDATED_CHECKOUT_TOTAL_META_KEY,
} from "@/lib/checkout/checkoutSessionConstants";
import { mergeWooOrderMetaByKey, readWooMetaValue } from "@/lib/woo/orderMeta";

const PAYMENT_META_KEYS = new Set([
  HEADLESS_PAYMENT_INITIATED_META_KEY,
  HEADLESS_EWAY_PAYMENT_URL_META_KEY,
  HEADLESS_EWAY_PAYMENT_ORDER_TOTAL_META_KEY,
  HEADLESS_EWAY_RETURN_MODE_META_KEY,
]);

const EWAY_SERVER_RETURN_MODE = "server_verify_v1";

function parseWooMoneyToCents(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const normalized = /^\d+,\d{1,2}$/.test(s) ? s.replace(",", ".") : s;
  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function readCurrentWooOrderTotalString(order: unknown): string | null {
  if (order == null || typeof order !== "object") return null;
  const t = (order as Record<string, unknown>).total;
  if (typeof t === "string" && t.trim()) return t.trim();
  if (typeof t === "number" && Number.isFinite(t)) return String(t);
  return null;
}

/** Headless-validated grand total written at checkout (preferred over raw Woo `order.total` for payment). */
export function readHeadlessValidatedCheckoutTotalString(order: unknown): string | null {
  const meta = (order as { meta_data?: Array<{ key?: string; value?: unknown }> })?.meta_data;
  const v = readWooMetaValue(meta, HEADLESS_VALIDATED_CHECKOUT_TOTAL_META_KEY);
  if (!v || !String(v).trim()) return null;
  return String(v).trim();
}

/**
 * Amount eWAY should charge / compare for session reuse: validated checkout total when present, else Woo order total.
 */
export function readCanonicalCheckoutPaymentTotalString(order: unknown): string | null {
  return readHeadlessValidatedCheckoutTotalString(order) ?? readCurrentWooOrderTotalString(order);
}

export function readStoredEwayPaymentOrderTotal(order: unknown): string | null {
  const meta = (order as { meta_data?: Array<{ key?: string; value?: unknown }> })?.meta_data;
  const v = readWooMetaValue(meta, HEADLESS_EWAY_PAYMENT_ORDER_TOTAL_META_KEY);
  if (!v || !String(v).trim()) return null;
  return String(v).trim();
}

export function isOrderPaymentInitiated(order: unknown): boolean {
  const meta = (order as { meta_data?: Array<{ key?: string; value?: unknown }> })?.meta_data;
  const v = readWooMetaValue(meta, HEADLESS_PAYMENT_INITIATED_META_KEY);
  if (!v) return false;
  const s = v.toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

export function readStoredPaymentUrl(order: unknown): string | null {
  const meta = (order as { meta_data?: Array<{ key?: string; value?: unknown }> })?.meta_data;
  const v = readWooMetaValue(meta, HEADLESS_EWAY_PAYMENT_URL_META_KEY);
  if (!v || !v.trim()) return null;
  return v.trim();
}

function hasServerSideReturnMode(order: unknown): boolean {
  const meta = (order as { meta_data?: Array<{ key?: string; value?: unknown }> })?.meta_data;
  const v = readWooMetaValue(meta, HEADLESS_EWAY_RETURN_MODE_META_KEY);
  return v === EWAY_SERVER_RETURN_MODE;
}

/**
 * Idempotent eWAY: reuse hosted URL only if payment was started and the order total has not changed
 * since the URL was created (otherwise the gateway page shows a stale amount).
 */
export function shouldReuseEwayPayment(order: unknown): boolean {
  if (!isOrderPaymentInitiated(order)) return false;
  if (!hasServerSideReturnMode(order)) return false;
  const url = readStoredPaymentUrl(order);
  if (!url) return false;
  const current = readCanonicalCheckoutPaymentTotalString(order);
  const storedTotal = readStoredEwayPaymentOrderTotal(order);
  if (!current) return false;
  /** No snapshot (legacy meta) — never reuse; avoids wrong charge after cart/order edits. */
  if (!storedTotal) return false;
  const cCents = parseWooMoneyToCents(current);
  const sCents = parseWooMoneyToCents(storedTotal);
  if (cCents == null || sCents == null) return false;
  return cCents === sCents;
}

/**
 * Persist eWAY session on the Woo order (single PUT after SharedPaymentUrl is issued).
 */
export function mergeEwayPaymentSessionMeta(
  order: unknown,
  paymentUrl: string,
  /** Amount charged in this hosted session (validated checkout total or Woo total; must match for {@link shouldReuseEwayPayment}). */
  orderTotalForSession: string,
): Array<{ id?: number; key: string; value: unknown }> {
  const existing = (order as { meta_data?: Array<{ id?: number; key: string; value: unknown }> })
    ?.meta_data;
  const totalTrim = String(orderTotalForSession || "").trim();
  return mergeWooOrderMetaByKey(existing, [
    { key: HEADLESS_EWAY_PAYMENT_URL_META_KEY, value: paymentUrl },
    { key: HEADLESS_PAYMENT_INITIATED_META_KEY, value: "true" },
    { key: HEADLESS_EWAY_RETURN_MODE_META_KEY, value: EWAY_SERVER_RETURN_MODE },
    ...(totalTrim
      ? [{ key: HEADLESS_EWAY_PAYMENT_ORDER_TOTAL_META_KEY, value: totalTrim }]
      : []),
  ]);
}

/** Strip payment session keys (e.g. after eWAY API failure before meta was written — no-op if never set). */
export function metaDataWithoutEwayPaymentKeys(
  existing: Array<{ id?: number; key: string; value: unknown }> | undefined,
): Array<{ id?: number; key: string; value: unknown }> {
  return (existing ?? []).filter((row) => row?.key && !PAYMENT_META_KEYS.has(String(row.key)));
}

/** @deprecated use mergeEwayPaymentSessionMeta after eWAY success */
export function mergeOrderMetaPaymentInitiated(
  order: unknown,
): Array<{ id?: number; key: string; value: unknown }> {
  const existing = (order as { meta_data?: Array<{ id?: number; key: string; value: unknown }> })
    ?.meta_data;
  return mergeWooOrderMetaByKey(existing, [
    { key: HEADLESS_PAYMENT_INITIATED_META_KEY, value: "true" },
  ]);
}

/** @deprecated use metaDataWithoutEwayPaymentKeys */
export function metaDataWithoutPaymentInitiated(
  existing: Array<{ id?: number; key: string; value: unknown }> | undefined,
): Array<{ id?: number; key: string; value: unknown }> {
  return metaDataWithoutEwayPaymentKeys(existing);
}
