import type { CheckoutInitiatePayload, CheckoutTotals } from "@/types/checkout";
import { calculateGST, calculateTotal } from "@/lib/cart/pricing";
import { PARCEL_PROTECTION_FEE_AUD } from "@/lib/checkout-parcel-protection";
import { computeShippingRates } from "@/lib/shipping-rates-server";
import { resolveWooLineItems } from "@/lib/woo/resolveLineItems";
import { logRequestedItems, logWooBaseUrl } from "@/lib/woo/debugLogger";
import { wcGet } from "@/lib/woocommerce/wc-fetch";

function normCountry(v?: string): string {
  const c = String(v || "")
    .trim()
    .toUpperCase();
  if (!c) return "AU";
  if (c === "AUSTRALIA") return "AU";
  return c;
}

export async function validateAndRecalculateCheckout(payload: CheckoutInitiatePayload): Promise<{
  validatedLineItems: Array<{ product_id: number; variation_id?: number; quantity: number }>;
  shippingLine: { method_id: string; method_title: string; total: string };
  totals: CheckoutTotals;
}> {
  const toItemKey = (productId: number, variationId?: number) => `${productId}:${variationId ?? 0}`;

  logWooBaseUrl();
  logRequestedItems(
    payload.line_items.map((li) => ({
      sku: typeof li.sku === "string" ? li.sku : undefined,
      product_id: li.product_id,
      variation_id: li.variation_id,
      quantity: li.quantity,
    }))
  );

  const resolved = await resolveWooLineItems(
    payload.line_items.map((li) => ({
      sku: li.sku,
      product_id: li.product_id,
      variation_id: li.variation_id,
      quantity: li.quantity,
    }))
  );
  if (resolved.ok === false) {
    const err = new Error(
      "Some cart items are no longer available. Please refresh your cart and try again."
    );
    (err as any).data = {
      type: "cart_items_unavailable",
      missing: resolved.unavailableItems.map((it) => ({
        product_id: it.product_id,
        variation_id: it.variation_id,
      })),
      details: resolved.unavailableItems,
    };
    throw err;
  }

  const validatedLineItems = resolved.line_items.map((it) => ({
    product_id: it.product_id,
    variation_id: it.variation_id,
    quantity: it.quantity,
  }));

  const unitPrices = await Promise.all(
    validatedLineItems.map(async (li) => {
      const path = li.variation_id
        ? `/products/${li.product_id}/variations/${li.variation_id}`
        : `/products/${li.product_id}`;
      const { data } = await wcGet<Record<string, unknown>>(path, undefined, "noStore");
      const p = data || {};
      const unit = Number.parseFloat(String(p.price ?? "0")) || 0;
      const taxClass = String(p.tax_class ?? "");
      const taxStatus = String(p.tax_status ?? "");
      const cls = taxClass.trim().toLowerCase().replace(/[\s_]+/g, "-");
      const status = taxStatus.trim().toLowerCase().replace(/[\s_]+/g, "-");
      const taxable = !(status === "none" || cls === "gst-free" || cls === "gstfree");
      return {
        key: toItemKey(li.product_id, li.variation_id),
        unit,
        qty: li.quantity,
        taxable,
      };
    })
  );

  const subtotal = unitPrices.reduce((sum, row) => sum + row.unit * row.qty, 0);
  const taxableSubtotal = unitPrices.reduce(
    (sum, row) => (row.taxable ? sum + row.unit * row.qty : sum),
    0
  );

  let discount = 0;
  if (payload.coupon_code) {
    try {
      const couponRes = await wcGet<unknown[]>(
        "/coupons",
        { code: payload.coupon_code, per_page: 1 },
        "noStore",
      );
      const coupon = Array.isArray(couponRes.data) ? couponRes.data[0] : null;
      if (coupon && typeof coupon === "object" && coupon !== null) {
        const c = coupon as { amount?: unknown; discount_type?: unknown };
        const amount = Number.parseFloat(String(c.amount || "0")) || 0;
        const type = String(c.discount_type || "");
        if (type === "percent") {
          discount = (subtotal * amount) / 100;
        } else if (type === "fixed_cart") {
          discount = amount;
        } else if (type === "fixed_product") {
          const qtyTotal = validatedLineItems.reduce((n, li) => n + li.quantity, 0);
          discount = amount * qtyTotal;
        }
      }
    } catch {
      discount = 0;
    }
  }
  if (discount > subtotal) discount = subtotal;

  const { rates } = await computeShippingRates({
    country: normCountry(payload.shipping.country),
    state: payload.shipping.state || "",
    postcode: payload.shipping.postcode || "",
    city: payload.shipping.city || "",
    cartSubtotal: subtotal,
  });
  const selectedRate = rates.find((r: any) => String(r.id) === String(payload.shipping_method_id));
  if (!selectedRate || typeof selectedRate.cost !== "number") {
    throw new Error("Selected shipping method is no longer available.");
  }

  const shipping = Number(selectedRate.cost || 0);
  const insuranceFee = payload.insurance_option === "yes" ? PARCEL_PROTECTION_FEE_AUD : 0;
  const gst = calculateGST(subtotal, shipping, discount, 0, taxableSubtotal);
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
