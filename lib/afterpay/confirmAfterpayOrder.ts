import "server-only";

import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { stripEmptyNdisHcpFromInitiatePayload } from "@/lib/checkout/ndisHcpPayload";
import { resolveCheckoutActor } from "@/utils/checkout-auth";
import { validateAndRecalculateCheckout } from "@/utils/checkout-pricing";
import { validateCartForEwayCheckout } from "@/lib/checkout/validateCartForEwayCheckout";
import { syncCheckoutUserMeta } from "@/lib/checkout/syncCheckoutUserMeta";
import { executeWooCheckoutOrder } from "@/lib/checkout/executeWooCheckoutOrder";
import type { CheckoutInitiatePayload, CheckoutTotals } from "@/types/checkout";
import { extractWooOrderId, extractWooOrderKey, getWooOrder } from "@/lib/services/wooService";
import { updateWooOrder } from "@/services/woocommerce";
import { mergeWooOrderMetaByKey } from "@/lib/woo/orderMeta";
import {
  afterpayCapturePayment,
  afterpayGetPayment,
  moneyMatchesTotal,
} from "@/lib/afterpay/afterpayHttp";
import {
  deletePendingCheckoutPayload,
  getOrderIdForAfterpayToken,
  getPendingCheckoutPayload,
  rememberOrderForAfterpayToken,
} from "@/lib/afterpay/pendingSession";

type PendingEnvelope = {
  payload: CheckoutInitiatePayload;
  totals: CheckoutTotals;
};

function clientIpFromRequest(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  return (
    forwarded?.split(",")[0]?.trim() ||
    realIp?.trim() ||
    req.headers.get("cf-connecting-ip")?.trim() ||
    ""
  );
}

function parseMoneyCurrency(m: unknown): string {
  if (!m || typeof m !== "object") return "AUD";
  const c = (m as { currency?: string }).currency;
  return String(c || "AUD")
    .trim()
    .toUpperCase() || "AUD";
}

export type ConfirmAfterpaySuccess = {
  success: true;
  order_id: string | number;
  order_key: string;
  payment_status: string;
};

export type ConfirmAfterpayFailure = {
  success: false;
  error: string;
  status?: number;
};

/**
 * Validates Afterpay payment, captures funds, creates WooCommerce order via {@link executeWooCheckoutOrder}.
 */
