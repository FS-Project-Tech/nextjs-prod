import { INSURANCE_OPTION_META_KEY } from "@/lib/checkout-parcel-protection";
import {
  appendParcelProtectionFee,
  createValidatedCheckoutOrder,
  extractWooOrderId,
  extractWooOrderKey,
  getWooOrder,
} from "@/lib/services/wooService";
import { handlePayment } from "@/lib/services/paymentService";
import type { CheckoutActor, CheckoutInitiatePayload } from "@/types/checkout";

function normalizeCountry(country: string | undefined): string {
  const c = String(country || "")
    .trim()
    .toUpperCase();
  if (!c) return "AU";
  if (c === "AUSTRALIA") return "AU";
  return c;
}

export type WooCheckoutExecuteResult =
  | { kind: "cod"; orderIdRaw: string | number | bigint; orderKey: string }
  | { kind: "eway"; orderIdRaw: string | number | bigint; orderKey: string; redirectUrl: string };

/**
 * Creates the WooCommerce order, optional parcel protection fee, then eWAY redirect or COD completion.
 * Used by both synchronous create-order and deferred background sync.
 */
export async function executeWooCheckoutOrder(input: {
  payload: CheckoutInitiatePayload;
  validatedLineItems: Array<{ product_id: number; variation_id?: number; quantity: number }>;
  shippingLine: { method_id: string; method_title: string; total: string };
  actor: CheckoutActor;
  customerIp?: string;
}): Promise<WooCheckoutExecuteResult> {
  const { payload, validatedLineItems, shippingLine, actor, customerIp } = input;
  const isCod = payload.payment_method === "cod";
  const paymentTitle = isCod ? "On Account" : "Credit Card (eWAY)";
  const orderStatus = isCod ? "processing" : "pending";

  const order = await createValidatedCheckoutOrder({
    payment_method: payload.payment_method,
    payment_method_title: paymentTitle,
    set_paid: false,
    status: orderStatus,
    customer_id: typeof actor.userId === "number" && actor.userId > 0 ? actor.userId : undefined,
    line_items: validatedLineItems,
    billing: {
      ...payload.billing,
      country: normalizeCountry(payload.billing.country),
    },
    shipping: {
      ...payload.shipping,
      country: normalizeCountry(payload.shipping.country),
    },
    shipping_line: shippingLine,
    coupon_code: payload.coupon_code,
    meta_data: [
      ...(payload.ndis_type ? [{ key: "ndis_type", value: payload.ndis_type }] : []),
      {
        key: INSURANCE_OPTION_META_KEY,
        value: payload.insurance_option === "yes" ? "yes" : "no",
      },
      {
        key: "headless_payment_method",
        value: payload.payment_method,
      },
    ],
  });

  const orderIdRaw = extractWooOrderId(order);
  if (orderIdRaw == null) {
    throw new Error("WooCommerce did not return an order ID.");
  }

  const postIdNum =
    typeof orderIdRaw === "number" ? orderIdRaw : Number.parseInt(String(orderIdRaw), 10);
  const postId = Number.isFinite(postIdNum) && postIdNum > 0 ? postIdNum : null;

  if (postId != null && payload.insurance_option === "yes") {
    try {
      await appendParcelProtectionFee(postId);
    } catch (feeErr) {
      console.warn("[executeWooCheckout] parcel protection fee failed", feeErr);
    }
  }

  let orderForPayment: unknown = order;
  if (postId != null) {
    try {
      orderForPayment = await getWooOrder(String(postId));
    } catch (refetchErr) {
      console.warn("[executeWooCheckout] order refetch failed; using create response", refetchErr);
    }
  }

  const orderKey = extractWooOrderKey(orderForPayment);
  if (!orderKey) {
    throw new Error("WooCommerce did not return order_key for this order.");
  }

  if (isCod) {
    return { kind: "cod", orderIdRaw, orderKey };
  }

  if (payload.payment_method !== "eway") {
    throw new Error("Invalid payment method.");
  }

  const paymentResult = await handlePayment({
    method: "eway",
    order: orderForPayment,
    payload,
    customerIp,
    actorUserId: typeof actor.userId === "number" ? actor.userId : undefined,
  });

  if (paymentResult.type === "error") {
    throw new Error(paymentResult.message);
  }

  return {
    kind: "eway",
    orderIdRaw,
    orderKey,
    redirectUrl: paymentResult.url,
  };
}
