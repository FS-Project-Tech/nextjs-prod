/**
 * Persists checkout form fields in localStorage so customers returning from eWAY
 * (or a refresh) keep billing/shipping and options. Cleared when an order completes
 * and the cart is cleared (COD / paid flows).
 */

import type { CheckoutFormData, ShippingMethodType } from "@/lib/checkout/schema";
import { CHECKOUT_FORM_DEFAULTS } from "@/lib/checkout/formDefaults";

export const CHECKOUT_FORM_DRAFT_STORAGE_KEY = "joya_checkout_form_draft_v1";

const DRAFT_VERSION = 1 as const;
/** Drop drafts older than this (stale addresses / methods). */
const MAX_DRAFT_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type CheckoutFormDraftV1 = {
  version: typeof DRAFT_VERSION;
  savedAt: number;
  /** From {@link cartLinesFingerprint}; restore only when it matches current cart. */
  cartFingerprint: string;
  form: Partial<CheckoutFormData>;
  selectedPaymentMethod?: "eway" | "cod" | "afterpay";
  empowerDiscountApplied?: boolean;
  selectedBillingAddressId?: string;
  selectedShippingAddressId?: string;
};

function isShippingMethodLike(v: unknown): v is ShippingMethodType {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    o.id.trim() !== "" &&
    typeof o.method_id === "string" &&
    typeof o.label === "string" &&
    typeof o.cost === "number" &&
    Number.isFinite(o.cost) &&
    typeof o.total === "number" &&
    Number.isFinite(o.total)
  );
}

/** Keys we allow to restore from localStorage (matches checkout form; no card data). */
const PERSISTABLE_FORM_KEYS = new Set<string>([
  ...Object.keys(CHECKOUT_FORM_DEFAULTS),
  "shippingMethod",
]);

/** Merge persisted fields onto defaults; drops unknown / invalid shapes. */
export function mergeCheckoutFormDraft(rawForm: unknown): Partial<CheckoutFormData> {
  if (!rawForm || typeof rawForm !== "object") return {};
  const src = rawForm as Record<string, unknown>;
  const out: Partial<CheckoutFormData> = {};
  for (const k of Object.keys(src)) {
    if (!PERSISTABLE_FORM_KEYS.has(k)) continue;
    const val = src[k];
    if (k === "shippingMethod") {
      if (isShippingMethodLike(val)) {
        out.shippingMethod = val;
      }
      continue;
    }
    if (val === undefined || val === null) continue;
    (out as Record<string, unknown>)[k] = val;
  }
  return out;
}

export function clearCheckoutFormDraft(): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(CHECKOUT_FORM_DRAFT_STORAGE_KEY);
  } catch {
    /* quota / private mode */
  }
}

export function readCheckoutFormDraft(): CheckoutFormDraftV1 | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(CHECKOUT_FORM_DRAFT_STORAGE_KEY);
    if (!raw?.trim()) return null;
    const parsed = JSON.parse(raw) as CheckoutFormDraftV1;
    if (parsed?.version !== DRAFT_VERSION || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > MAX_DRAFT_AGE_MS) {
      clearCheckoutFormDraft();
      return null;
    }
    if (typeof parsed.cartFingerprint !== "string") return null;
    if (!parsed.form || typeof parsed.form !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCheckoutFormDraft(draft: CheckoutFormDraftV1): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CHECKOUT_FORM_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}
