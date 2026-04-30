// import type { CheckoutInitiatePayload, CheckoutTotals } from "@/types/checkout";
// import { calculateGST, calculateTotal } from "@/lib/cart/pricing";
// import { PARCEL_PROTECTION_FEE_AUD } from "@/lib/checkout-parcel-protection";
// import { computeShippingRates } from "@/lib/shipping-rates-server";
// import { resolveWooLineItems } from "@/lib/woo/resolveLineItems";
// import { logRequestedItems, logWooBaseUrl } from "@/lib/woo/debugLogger";
// import { wcGet } from "@/lib/woocommerce/wc-fetch";
// import { batchFetchCheckoutCatalogLines, catalogLineKey } from "@/lib/woo/batchCheckoutCatalog";
// import { assertCheckoutLineItemsStock, CheckoutStockError } from "@/lib/woo/stockCheck";
// import type { WooLineItem } from "@/services/woocommerce";

// function normCountry(v?: string): string {
//   const c = String(v || "")
//     .trim()
//     .toUpperCase();
//   if (!c) return "AU";
//   if (c === "AUSTRALIA") return "AU";
//   return c;
// }

// /**
//  * Validates cart, stock, and shipping selection. `totals` is an **estimate for UI / shipping rules** only.
//  * **Authoritative amount for payment is always WooCommerce `order.total` after the order is created.**
//  */
// export async function validateAndRecalculateCheckout(payload: CheckoutInitiatePayload): Promise<{
//   validatedLineItems: Array<{ product_id: number; variation_id?: number; quantity: number }>;
//   /** Plain line items for Woo REST — Woo computes line and order totals from the catalog. */
//   wooLineItems: WooLineItem[];
//   shippingLine: { method_id: string; method_title: string; total: string };
//   /** Display / UX estimate — do not use for eWAY; use Woo order total after POST /orders. */
//   totals: CheckoutTotals;
// }> {
//   const toItemKey = (productId: number, variationId?: number) => `${productId}:${variationId ?? 0}`;

//   logWooBaseUrl();
//   logRequestedItems(
//     payload.line_items.map((li) => ({
//       sku: typeof li.sku === "string" ? li.sku : undefined,
//       product_id: li.product_id,
//       variation_id: li.variation_id,
//       quantity: li.quantity,
//     }))
//   );

//   const resolved = await resolveWooLineItems(
//     payload.line_items.map((li) => ({
//       sku: li.sku,
//       product_id: li.product_id,
//       variation_id: li.variation_id,
//       quantity: li.quantity,
//     }))
//   );
//   if (resolved.ok === false) {
//     const err = new Error(
//       "Some cart items are no longer available. Please refresh your cart and try again."
//     );
//     (err as any).data = {
//       type: "cart_items_unavailable",
//       missing: resolved.unavailableItems.map((it) => ({
//         product_id: it.product_id,
//         variation_id: it.variation_id,
//       })),
//       details: resolved.unavailableItems,
//     };
//     throw err;
//   }

//   const validatedLineItems = resolved.line_items.map((it) => ({
//     product_id: it.product_id,
//     variation_id: it.variation_id,
//     quantity: it.quantity,
//   }));

//   const catalog = await batchFetchCheckoutCatalogLines(validatedLineItems);

//   try {
//     await assertCheckoutLineItemsStock(validatedLineItems, { catalog });
//   } catch (e) {
//     if (e instanceof CheckoutStockError) {
//       const err = new Error(e.message);
//       (err as { data?: unknown }).data = {
//         type: "insufficient_stock",
//         product_id: e.productId,
//         variation_id: e.variationId ?? null,
//       };
//       throw err;
//     }
//     throw e;
//   }

//   const unitPrices = validatedLineItems.map((li) => {
//     const key = catalogLineKey(li.product_id, li.variation_id);
//     const p = catalog.get(key);
//     if (!p) {
//       throw new Error(
//         `Missing Woo catalog data for product ${li.product_id}` +
//           (li.variation_id ? ` variation ${li.variation_id}` : "") +
//           ".",
//       );
//     }
//     const unit = Number.parseFloat(String(p.price ?? "0")) || 0;
//     const taxClass = String(p.tax_class ?? "");
//     const taxStatus = String(p.tax_status ?? "");
//     const cls = taxClass.trim().toLowerCase().replace(/[\s_]+/g, "-");
//     const status = taxStatus.trim().toLowerCase().replace(/[\s_]+/g, "-");
//     const taxable = !(status === "none" || cls === "gst-free" || cls === "gstfree");
//     return {
//       key: toItemKey(li.product_id, li.variation_id),
//       unit,
//       qty: li.quantity,
//       taxable,
//     };
//   });

