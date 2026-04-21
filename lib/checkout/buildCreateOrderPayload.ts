import type { CartItem } from "@/lib/types/cart";
import {
  buildHcpInfoJsonFromForm,
  buildNdisInfoJsonFromForm,
  normalizeNdisFundingType,
} from "@/lib/checkout/ndisHcpPayload";
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

export function lineItemsFromCart(cartLines: CartItem[]) {
  return cartLines.map((line) => {
    const sku =
      line.sku != null && String(line.sku).trim() !== "" ? String(line.sku).trim() : undefined;
    const productId = Number(line.productId);
    const variationRaw = line.variationId != null ? Number(line.variationId) : NaN;
    const unitFromCart = Number.parseFloat(String(line.price ?? "").trim());
    const unit_price =
      Number.isFinite(unitFromCart) && unitFromCart > 0 ? unitFromCart : undefined;
    return {
      ...(sku ? { sku } : {}),
      ...(Number.isFinite(productId) && productId > 0 ? { product_id: productId } : {}),
      ...(Number.isFinite(variationRaw) && variationRaw > 0 ? { variation_id: variationRaw } : {}),
      quantity: line.qty,
      ...(unit_price != null ? { unit_price } : {}),
    };
  });
}

export function buildCheckoutQuoteTotalsBody(params: {
  data: CheckoutFormData;
  cartLines: CartItem[];
  appliedCoupon: { code: string } | null;
}): Record<string, unknown> | null {
  const { data, cartLines, appliedCoupon } = params;
  const sm = data.shippingMethod as ShippingMethodType | undefined;
  if (!sm?.id) return null;
  const destination = data.shipToDifferentAddress ? shippingBlock(data) : billingBlock(data);
  return {
    line_items: lineItemsFromCart(cartLines),
    shipping_method_id: sm.id,
    shipping: {
      country: destination.country || "AU",
      state: destination.state || "",
      postcode: destination.postcode || "",
      city: destination.city || "",
    },
    coupon_code: appliedCoupon?.code?.trim() || undefined,
    insurance_option: data.insurance_option === "yes" ? "yes" : "no",
  };
}

export function buildCreateOrderPayload(params: {
  data: CheckoutFormData;
  cartLines: CartItem[];
  paymentMethod: "eway" | "cod";
  appliedCouponCode?: string | null;
  couponFromUrl?: string | null;
  /** Stable UUID per browser tab/session for idempotent Woo checkout. */
  checkoutSessionId?: string | null;
}): Record<string, unknown> {
  const { data, cartLines, paymentMethod, appliedCouponCode, couponFromUrl, checkoutSessionId } =
    params;
  const billing = billingBlock(data);
  const shippingRaw = shippingBlock(data);
  const destination = data.shipToDifferentAddress ? shippingRaw : billing;
  const shippingMethod = data.shippingMethod as ShippingMethodType | undefined;

  const body: Record<string, unknown> = {
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
    /** Needed for delivery plan → Woo line meta (COD + eWAY). eWAY still validates these server-side. */
    cart_items: cartLines,
    shipping_method_id: shippingMethod?.id,
    payment_method: paymentMethod,
    /** Store API COD expects `payment_data: []`; kept on payload for parity and future direct Store calls. */
    payment_data: [] as unknown[],
    coupon_code: appliedCouponCode || couponFromUrl || undefined,
    insurance_option: data.insurance_option === "yes" ? "yes" : "no",
    ndis_type: normalizeNdisFundingType(data.cust_woo_ndis_funding_type ?? data.ndis_funding_type),
    ndis_info: buildNdisInfoJsonFromForm(data),
    hcp_info: buildHcpInfoJsonFromForm(data),
    delivery_authority: data.deliveryAuthority || undefined,
    no_paperwork: data.doNotSendPaperwork === true,
    discreet_packaging: data.discreetPackaging === true,
    newsletter: data.subscribe_newsletter === true,
    delivery_notes: data.deliveryInstructions?.trim() || undefined,
  };

  const sid = typeof checkoutSessionId === "string" ? checkoutSessionId.trim() : "";
  if (sid) {
    body.checkout_session_id = sid;
  }

  return body;
}
