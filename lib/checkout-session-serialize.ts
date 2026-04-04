import { INSURANCE_OPTION_META_KEY } from "@/lib/checkout-parcel-protection";
import type { CheckoutSessionPublic, CheckoutSessionRecord } from "@/types/checkout-session";

export function toPublicSession(record: CheckoutSessionRecord): CheckoutSessionPublic {
  const p = record.payload;
  /** Woo (token redeem) must receive server-resolved ids after SKU validation, not stale client ids. */
  const line_items = record.validatedLineItems.map((li, idx) => {
    const origSku = p.line_items[idx]?.sku;
    const sku = typeof origSku === "string" && origSku.trim() !== "" ? origSku.trim() : undefined;
    return {
      product_id: li.product_id,
      quantity: li.quantity,
      ...(li.variation_id ? { variation_id: li.variation_id } : {}),
      ...(sku ? { sku } : {}),
    };
  });
  return {
    billing: p.billing,
    shipping: p.shipping,
    line_items,
    shipping_method_id: p.shipping_method_id,
    shipping_line: record.shippingLine,
    payment_method: p.payment_method,
    coupon_code: p.coupon_code,
    insurance_option: p.insurance_option,
    ndis_type: p.ndis_type,
    totals: record.totals,
    user_id: record.userId,
    meta_data: [
      { key: "ndis_type", value: p.ndis_type || "" },
      {
        key: INSURANCE_OPTION_META_KEY,
        value: p.insurance_option === "yes" ? "yes" : "no",
      },
    ],
  };
}