export async function confirmAfterpayOrder(params: {
  req: NextRequest;
  token: string;
}): Promise<ConfirmAfterpaySuccess | ConfirmAfterpayFailure> {
  const token = String(params.token || "").trim();
  if (token.length < 8) {
    return { success: false, error: "Missing or invalid Afterpay token.", status: 400 };
  }

  const existingId = await getOrderIdForAfterpayToken(token);
  if (existingId) {
    try {
      const order = await getWooOrder(existingId);
      const oid = extractWooOrderId(order);
      const ok = extractWooOrderKey(order);
      if (oid != null && ok) {
        return {
          success: true,
          order_id: typeof oid === "bigint" ? String(oid) : oid,
          order_key: ok,
          payment_status: "DUPLICATE_OK",
        };
      }
    } catch {
      /* fall through */
    }
  }

  let payment: Record<string, unknown>;
  try {
    payment = await afterpayGetPayment(token);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Afterpay payment lookup failed.",
      status: 502,
    };
  }

  const merchantReference =
    typeof payment.merchantReference === "string"
      ? payment.merchantReference.trim()
      : typeof payment.orderId === "string"
        ? payment.orderId.trim()
        : "";

  if (!merchantReference) {
    return { success: false, error: "Afterpay payment missing merchant reference.", status: 400 };
  }

  const rawPending = await getPendingCheckoutPayload(merchantReference);
  if (!rawPending) {
    return {
      success: false,
      error:
        "Checkout session expired or already completed. If you were charged, contact support with your email.",
      status: 409,
    };
  }

  let envelope: PendingEnvelope;
  try {
    envelope = JSON.parse(rawPending) as PendingEnvelope;
  } catch {
    return { success: false, error: "Invalid pending checkout data.", status: 400 };
  }

  let payload = stripEmptyNdisHcpFromInitiatePayload(envelope.payload);
  payload = {
    ...payload,
    payment_method: "afterpay",
  };

  const expectedTotals = envelope.totals;
  const payCurrency = parseMoneyCurrency(payment.originalAmount || payment.openToCaptureAmount);

  const amountObj = (payment.openToCaptureAmount ?? payment.originalAmount) as unknown;
  if (
    !moneyMatchesTotal(amountObj, expectedTotals.total, payCurrency) &&
    !moneyMatchesTotal(amountObj, expectedTotals.total, "AUD")
  ) {
    return {
      success: false,
      error: "Payment amount does not match checkout total. Order was not created.",
      status: 409,
    };
  }

  const statusRaw = String(payment.status ?? payment.paymentState ?? "").toUpperCase();
  const alreadyCaptured =
    statusRaw.includes("CAPTURE") ||
    statusRaw === "CAPTURED" ||
    statusRaw.includes("COMPLETED");

  let captureBody: Record<string, unknown> | null = null;
  if (!alreadyCaptured) {
    try {
      captureBody = await afterpayCapturePayment(token);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/already|capture/i.test(msg)) {
        captureBody = {};
      } else {
        return { success: false, error: msg, status: 502 };
      }
    }
  }

  const paymentStatus =
    typeof captureBody?.status === "string"
      ? captureBody.status
      : typeof payment.status === "string"
        ? payment.status
        : "CAPTURED";

  let pricing;
  try {
    pricing = await validateAndRecalculateCheckout(payload);
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof Error
          ? e.message
          : "Checkout could not be re-validated. No order was created.",
      status: 400,
    };
  }

  if (Math.abs(pricing.totals.total - expectedTotals.total) > 0.02) {
    return {
      success: false,
      error: "Cart pricing changed since checkout start. No order was created.",
      status: 409,
    };
  }

  const cartCheck = await validateCartForEwayCheckout({
    cart_items: payload.cart_items!,
    totals: pricing.totals,
  });
  if (cartCheck.ok === false) {
    return {
      success: false,
      error: cartCheck.errors[0]?.message ?? "Cart validation failed.",
      status: 400,
    };
  }

  const actor = await resolveCheckoutActor({ skipNdisCustomerLookup: true });
  try {
    await syncCheckoutUserMeta(actor, payload);
  } catch (e) {
    console.warn("[afterpay confirm] user meta sync failed", {
      message: e instanceof Error ? e.message : String(e),
    });
  }

  const checkoutSessionId =
    typeof payload.checkout_session_id === "string" && payload.checkout_session_id.trim()
      ? payload.checkout_session_id.trim()
      : randomUUID();

  let result;
  try {
    result = await executeWooCheckoutOrder({
      payload,
      wooLineItems: pricing.wooLineItems,
      shippingLine: pricing.shippingLine,
      actor,
      customerIp: clientIpFromRequest(params.req) || undefined,
      orderExtensionTiming: { mode: "inline" },
      checkoutSessionId,
      totals: pricing.totals,
    });
  } catch (e) {
    console.error("[afterpay confirm] WooCommerce order creation failed post-capture", e);
    return {
      success: false,
      error:
        "Payment captured but order creation failed. Please contact support with your email immediately.",
      status: 502,
    };
  }

  if (result.kind !== "afterpay") {
    return {
      success: false,
      error: "Unexpected checkout executor result.",
      status: 500,
    };
  }

  const orderIdRaw = result.orderIdRaw;
  const orderKey = result.orderKey;
  const postIdNum =
    typeof orderIdRaw === "number"
      ? orderIdRaw
      : Number.parseInt(String(orderIdRaw), 10);

  if (Number.isFinite(postIdNum) && postIdNum > 0) {
    try {
      const full = await getWooOrder(String(postIdNum));
      const om = full as {
        meta_data?: Array<{ id?: number; key: string; value: unknown }>;
      };
      await updateWooOrder(postIdNum, {
        meta_data: mergeWooOrderMetaByKey(om.meta_data, [
          { key: "_afterpay_payment_token", value: token },
          { key: "Afterpay Payment Status", value: String(paymentStatus) },
          { key: "Afterpay Payment Id", value: String(payment.id ?? payment.paymentId ?? "") },
        ]),
      });
    } catch (e) {
      console.warn("[afterpay confirm] meta update failed", e);
    }
    await rememberOrderForAfterpayToken(token, String(postIdNum));
  }

  await deletePendingCheckoutPayload(merchantReference);

  return {
    success: true,
    order_id:
      typeof orderIdRaw === "bigint"
        ? String(orderIdRaw)
        : typeof orderIdRaw === "number"
          ? orderIdRaw
          : String(orderIdRaw),
    order_key: orderKey,
    payment_status: paymentStatus,
  };
}
