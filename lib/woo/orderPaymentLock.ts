import {
  HEADLESS_EWAY_PAYMENT_URL_META_KEY,
  HEADLESS_PAYMENT_INITIATED_META_KEY,
} from "@/lib/checkout/checkoutSessionConstants";
import { mergeWooOrderMetaByKey, readWooMetaValue } from "@/lib/woo/orderMeta";

const PAYMENT_META_KEYS = new Set([
  HEADLESS_PAYMENT_INITIATED_META_KEY,
  HEADLESS_EWAY_PAYMENT_URL_META_KEY,
]);

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

/** Idempotent eWAY: same session can return the existing hosted payment URL. */
export function shouldReuseEwayPayment(order: unknown): boolean {
  return isOrderPaymentInitiated(order) && readStoredPaymentUrl(order) != null;
}

/**
 * Persist eWAY session on the Woo order (single PUT after SharedPaymentUrl is issued).
 */
export function mergeEwayPaymentSessionMeta(
  order: unknown,
  paymentUrl: string,
): Array<{ id?: number; key: string; value: unknown }> {
  const existing = (order as { meta_data?: Array<{ id?: number; key: string; value: unknown }> })
    ?.meta_data;
  return mergeWooOrderMetaByKey(existing, [
    { key: HEADLESS_EWAY_PAYMENT_URL_META_KEY, value: paymentUrl },
    { key: HEADLESS_PAYMENT_INITIATED_META_KEY, value: "true" },
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
