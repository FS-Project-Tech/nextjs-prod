import type { CartItem } from "@/lib/types/cart";
import type { CheckoutFormData, ShippingMethodType } from "./schema";

function billingBlock(data: CheckoutFormData) {
  return {
    first_name: data.billing_first_name || "",
    last_name: data.billing_last_name || "",
    email: data.billing_email || "",
    phone: data.billing_phone || "",
    company: data.billing_company || "",
    address_1: data.billing_address_1 || "",
    address_2: data.billing_address_2 || "",
    city: data.billing_city || "",
    state: data.billing_state || "",
    postcode: data.billing_postcode || "",
    country: data.billing_country || "AU",
  };
}

function shippingBlock(data: CheckoutFormData) {
  return {
    first_name: data.shipping_first_name || "",
    last_name: data.shipping_last_name || "",
    company: data.shipping_company || "",
    address_1: data.shipping_address_1 || "",
    address_2: data.shipping_address_2 || "",
    city: data.shipping_city || "",
    state: data.shipping_state || "",
    postcode: data.shipping_postcode || "",
    country: data.shipping_country || "AU",
  };
}

function lineItemsFromCart(cartLines: CartItem[]) {
  return cartLines.map((line) => {
    const sku =
      line.sku != null && String(line.sku).trim() !== "" ? String(line.sku).trim() : undefined;
    const productId = Number(line.productId);
    const variationRaw = line.variationId != null ? Number(line.variationId) : NaN;
    return {
      ...(sku ? { sku } : {}),
      ...(Number.isFinite(productId) && productId > 0 ? { product_id: productId } : {}),
      ...(Number.isFinite(variationRaw) && variationRaw > 0 ? { variation_id: variationRaw } : {}),
      quantity: line.qty,
    };
  });
}

export function buildCreateOrderPayload(params: {
  data: CheckoutFormData;
  cartLines: CartItem[];
  paymentMethod: "eway" | "cod";
  appliedCouponCode?: string | null;
  couponFromUrl?: string | null;
}): Record<string, unknown> {
  const { data, cartLines, paymentMethod, appliedCouponCode, couponFromUrl } = params;
  const billing = billingBlock(data);
  const shippingRaw = shippingBlock(data);
  const destination = data.shipToDifferentAddress ? shippingRaw : billing;
  const shippingMethod = data.shippingMethod as ShippingMethodType | undefined;

  return {
    billing,
    shipping: {
      first_name: destination.first_name || "",
      last_name: destination.last_name || "",
      email: billing.email || "",
      phone: billing.phone || "",
      company: destination.company || "",
      address_1: destination.address_1 || "",
      address_2: destination.address_2 || "",
      city: destination.city || "",
      state: destination.state || "",
      postcode: destination.postcode || "",
      country: destination.country || "AU",
    },
    line_items: lineItemsFromCart(cartLines),
    shipping_method_id: shippingMethod?.id,
    payment_method: paymentMethod,
    coupon_code: appliedCouponCode || couponFromUrl || undefined,
    insurance_option: data.insurance_option === "yes" ? "yes" : "no",
    ndis_type: (data.cust_woo_ndis_funding_type ?? data.ndis_funding_type) || undefined,
  };
}