//   const subtotal = unitPrices.reduce((sum, row) => sum + row.unit * row.qty, 0);
//   const taxableSubtotal = unitPrices.reduce(
//     (sum, row) => (row.taxable ? sum + row.unit * row.qty : sum),
//     0
//   );

//   let discount = 0;
//   if (payload.coupon_code) {
//     try {
//       const couponRes = await wcGet<unknown[]>(
//         "/coupons",
//         { code: payload.coupon_code, per_page: 1 },
//         "noStore",
//       );
//       const coupon = Array.isArray(couponRes.data) ? couponRes.data[0] : null;
//       if (coupon && typeof coupon === "object" && coupon !== null) {
//         const c = coupon as { amount?: unknown; discount_type?: unknown };
//         const amount = Number.parseFloat(String(c.amount || "0")) || 0;
//         const type = String(c.discount_type || "");
//         if (type === "percent") {
//           discount = (subtotal * amount) / 100;
//         } else if (type === "fixed_cart") {
//           discount = amount;
//         } else if (type === "fixed_product") {
//           const qtyTotal = validatedLineItems.reduce((n, li) => n + li.quantity, 0);
//           discount = amount * qtyTotal;
//         }
//       }
//     } catch {
//       discount = 0;
//     }
//   }
//   if (discount > subtotal) discount = subtotal;

//   const { rates } = await computeShippingRates({
//     country: normCountry(payload.shipping.country),
//     state: payload.shipping.state || "",
//     postcode: payload.shipping.postcode || "",
//     city: payload.shipping.city || "",
//     cartSubtotal: subtotal,
//   });
//   const selectedRate = rates.find((r: any) => String(r.id) === String(payload.shipping_method_id));
//   if (!selectedRate || typeof selectedRate.cost !== "number") {
//     throw new Error("Selected shipping method is no longer available.");
//   }

//   const shipping = Number(selectedRate.cost || 0);
//   const insuranceFee = payload.insurance_option === "yes" ? PARCEL_PROTECTION_FEE_AUD : 0;
//   const gst = calculateGST(subtotal, shipping, discount, 0, taxableSubtotal);
//   const total = calculateTotal(subtotal, shipping, discount, gst, insuranceFee);
//   const totals: CheckoutTotals = {
//     subtotal,
//     shipping,
//     discount,
//     gst,
//     total,
//     totalCents: Math.round(total * 100),
//   };
//   if (totals.totalCents <= 0) {
//     throw new Error(
//       "Your cart total is zero after validation. Please refresh your cart and remove unavailable items."
//     );
//   }

//   const wooLineItems: WooLineItem[] = validatedLineItems.map((li) => {
//     const base: WooLineItem = {
//       product_id: li.product_id,
//       quantity: li.quantity,
//     };
//     if (li.variation_id != null && li.variation_id > 0) {
//       base.variation_id = li.variation_id;
//     }
//     return base;
//   });

//   return {
//     validatedLineItems,
//     wooLineItems,
//     shippingLine: {
//       method_id: selectedRate.id,
//       method_title: selectedRate.label || selectedRate.id,
//       total: shipping.toFixed(2),
//     },
//     totals,
//   };
// }


//D:\stage-joya\nextjs-stage\utils\checkout-pricing.ts

import type { CheckoutInitiatePayload, CheckoutTotals } from "@/types/checkout";
import type { CheckoutQuoteTotalsInput } from "@/lib/checkout/initiatePayload";
import { calculateGST, calculateTotal } from "@/lib/cart/pricing";
import { PARCEL_PROTECTION_FEE_AUD } from "@/lib/checkout-parcel-protection";
import type { ComputedShippingRate } from "@/lib/shipping-rates-server";
import { computeShippingRates } from "@/lib/shipping-rates-server";
import { resolveWooLineItems } from "@/lib/woo/resolveLineItems";
import { splitWooZoneShippingMethodId } from "@/lib/woo/shippingMethodIds";
import type { WooLineItem } from "@/services/woocommerce";
import { catalogLineKey } from "@/lib/woo/batchCheckoutCatalog";
import { fetchCheckoutCatalogCached } from "@/lib/woo/checkoutCatalogCache";
import { logRequestedItems, logWooBaseUrl } from "@/lib/woo/debugLogger";
import { wcGet } from "@/lib/woocommerce/wc-fetch";
import { categoryIdsFromCatalogProduct } from "@/lib/coupon/wooCouponEligibility";
import { computeWooCouponDiscount } from "@/lib/coupon/computeWooCouponDiscount";
import { wooCouponOrderGate } from "@/lib/coupon/wooCouponOrderGate";

