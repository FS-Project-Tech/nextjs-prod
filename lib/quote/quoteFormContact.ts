import type { CheckoutQuoteContactPayload } from "@/lib/checkout/checkoutQuoteContact";
import type { QuoteAddressSnapshot } from "@/lib/types/quote";
import type { QuoteFormData } from "./schema";

function trimSnapshot(s: QuoteAddressSnapshot): QuoteAddressSnapshot {
  const out: QuoteAddressSnapshot = {};
  (Object.keys(s) as (keyof QuoteAddressSnapshot)[]).forEach((k) => {
    const val = s[k];
    if (typeof val === "string" && val.trim()) out[k] = val.trim();
  });
  return out;
}

function shippingStreetSnapshot(v: QuoteFormData): QuoteAddressSnapshot {
  return {
    first_name: v.billing_first_name?.trim(),
    last_name: v.billing_last_name?.trim(),
    company: v.billing_company?.trim() || undefined,
    address_1: v.shipping_address_1?.trim(),
    address_2: v.shipping_address_2?.trim() || undefined,
    city: v.shipping_city?.trim(),
    state: v.shipping_state?.trim(),
    postcode: v.shipping_postcode?.trim(),
    country: v.shipping_country?.trim(),
  };
}

function billingStreetSnapshot(v: QuoteFormData): QuoteAddressSnapshot {
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

/** Maps quote drawer fields to the same snapshots checkout quote requests use. */
export function quoteFormToContactPayload(
  v: QuoteFormData | null | undefined,
): CheckoutQuoteContactPayload | null {
  if (!v) return null;
  const email = String(v.billing_email ?? "").trim();
  if (!email) return null;

  const shipping_address = trimSnapshot(shippingStreetSnapshot(v));
  const billing_address = trimSnapshot(
    v.sameAddressForBilling
      ? {
          ...shippingStreetSnapshot(v),
          email,
          phone: v.billing_phone?.trim() || undefined,
        }
      : billingStreetSnapshot(v),
  );

  const userName = `${v.billing_first_name ?? ""} ${v.billing_last_name ?? ""}`.trim() || "Customer";

  return {
    email,
    userName,
    billing_address,
    shipping_address,
  };
}
