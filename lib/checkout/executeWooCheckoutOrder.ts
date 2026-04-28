import { INSURANCE_OPTION_META_KEY, PARCEL_PROTECTION_FEE_AUD } from "@/lib/checkout-parcel-protection";
import {
  extractWooOrderId,
  extractWooOrderKey,
  getWooOrder,
  type OrderExtensionTiming,
} from "@/lib/services/wooService";
import { handlePayment } from "@/lib/services/paymentService";
import type { CheckoutActor, CheckoutInitiatePayload, CheckoutTotals } from "@/types/checkout";
import { readWooOrderTotal } from "@/lib/checkout/readWooOrderTotal";
import {
  upsertValidatedCheckoutOrder,
  assertWooOrderPayable,
} from "@/lib/checkout/upsertWooCheckoutOrder";
import type { WooCreateOrderInput, WooLineItem } from "@/services/woocommerce";
import { updateWooOrder } from "@/services/woocommerce";
import { mergeWooOrderMetaByKey } from "@/lib/woo/orderMeta";
import { HEADLESS_VALIDATED_CHECKOUT_TOTAL_META_KEY } from "@/lib/checkout/checkoutSessionConstants";
import {
  flatHcpOrderMetaRowsFromHcpInfoJson,
  flatNdisOrderMetaRowsFromNdisInfoJson,
} from "@/lib/checkout/ndisHcpPayload";
import { humanReadableAdditionalCheckoutMeta } from "@/lib/checkout/additionalOrderMetaHuman";
 
function normalizeCountry(country: string | undefined): string {
  const c = String(country || "")
    .trim()
    .toUpperCase();
  if (!c) return "AU";
  if (c === "AUSTRALIA") return "AU";
  return c;
}
 
const META_MAX_SHORT = 512;
const META_MAX_JSON_BLOB = 8_000;
const META_MAX_NOTES = 4_000;
 
function trimMetaString(raw: string, max: number): string {
  const t = raw.trim();
  if (!t) return "";
  return t.length > max ? t.slice(0, max) : t;
}
 
/** Keep valid JSON compact; otherwise store a capped raw string (never throw). */
function safeJsonMetaValue(raw: string | undefined, max: number): string | undefined {
  if (raw == null) return undefined;
  const capped = trimMetaString(raw, max);
  if (!capped) return undefined;
  try {
    const parsed = JSON.parse(capped) as unknown;
    const out = JSON.stringify(parsed);
    return out.length > max ? out.slice(0, max) : out;
  } catch {
    return capped;
  }
}
 
function checkoutOrderMeta(payload: CheckoutInitiatePayload): Array<{ key: string; value: unknown }> {
  const rows: Array<{ key: string; value: unknown }> = [];
  const ndisType = trimMetaString(payload.ndis_type ?? "", META_MAX_SHORT);
  if (ndisType) rows.push({ key: "ndis_type", value: ndisType });
  const ndisInfo = safeJsonMetaValue(payload.ndis_info, META_MAX_JSON_BLOB);
  if (ndisInfo) {
    rows.push({ key: "ndis_info", value: ndisInfo });
    rows.push(...flatNdisOrderMetaRowsFromNdisInfoJson(payload.ndis_info, payload.ndis_type));
  }
  const hcpInfo = safeJsonMetaValue(payload.hcp_info, META_MAX_JSON_BLOB);
  if (hcpInfo) {
    rows.push({ key: "hcp_info", value: hcpInfo });
    rows.push(...flatHcpOrderMetaRowsFromHcpInfoJson(payload.hcp_info));
  }
  const deliveryAuth = trimMetaString(payload.delivery_authority ?? "", META_MAX_SHORT);
  if (deliveryAuth) rows.push({ key: "delivery_authority", value: deliveryAuth });
  rows.push(...humanReadableAdditionalCheckoutMeta(payload));
  rows.push({ key: "no_paperwork", value: payload.no_paperwork === true ? "yes" : "no" });
  rows.push({
    key: "discreet_packaging",
    value: payload.discreet_packaging === true ? "yes" : "no",
  });
  if (payload.newsletter === true) rows.push({ key: "newsletter", value: "yes" });
  const notes = trimMetaString(payload.delivery_notes ?? "", META_MAX_NOTES);
  if (notes) rows.push({ key: "delivery_notes", value: notes });
  rows.push({
    key: INSURANCE_OPTION_META_KEY,
    value: payload.insurance_option === "yes" ? "yes" : "no",
  });
  rows.push({ key: "headless_payment_method", value: payload.payment_method });
  return rows;
}
 
export type WooCheckoutExecuteResult =
  | { kind: "cod"; orderIdRaw: string | number | bigint; orderKey: string; wooOrderTotal: string | null }
  | {
      kind: "eway";
      orderIdRaw: string | number | bigint;
      orderKey: string;
      redirectUrl: string;
      paymentReused?: boolean;
      wooOrderTotal: string | null;
    }
  | {
      kind: "eway_error";
      message: string;
      action?: "resume_payment";
      orderIdRaw: string | number | bigint;
      orderKey: string;
      wooOrderTotal: string | null;
    };
 
/**
 * Creates the WooCommerce order, optional parcel protection fee, then eWAY redirect or COD completion.
 * Used by both synchronous create-order and deferred background sync.
 */
