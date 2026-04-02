import type { CheckoutInitiatePayload, CheckoutTotals } from "@/types/checkout";
import type { CartItem as LocalCartItem } from "@/lib/types/cart";
import { calculateGST, calculateTotal } from "@/lib/cart-utils";
import { syncCartToWooCommerce } from "@/lib/cart-sync";
import { PARCEL_PROTECTION_FEE_AUD } from "@/lib/checkout-parcel-protection";

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

function normCountry(v?: string): string {
  const c = String(v || "").trim().toUpperCase();
  if (!c) return "AU";
  if (c === "AUSTRALIA") return "AU";
  return c;
}

export async function validateAndRecalculateCheckout(payload: CheckoutInitiatePayload): Promise<{
  validatedLineItems: Array<{ product_id: number; variation_id?: number; quantity: number }>;
  shippingLine: { method_id: string; method_title: string; total: string };
  totals: CheckoutTotals;
}> {
  const toItemKey = (productId: number, variationId?: number) =>
    `${productId}:${variationId ?? 0}`;

  const cartItems: LocalCartItem[] = payload.line_items.map((li) => ({
    id: `${li.product_id}${li.variation_id ? `:${li.variation_id}` : ""}`,
    productId: li.product_id,
    variationId: li.variation_id,
    name: "",
    slug: "",
    price: "0",
    qty: li.quantity,
    sku: null,
  }));

  const sync = await syncCartToWooCommerce(cartItems, payload.coupon_code);
  if (!sync?.items?.length) {
    throw new Error("Unable to validate cart with WooCommerce.");
  }

  const requestedKeys = new Set(
    payload.line_items.map((li) => toItemKey(li.product_id, li.variation_id))
  );
  const validatedKeys = new Set(
    sync.items.map((li) => toItemKey(li.product_id, li.variation_id))
  );
  const hasUnavailableItems = [...requestedKeys].some((k) => !validatedKeys.has(k));
  if (hasUnavailableItems) {
    throw new Error(
      "Some cart items are no longer available. Please refresh your cart and try again."
    );
  }

  const validatedLineItems = sync.items.map((it) => ({
    product_id: it.product_id,
    variation_id: it.variation_id,
    quantity: it.quantity,
  }));

  const subtotal = Number.parseFloat(String(sync.subtotal || "0")) || 0;
  const discount = Number.parseFloat(String(sync.discount_total || "0")) || 0;

  const shippingRatesRes = await fetch(
    `${baseUrl()}/api/shipping/rates?country=${encodeURIComponent(
      normCountry(payload.shipping.country)
    )}&state=${encodeURIComponent(payload.shipping.state || "")}&postcode=${encodeURIComponent(
      payload.shipping.postcode
    )}&city=${encodeURIComponent(payload.shipping.city || "")}&subtotal=${encodeURIComponent(
      String(subtotal)
    )}&items=${encodeURIComponent(JSON.stringify(validatedLineItems))}`,
    { cache: "no-store" }
  );

  if (!shippingRatesRes.ok) {
    throw new Error("Failed to verify shipping rates.");
  }
  const ratesData: any = await shippingRatesRes.json().catch(() => ({}));
  const rates = Array.isArray(ratesData?.rates) ? ratesData.rates : [];
  const selectedRate = rates.find((r: any) => String(r.id) === String(payload.shipping_method_id));
  if (!selectedRate || typeof selectedRate.cost !== "number") {
    throw new Error("Selected shipping method is no longer available.");
  }

  const shipping = Number(selectedRate.cost || 0);
  const insuranceFee = payload.insurance_option === "yes" ? PARCEL_PROTECTION_FEE_AUD : 0;
  const gst = calculateGST(subtotal, shipping, discount, insuranceFee);
  const total = calculateTotal(subtotal, shipping, discount, gst, insuranceFee);
  const totals: CheckoutTotals = {
    subtotal,
    shipping,
    discount,
    gst,
    total,
    totalCents: Math.round(total * 100),
  };
  if (totals.totalCents <= 0) {
    throw new Error(
      "Your cart total is zero after validation. Please refresh your cart and remove unavailable items."
    );
  }

  return {
    validatedLineItems,
    shippingLine: {
      method_id: selectedRate.id,
      method_title: selectedRate.label || selectedRate.id,
      total: shipping.toFixed(2),
    },
    totals,
  };
}

