import "server-only";

import { PARCEL_PROTECTION_FEE_AUD } from "@/lib/checkout-parcel-protection";
import type { CheckoutInitiatePayload, CheckoutTotals } from "@/types/checkout";
import type { WooLineItem } from "@/services/woocommerce";

function currencyForCountry(country: string | undefined): string {
  const c = String(country || "")
    .trim()
    .toUpperCase();
  if (c === "AU" || c === "AUS" || c === "AUSTRALIA") return "AUD";
  if (c === "NZ" || c === "NZL") return "NZD";
  if (c === "US" || c === "USA") return "USD";
  return "AUD";
}

function addrBlock(
  first: string,
  last: string,
  line1: string,
  line2: string | undefined,
  city: string,
  state: string | undefined,
  postcode: string,
  country: string,
  phone?: string,
) {
  const name = `${first} ${last}`.trim();
  return {
    name,
    line1: line1 || "—",
    ...(line2 ? { line2 } : {}),
    area1: city || "—",
    region: state || "",
    postcode: postcode || "0000",
    countryCode: country.length === 2 ? country : "AU",
    phoneNumber: phone?.trim() || undefined,
  };
}

/**
 * Builds Afterpay `/v2/checkouts` JSON body aligned with validated checkout totals.
 */
export function buildAfterpayCreateCheckoutBody(params: {
  payload: CheckoutInitiatePayload;
  totals: CheckoutTotals;
  wooLineItems: WooLineItem[];
  shippingLine: { total: string };
  merchantReference: string;
  siteUrl: string;
}): Record<string, unknown> {
  const { payload, totals, wooLineItems, shippingLine, merchantReference, siteUrl } = params;
  const currency = currencyForCountry(payload.shipping.country || payload.billing.country);
  const b = payload.billing;
  const s = payload.shipping;

  const consumer = {
    email: b.email?.trim() || undefined,
    givenNames: b.first_name?.trim() || "Customer",
    surname: b.last_name?.trim() || ".",
    phoneNumber: b.phone?.trim() || undefined,
  };

  const billing = addrBlock(
    b.first_name,
    b.last_name,
    b.address_1,
    b.address_2,
    b.city,
    b.state,
    b.postcode,
    normalizeCountry(b.country),
    b.phone,
  );
  const shipping = addrBlock(
    s.first_name,
    s.last_name,
    s.address_1,
    s.address_2,
    s.city,
    s.state,
    s.postcode,
    normalizeCountry(s.country),
    s.phone || b.phone,
  );

  const items: Array<{
    name: string;
    sku?: string;
    quantity: number;
    price: { amount: string; currency: string };
  }> = [];

  wooLineItems.forEach((li, idx) => {
    const cartLine = payload.cart_items?.[idx] as { name?: string; sku?: unknown } | undefined;
    const lineTotal = Number.parseFloat(String(li.subtotal ?? li.total ?? "0"));
    const qty = Math.max(1, li.quantity);
    const unit = Number((lineTotal / qty).toFixed(2));
    items.push({
      name:
        (typeof cartLine?.name === "string" && cartLine.name.trim()) ||
        `Product ${li.product_id}`,
      sku:
        (typeof cartLine?.sku === "string" && cartLine.sku.trim()) ||
        String(li.product_id),
      quantity: qty,
      price: {
        amount: unit.toFixed(2),
        currency,
      },
    });
  });

  if (payload.insurance_option === "yes") {
    items.push({
      name: "Parcel Protection",
      sku: "parcel-protection",
      quantity: 1,
      price: {
        amount: PARCEL_PROTECTION_FEE_AUD.toFixed(2),
        currency,
      },
    });
  }

  const discountAmount = totals.discount.toFixed(2);
  const shippingAmount = totals.shipping.toFixed(2);
  const taxAmount = totals.gst.toFixed(2);
  const totalAmount = totals.total.toFixed(2);

  const origin = siteUrl.replace(/\/$/, "");

  return {
    amount: { amount: totalAmount, currency },
    consumer,
    billing,
    shipping,
    items,
    merchant: {
      redirectConfirmUrl: `${origin}/afterpay/success`,
      redirectCancelUrl: `${origin}/afterpay/cancel`,
      popupOriginUrl: origin,
    },
    merchantReference,
    taxAmount: { amount: taxAmount, currency },
    shippingAmount: { amount: shippingAmount, currency },
    discountAmount: { amount: discountAmount, currency },
  };
}

function normalizeCountry(country: string | undefined): string {
  const c = String(country || "")
    .trim()
    .toUpperCase();
  if (!c) return "AU";
  if (c === "AUSTRALIA") return "AU";
  if (c.length === 2) return c;
  return "AU";
}