export async function executeWooCheckoutOrder(input: {
  payload: CheckoutInitiatePayload;
  wooLineItems: WooLineItem[];
  shippingLine: {
    method_id: string;
    method_title: string;
    total: string;
    instance_id?: string;
  };
  actor: CheckoutActor;
  customerIp?: string;
  /** COD: defer shipping/meta/fees PUT until after the HTTP response (Next `after`). eWAY: inline before payment URL. */
  orderExtensionTiming: OrderExtensionTiming;
  checkoutSessionId: string;
  /** Required for eWAY: server quote used for the gateway amount (not Woo session / stale `order.total`). */
  totals?: CheckoutTotals;
}): Promise<WooCheckoutExecuteResult> {
  const {
    payload,
    wooLineItems,
    shippingLine,
    actor,
    customerIp,
    orderExtensionTiming,
    checkoutSessionId,
    totals: checkoutTotals,
  } = input;
  const isCod = payload.payment_method === "cod";
  if (!isCod && !checkoutTotals) {
    throw new Error("Validated checkout totals are required for card (eWAY) payment.");
  }
  const paymentTitle = isCod ? "On Account" : "Credit Card (eWAY)";
  /** Phase 1: always `pending` + `set_paid: false`. COD → `processing` is applied in phase-2 PUT. */
  const orderStatus = "pending";
 
  const wooInput: WooCreateOrderInput = {
    payment_method: payload.payment_method,
    payment_method_title: paymentTitle,
    set_paid: false,
    status: orderStatus,
    customer_id: typeof actor.userId === "number" && actor.userId > 0 ? actor.userId : undefined,
    line_items: wooLineItems,
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
    fee_lines:
      payload.insurance_option === "yes"
        ? [
            {
              name: "Parcel Protection",
              total: PARCEL_PROTECTION_FEE_AUD.toFixed(2),
              tax_status: "none" as const,
            },
          ]
        : undefined,
    meta_data: checkoutOrderMeta(payload),
  };
 
  let order = await upsertValidatedCheckoutOrder({
    payload,
    input: wooInput,
    timing: orderExtensionTiming,
    checkoutSessionId,
    actor,
    customerIp,
  });
 
  if (orderExtensionTiming.mode === "after_response" && payload.payment_method === "cod") {
    const postIdRaw = extractWooOrderId(order);
    const postIdNum =
      typeof postIdRaw === "number" ? postIdRaw : Number.parseInt(String(postIdRaw), 10);
    if (Number.isFinite(postIdNum) && postIdNum > 0) {
      let validatedDeferred = false;
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 8; attempt++) {
        try {
          const refreshed = await getWooOrder(String(postIdNum));
          assertWooOrderPayable(refreshed);
          order = refreshed;
          validatedDeferred = true;
          break;
        } catch (e) {
          lastErr = e;
          await new Promise((r) => setTimeout(r, 350 + attempt * 150));
        }
      }
      if (!validatedDeferred && lastErr != null) throw lastErr;
    }
  }
 
  const orderIdRaw = extractWooOrderId(order);
  if (orderIdRaw == null) {
    throw new Error("WooCommerce did not return an order ID.");
  }
 
  const postIdNum =
    typeof orderIdRaw === "number" ? orderIdRaw : Number.parseInt(String(orderIdRaw), 10);
  const postId = Number.isFinite(postIdNum) && postIdNum > 0 ? postIdNum : null;
 
  const root = order as Record<string, unknown>;
  const totalRaw = root.total;
  const totalOk =
    (typeof totalRaw === "string" && Number.parseFloat(totalRaw) > 0) ||
    (typeof totalRaw === "number" && Number.isFinite(totalRaw) && totalRaw > 0);
  const keyFromCreate = extractWooOrderKey(order);
 
  let orderForPayment: unknown = order;
  if ((!totalOk || !keyFromCreate) && postId != null) {
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
 
  const validatedEwayTotalStr =
    !isCod && checkoutTotals ? checkoutTotals.total.toFixed(2) : null;
 
  const wooOrderTotal =
    validatedEwayTotalStr ?? readWooOrderTotal(orderForPayment);
 
  if (isCod) {
    return { kind: "cod", orderIdRaw, orderKey, wooOrderTotal: readWooOrderTotal(orderForPayment) };
  }
 
  if (payload.payment_method !== "eway") {
    throw new Error("Invalid payment method.");
  }
 
  if (postId != null && validatedEwayTotalStr) {
    const om = orderForPayment as {
      meta_data?: Array<{ id?: number; key: string; value: unknown }>;
    };
    try {
      await updateWooOrder(postId, {
        meta_data: mergeWooOrderMetaByKey(om.meta_data, [
          { key: HEADLESS_VALIDATED_CHECKOUT_TOTAL_META_KEY, value: validatedEwayTotalStr },
        ]),
      });
      orderForPayment = await getWooOrder(String(postId));
    } catch (e) {
      console.warn("[executeWooCheckout] failed to persist headless_validated_checkout_total", e);
    }
  }
 
  const paymentResult = await handlePayment({
    method: "eway",
    order: orderForPayment,
    payload,
    customerIp,
    actorUserId: typeof actor.userId === "number" ? actor.userId : undefined,
    validatedCheckoutTotalStr: validatedEwayTotalStr ?? undefined,
  });
 
  if (paymentResult.type === "error") {
    return {
      kind: "eway_error",
      message: paymentResult.message,
      action: paymentResult.action,
      orderIdRaw,
      orderKey,
      wooOrderTotal,
    };
  }
 
  return {
    kind: "eway",
    orderIdRaw,
    orderKey,
    redirectUrl: paymentResult.url,
    paymentReused: paymentResult.reused === true,
    wooOrderTotal,
  };
}