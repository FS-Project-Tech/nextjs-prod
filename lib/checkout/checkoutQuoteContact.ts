import type { CheckoutFormData } from "@/lib/checkout/schema";
import type { QuoteAddressSnapshot } from "@/lib/types/quote";

export type CheckoutQuoteContactPayload = {
  email: string;
  userName: string;
  billing_address: QuoteAddressSnapshot;
  shipping_address: QuoteAddressSnapshot;
};

function nonEmpty(s: unknown): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

function hasCompleteAlternateShipping(v: Partial<CheckoutFormData> | null | undefined): boolean {
  if (!v || !v.shipToDifferentAddress) return false;
  if (!nonEmpty(v.shipping_first_name) || !nonEmpty(v.shipping_last_name)) return false;
  return (
    nonEmpty(v.shipping_address_1) &&
    nonEmpty(v.shipping_city) &&
    nonEmpty(v.shipping_postcode) &&
    nonEmpty(v.shipping_state) &&
    nonEmpty(v.shipping_country)
  );
}

function trimSnapshot(s: QuoteAddressSnapshot): QuoteAddressSnapshot {
  const out: QuoteAddressSnapshot = {};
  (Object.keys(s) as (keyof QuoteAddressSnapshot)[]).forEach((k) => {
    const val = s[k];
    if (typeof val === "string" && val.trim()) out[k] = val.trim();
  });
  return out;
}

function billingToSnapshot(v: CheckoutFormData): QuoteAddressSnapshot {
  return {
    first_name: v.billing_first_name?.trim(),
    last_name: v.billing_last_name?.trim(),
    company: v.billing_company?.trim() || undefined,
    address_1: v.billing_address_1?.trim(),
    address_2: v.billing_address_2?.trim() || undefined,
    city: v.billing_city?.trim(),
    state: v.billing_state?.trim(),
    postcode: v.billing_postcode?.trim(),
    country: v.billing_country?.trim(),
    email: v.billing_email?.trim(),
    phone: v.billing_phone?.trim() || undefined,
  };
}

function shippingDifferentToSnapshot(v: CheckoutFormData): QuoteAddressSnapshot {
  return {
    first_name: v.shipping_first_name?.trim(),
    last_name: v.shipping_last_name?.trim(),
    company: v.shipping_company?.trim() || undefined,
    address_1: v.shipping_address_1?.trim(),
    address_2: v.shipping_address_2?.trim() || undefined,
    city: v.shipping_city?.trim(),
    state: v.shipping_state?.trim(),
    postcode: v.shipping_postcode?.trim(),
    country: v.shipping_country?.trim(),
  };
}

/** Same physical address as billing (ship to billing). */
function shippingSameAsBillingSnapshot(v: CheckoutFormData): QuoteAddressSnapshot {
  const b = billingToSnapshot(v);
  return {
    ...b,
    first_name: v.billing_first_name?.trim(),
    last_name: v.billing_last_name?.trim(),
  };
}

export function checkoutValuesToQuoteContactPayload(
  v: CheckoutFormData | null | undefined
): CheckoutQuoteContactPayload | null {
  if (!v) return null;
  const billing_address = trimSnapshot(billingToSnapshot(v));
  const shipping_address = trimSnapshot(
    hasCompleteAlternateShipping(v) ? shippingDifferentToSnapshot(v) : shippingSameAsBillingSnapshot(v)
  );
  const userName = `${v.billing_first_name ?? ""} ${v.billing_last_name ?? ""}`.trim() || "Customer";
  const email = String(v.billing_email ?? "").trim();
  return {
    email,
    userName,
    billing_address,
    shipping_address,
  };
}