function normCountry(v?: string): string {
  const c = String(v || "")
    .trim()
    .toUpperCase();
  if (!c) return "AU";
  if (c === "AUSTRALIA") return "AU";
  return c;
}

/** Match UI selection to recomputed rates (exact id, then Woo method_id + instance_id). */
function findSelectedShippingRate(
  rates: ComputedShippingRate[],
  shippingMethodId: string,
): ComputedShippingRate | undefined {
  const want = String(shippingMethodId || "").trim();
  if (!want) return undefined;

  const exact = rates.find((r) => String(r.id).trim() === want);
  if (exact) return exact;

  const wantParts = splitWooZoneShippingMethodId(want);
  return rates.find((r) => {
    const got = splitWooZoneShippingMethodId(String(r.id));
    if (got.method_id !== wantParts.method_id) return false;
    if (!wantParts.instance_id) return true;
    return got.instance_id === wantParts.instance_id;
  });
}

/** Placeholder billing/shipping so {@link validateAndRecalculateCheckout} can run for quote-only (rates need a locale). */
function checkoutPayloadForQuote(input: CheckoutQuoteTotalsInput): CheckoutInitiatePayload {
  const country = normCountry(input.shipping.country);
  const city = String(input.shipping.city || "").trim() || "Sydney";
  const state = String(input.shipping.state || "").trim();
  const postcode = String(input.shipping.postcode || "").trim();
  const base = {
    first_name: "Quote",
    last_name: "Totals",
    email: "quote@invalid.local",
    phone: "",
    company: "",
    address_1: "1 Quote Street",
    address_2: "",
    city,
    state,
    postcode,
    country,
  };
  return {
    billing: base,
    shipping: base,
    line_items: input.line_items as CheckoutInitiatePayload["line_items"],
    shipping_method_id: input.shipping_method_id,
    payment_method: "eway",
    coupon_code: input.coupon_code?.trim() || undefined,
    insurance_option: input.insurance_option ?? "no",
  };
}

/** Same numbers as order creation / eWAY path — for checkout UI preview. */
export async function quoteCheckoutTotals(
  input: CheckoutQuoteTotalsInput,
  options?: ValidateCheckoutPricingOptions,
): Promise<{
  validatedLineItems: Array<{ product_id: number; variation_id?: number; quantity: number }>;
  wooLineItems: WooLineItem[];
  shippingLine: {
    method_id: string;
    method_title: string;
    total: string;
    instance_id?: string;
  };
  totals: CheckoutTotals;
  /** True when subtotal was below the selected method's minimum and a different rate was applied. */
  shippingAdjusted: boolean;
}> {
  return validateAndRecalculateCheckout(checkoutPayloadForQuote(input), options);
}

export type ValidateCheckoutPricingOptions = {
  requestId?: string;
  currency?: string;
  customerType?: string;
};

