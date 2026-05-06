import "server-only";

import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import type { CheckoutInitiatePayload, CheckoutQuoteSnapshotV1, CheckoutTotals } from "@/types/checkout";
import type { CheckoutQuoteTotalsInput } from "@/lib/checkout/initiatePayload";
import type { WooLineItem } from "@/services/woocommerce";
import { wooStoreCurrency } from "@/lib/checkout/pricingOptions";

const QUOTE_SIGNING_VERSION = 1 as const;
const DEFAULT_QUOTE_MAX_AGE_MS = 15 * 60 * 1000;

/** Canonical JSON for stable HMAC input (sorted keys, deterministic arrays). */
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((x) => canonicalStringify(x)).join(",")}]`;
  }
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalStringify(o[k] ?? null)}`)
    .join(",")}}`;
}

export function getQuoteSigningSecret(): string | null {
  const dedicated = process.env.CHECKOUT_QUOTE_SIGNING_SECRET?.trim();
  if (dedicated) return dedicated;
  return process.env.CHECKOUT_SESSION_SERVER_SECRET?.trim() || null;
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

type LineRow = {
  sku: string;
  product_id: number;
  variation_id: number;
  quantity: number;
  unit_key: string;
};

function unitKey(unit_price: number | string | undefined): string {
  if (unit_price === undefined || unit_price === null) return "";
  const n = typeof unit_price === "number" ? unit_price : Number.parseFloat(String(unit_price).trim());
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toFixed(4);
}

function normalizeLineRows(
  lines: Array<{
    sku?: string;
    product_id?: number;
    variation_id?: number;
    quantity?: number;
    unit_price?: number | string;
  }>,
): LineRow[] {
  return lines
    .map((row) => ({
      sku: typeof row.sku === "string" ? row.sku.trim().toLowerCase() : "",
      product_id: row.product_id && row.product_id > 0 ? row.product_id : 0,
      variation_id: row.variation_id && row.variation_id > 0 ? row.variation_id : 0,
      quantity: row.quantity && row.quantity > 0 ? row.quantity : 0,
      unit_key: unitKey(row.unit_price),
    }))
    .sort((a, b) => {
      const ka = `${a.sku}\0${a.product_id}\0${a.variation_id}\0${a.quantity}\0${a.unit_key}`;
      const kb = `${b.sku}\0${b.product_id}\0${b.variation_id}\0${b.quantity}\0${b.unit_key}`;
      return ka.localeCompare(kb);
    });
}

/** Digest for quote-totals request line_items (same rules as checkout payload line_items). */
export function digestQuoteInputLineItems(
  lineItems: CheckoutQuoteTotalsInput["line_items"],
): string {
  return sha256Hex(canonicalStringify(normalizeLineRows(lineItems)));
}

export function digestCheckoutPayloadLineItems(
  lineItems: CheckoutInitiatePayload["line_items"],
): string {
  return sha256Hex(canonicalStringify(normalizeLineRows(lineItems)));
}

export function buildQuoteSnapshotV1(params: {
  input: CheckoutQuoteTotalsInput;
  pricing: {
    totals: CheckoutTotals;
    shippingLine: CheckoutQuoteSnapshotV1["shipping_line"];
    validatedLineItems: Array<{ product_id: number; variation_id?: number; quantity: number }>;
    wooLineItems: WooLineItem[];
  };
}): CheckoutQuoteSnapshotV1 {
  const { input, pricing } = params;
  const digest = digestQuoteInputLineItems(input.line_items);
  return {
    v: QUOTE_SIGNING_VERSION,
    currency: wooStoreCurrency(),
    issued_at_ms: Date.now(),
    line_items_digest: digest,
    totals: pricing.totals,
    shipping_method_id: input.shipping_method_id,
    shipping_line: pricing.shippingLine,
    validated_line_items: pricing.validatedLineItems.map((li) => ({
      product_id: li.product_id,
      ...(li.variation_id != null && li.variation_id > 0 ? { variation_id: li.variation_id } : {}),
      quantity: li.quantity,
    })),
    woo_line_items: pricing.wooLineItems,
    coupon_code: input.coupon_code?.trim() ? input.coupon_code.trim() : null,
    insurance_option: input.insurance_option === "yes" ? "yes" : "no",
  };
}

export function signQuoteSnapshot(snapshot: CheckoutQuoteSnapshotV1): string | null {
  const secret = getQuoteSigningSecret();
  if (!secret) return null;
  const payload = canonicalStringify(snapshot);
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function verifyQuoteSignature(snapshot: CheckoutQuoteSnapshotV1, signature: string): boolean {
  const secret = getQuoteSigningSecret();
  if (!secret) return false;
  const expected = createHmac("sha256", secret)
    .update(canonicalStringify(snapshot), "utf8")
    .digest("hex");
  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(signature.trim(), "hex");
    b = Buffer.from(expected, "hex");
  } catch {
    return false;
  }
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export function quoteSnapshotAgeMs(snapshot: CheckoutQuoteSnapshotV1, nowMs: number): number {
  return nowMs - snapshot.issued_at_ms;
}

export function isQuoteSnapshotFresh(
  snapshot: CheckoutQuoteSnapshotV1,
  nowMs: number,
  maxAgeMs: number = DEFAULT_QUOTE_MAX_AGE_MS,
): boolean {
  return quoteSnapshotAgeMs(snapshot, nowMs) >= 0 && quoteSnapshotAgeMs(snapshot, nowMs) <= maxAgeMs;
}

function normCoupon(code: string | undefined | null): string {
  return (code ?? "").trim().toLowerCase();
}

export function assertPayloadMatchesQuoteSnapshot(
  payload: CheckoutInitiatePayload,
  snapshot: CheckoutQuoteSnapshotV1,
): { ok: true } | { ok: false; message: string } {
  if (snapshot.currency !== wooStoreCurrency()) {
    return { ok: false, message: "Quote currency does not match the store. Refresh totals and try again." };
  }
  if (payload.shipping_method_id !== snapshot.shipping_method_id) {
    return { ok: false, message: "Shipping method changed since the last quote. Refresh totals and try again." };
  }
  if (normCoupon(payload.coupon_code) !== normCoupon(snapshot.coupon_code)) {
    return { ok: false, message: "Coupon changed since the last quote. Refresh totals and try again." };
  }
  const ins = payload.insurance_option ?? "no";
  if (ins !== snapshot.insurance_option) {
    return { ok: false, message: "Parcel protection option changed since the last quote. Refresh totals and try again." };
  }
  const digest = digestCheckoutPayloadLineItems(payload.line_items);
  if (digest !== snapshot.line_items_digest) {
    return { ok: false, message: "Cart lines changed since the last quote. Refresh totals and try again." };
  }
  return { ok: true };
}

export const quoteSigningConstants = {
  DEFAULT_QUOTE_MAX_AGE_MS,
  QUOTE_SIGNING_VERSION,
};
