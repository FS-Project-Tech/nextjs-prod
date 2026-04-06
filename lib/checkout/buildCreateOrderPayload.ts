import type { CartItem } from "@/lib/types/cart";
import type { CheckoutFormData, ShippingMethodType } from "./schema";

function jsonInfoBlock(record: Record<string, unknown>): string | undefined {
  const entries = Object.entries(record).filter(
    ([, v]) => v !== undefined && v !== "" && v !== false && v !== null,
  );
  if (entries.length === 0) return undefined;
  try {
    return JSON.stringify(Object.fromEntries(entries));
  } catch {
    return undefined;
  }
}

function ndisInfoFromForm(data: CheckoutFormData): string | undefined {
  return jsonInfoBlock({
    number: data.cust_woo_ndis_number || data.ndis_number,
    participant_name: data.cust_woo_ndis_participant_name || data.ndis_participant_name,
    dob: data.cust_woo_ndis_dob || data.ndis_dob,
    funding_type: data.cust_woo_ndis_funding_type || data.ndis_funding_type,
    invoice_email: data.cust_woo_invoice_email || data.billing_ndis_invoice_email,
    approval: data.cust_woo_ndis_approval ?? data.ndis_approval,
  });
}

function hcpInfoFromForm(data: CheckoutFormData): string | undefined {
  return jsonInfoBlock({
    participant_name: data.cust_woo_hcp_participant_name || data.hcp_participant_name,
    number: data.cust_woo_hcp_number || data.hcp_number,
    provider_email: data.cust_woo_provider_email || data.hcp_provider_email,
    approval: data.cust_woo_hcp_approval ?? data.hcp_approval,
  });
}

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
    /** Store API COD expects `payment_data: []`; kept on payload for parity and future direct Store calls. */
    payment_data: [] as unknown[],
    coupon_code: appliedCouponCode || couponFromUrl || undefined,
    insurance_option: data.insurance_option === "yes" ? "yes" : "no",
    ndis_type: (data.cust_woo_ndis_funding_type ?? data.ndis_funding_type) || undefined,
    ndis_info: ndisInfoFromForm(data),
    hcp_info: hcpInfoFromForm(data),
    delivery_authority: data.deliveryAuthority || undefined,
    no_paperwork: data.doNotSendPaperwork === true,
    discreet_packaging: data.discreetPackaging === true,
    newsletter: data.subscribe_newsletter === true,
    delivery_notes: data.deliveryInstructions?.trim() || undefined,
  };
}