export async function validateAndRecalculateCheckout(
  payload: CheckoutInitiatePayload,
  options?: ValidateCheckoutPricingOptions,
): Promise<{
  validatedLineItems: Array<{ product_id: number; variation_id?: number; quantity: number }>;
  wooLineItems: WooLineItem[];
  shippingLine: {
    method_id: string;
    method_title: string;
    total: string;
    instance_id?: string;
  };
  totals: CheckoutTotals;
  /** True when subtotal was below the selected method's minimum and a different rate was applied. */
  shippingAdjusted: boolean;
}> {
  let batchHits = 0;
  let batchMiss = 0;
  const toItemKey = (productId: number, variationId?: number) => `${productId}:${variationId ?? 0}`;

  logWooBaseUrl();
  logRequestedItems(
    payload.line_items.map((li) => ({
      sku: typeof li.sku === "string" ? li.sku : undefined,
      product_id: li.product_id,
      variation_id: li.variation_id,
      quantity: li.quantity,
      unit_price: li.unit_price,
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

  let catalog = new Map<string, Record<string, unknown>>();
  try {
    catalog = await fetchCheckoutCatalogCached(validatedLineItems, {
      currency: options?.currency,
      customerType: options?.customerType,
      requestId: options?.requestId,
    });
  } catch (e) {
    console.warn("[checkout-pricing] batch catalog fetch failed, using per-line fallback only", {
      requestId: options?.requestId,
      message: e instanceof Error ? e.message : String(e),
    });
  }

  const unitPrices = await Promise.all(
    validatedLineItems.map(async (li, idx) => {
      const clientUnit = payload.line_items[idx]?.unit_price;
      const mapKey = catalogLineKey(li.product_id, li.variation_id);
      let p: Record<string, unknown>;
      if (catalog.has(mapKey)) {
        batchHits += 1;
        p = (catalog.get(mapKey) as Record<string, unknown>) ?? {};
      } else {
        batchMiss += 1;
        const path = li.variation_id
          ? `/products/${li.product_id}/variations/${li.variation_id}`
          : `/products/${li.product_id}`;
        console.warn("[checkout-pricing] catalog batch miss, fallback wcGet", {
          path,
          mapKey,
          requestId: options?.requestId,
        });
        const { data } = await wcGet<Record<string, unknown>>(path, undefined, "noStore");
        p = data || {};
      }

      const wooUnit = Number.parseFloat(String(p.price ?? "0")) || 0;
      const unit =
        typeof clientUnit === "number" && Number.isFinite(clientUnit) && clientUnit > 0
          ? clientUnit
          : wooUnit;
      const taxClass = String(p.tax_class ?? "");
      const taxStatus = String(p.tax_status ?? "");
      const cls = taxClass.trim().toLowerCase().replace(/[\s_]+/g, "-");
      const status = taxStatus.trim().toLowerCase().replace(/[\s_]+/g, "-");
      const taxable = !(status === "none" || cls === "gst-free" || cls === "gstfree");
      const onSale = Boolean(p.on_sale);
      const categoryIds = categoryIdsFromCatalogProduct(p);
      return {
        key: toItemKey(li.product_id, li.variation_id),
        unit,
        qty: li.quantity,
        taxable,
        on_sale: onSale,
        categoryIds,
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
        const c = coupon as Record<string, unknown>;
        const pricedLines = validatedLineItems.map((li, idx) => {
          const up = unitPrices[idx];
          return {
            product_id: li.product_id,
            ...(li.variation_id != null && li.variation_id > 0
              ? { variation_id: li.variation_id }
              : {}),
            quantity: li.quantity,
            unit: up?.unit ?? 0,
            on_sale: up?.on_sale ?? false,
            category_ids: up?.categoryIds ?? [],
          };
        });
        const gate = wooCouponOrderGate(c, subtotal);
        if (gate.ok) {
          const { discount: d } = computeWooCouponDiscount(c, pricedLines);
          discount = d;
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
  const selectedRate = findSelectedShippingRate(rates, payload.shipping_method_id);
  let finalRate = selectedRate;

  if (!finalRate || typeof finalRate.cost !== "number") {
    finalRate = rates[0]; // fallback to first available
  }
  
  if (!finalRate) {
    throw new Error("No shipping methods available.");
  }

  const selMin =
  typeof finalRate.minimum_amount === "number"
    ? finalRate.minimum_amount
    : undefined;

let shippingAdjusted = false;

if (selMin !== undefined && selMin > 0 && subtotal < selMin) {
  // fallback to another valid method
  const fallback = rates.find(
    (r) =>
      typeof r.cost === "number" &&
      (!r.minimum_amount || subtotal >= r.minimum_amount)
  );

  if (fallback) {
    finalRate = fallback;
    shippingAdjusted = true;
  }
}

  const shipping = Number(finalRate.cost || 0);
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

  const wooLineItems: WooLineItem[] = validatedLineItems.map((li, idx) => {
    const up = unitPrices[idx];
    const unit = up?.unit ?? 0;
    const lineAmount = Number((unit * li.quantity).toFixed(2));
    const lineStr = lineAmount.toFixed(2);
    const base: WooLineItem = {
      product_id: li.product_id,
      quantity: li.quantity,
      /** Align Woo line math with the same REST catalog prices used for `totals` / UI. */
      subtotal: lineStr,
      total: lineStr,
    };
    if (li.variation_id != null && li.variation_id > 0) {
      base.variation_id = li.variation_id;
    }
    return base;
  });

  const { method_id, instance_id } = splitWooZoneShippingMethodId(String(finalRate.id));

  if (options?.requestId) {
    console.log("[checkout][batch_stats]", options.requestId, { hits: batchHits, miss: batchMiss });
  }

  return {
    validatedLineItems,
    wooLineItems,
    shippingLine: {
      method_id,
      ...(instance_id ? { instance_id } : {}),
      method_title: finalRate.label || finalRate.id,
      total: shipping.toFixed(2),
    },
    totals,
    shippingAdjusted,
  };
}
