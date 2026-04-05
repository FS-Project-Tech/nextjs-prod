import { NextRequest, NextResponse } from "next/server";
import type { HandlePaymentResult } from "@/lib/services/paymentService";
import { parseCheckoutPayload } from "@/lib/checkout/initiatePayload";
import { resolveCheckoutActor } from "@/utils/checkout-auth";
import { validateAndRecalculateCheckout } from "@/utils/checkout-pricing";
import { readJsonBody, zodFail } from "@/utils/api-parse";
import { INSURANCE_OPTION_META_KEY } from "@/lib/checkout-parcel-protection";
import {
  appendParcelProtectionFee,
  createValidatedCheckoutOrder,
  extractWooOrderId,
  extractWooOrderKey,
  getWooOrder,
} from "@/lib/services/wooService";
import { handlePayment } from "@/lib/services/paymentService";

export const dynamic = "force-dynamic";

function normalizeCountry(country: string | undefined): string {
  const c = String(country || "")
    .trim()
    .toUpperCase();
  if (!c) return "AU";
  if (c === "AUSTRALIA") return "AU";
  return c;
}

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

export type CreateOrderResponseBody =
  | {
      success: true;
      type: "redirect";
      url: string;
      orderId: number | string;
      order_ref: string;
      order_key: string;
    }
  | { success: false; error: string; code?: string; missingItems?: unknown[] };

function orderResponseHeaders(
  orderIdRaw: string | number | bigint,
  orderKey: string
): Record<string, string> {
  const orderHeader = encodeURIComponent(String(orderIdRaw));
  const orderIdPlain = String(orderIdRaw);
  const keyHeader = encodeURIComponent(orderKey);
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "X-Create-Order-Id": orderHeader,
    "X-Order-Id": orderIdPlain,
    "X-Checkout-Order-Id": orderIdPlain,
    "X-Order-Key": keyHeader,
    "Access-Control-Expose-Headers":
      "X-Create-Order-Id, X-Order-Id, X-Checkout-Order-Id, X-Order-Key",
  };
}

/** Plain UTF-8 JSON body — avoids rare cases where streamed JSON bodies arrive empty to the client. */
function checkoutJsonResponse(
  payload: Record<string, unknown>,
  orderIdRaw: string | number | bigint,
  orderKey: string
): NextResponse {
  const body = JSON.stringify(payload);
  const res = new NextResponse(body, { status: 200 });
  res.headers.set("Content-Type", "application/json; charset=utf-8");
  for (const [key, value] of Object.entries(orderResponseHeaders(orderIdRaw, orderKey))) {
    res.headers.set(key, value);
  }
  return res;
}

function serializeOrderId(orderIdRaw: string | number | bigint): number | string {
  if (typeof orderIdRaw === "bigint") return String(orderIdRaw);
  if (typeof orderIdRaw === "number" && Number.isFinite(orderIdRaw)) return orderIdRaw;
  return String(orderIdRaw);
}

/** COD: order is final — client clears cart and opens order review (no gateway redirect). */
function jsonCodOrderPlaced(
  orderIdRaw: string | number | bigint,
  orderKey: string
): NextResponse {
  const oid = serializeOrderId(orderIdRaw);
  const data = {
    success: true as const,
    type: "order_placed" as const,
    payment_method: "cod" as const,
    orderId: oid,
    order_ref: String(orderIdRaw),
    order_key: orderKey,
  };
  return checkoutJsonResponse(
    {
      success: true,
      data,
      order_id: oid,
      order_key: orderKey,
    },
    orderIdRaw,
    orderKey
  );
}

/** Always returns JSON — never an undefined body. */
function jsonSuccess(
  paymentResult: Extract<HandlePaymentResult, { type: "redirect" }>,
  orderIdRaw: string | number | bigint,
  orderKey: string
): NextResponse {
  const oid = serializeOrderId(orderIdRaw);
  const body: CreateOrderResponseBody = {
    success: true,
    type: "redirect",
    orderId: oid,
    order_ref: String(orderIdRaw),
    order_key: orderKey,
    url: paymentResult.url,
  };
  const order_id = oid;
  const redirect_url = paymentResult.url;
  return checkoutJsonResponse(
    {
      success: true,
      data: body,
      order_id,
      order_key: orderKey,
      redirect_url,
    },
    orderIdRaw,
    orderKey
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await readJsonBody(req);
    const payload = parseCheckoutPayload(rawBody);

    const actor = await resolveCheckoutActor({
      skipNdisCustomerLookup: true,
    });

    const { validatedLineItems, shippingLine } = await validateAndRecalculateCheckout(payload);

    const isCod = payload.payment_method === "cod";
    const paymentTitle = isCod ? "On Account" : "Credit Card (eWAY)";
    const orderStatus = isCod ? "processing" : "pending";

    let order: unknown;
    try {
      order = await createValidatedCheckoutOrder({
        payment_method: payload.payment_method,
        payment_method_title: paymentTitle,
        set_paid: false,
        status: orderStatus,
        customer_id:
          typeof actor.userId === "number" && actor.userId > 0 ? actor.userId : undefined,
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
    } catch (err: unknown) {
      const axiosLike = err as {
        message?: string;
        response?: { status?: number; data?: unknown };
      };
      const status = axiosLike.response?.status;
      const rawData = axiosLike.response?.data;
      let rawText: string | undefined;
      if (typeof rawData === "string") {
        rawText = rawData;
      } else if (rawData != null) {
        try {
          rawText = JSON.stringify(rawData);
        } catch {
          rawText = "[unserializable]";
        }
      }
      console.error("[checkout-create-order] Woo create failed", {
        status,
        preview: rawText?.slice(0, 600),
      });
      const wooMessage =
        (typeof rawData === "object" &&
          rawData !== null &&
          String((rawData as { message?: unknown }).message || "")) ||
        rawText?.slice(0, 300);
      return NextResponse.json(
        {
          success: false,
          error:
            typeof wooMessage === "string" && wooMessage.trim()
              ? `WooCommerce: ${wooMessage.trim()}`
              : "Failed to create order in WooCommerce.",
        },
        { status: 502 }
      );
    }

    const orderIdRaw = extractWooOrderId(order);
    if (orderIdRaw == null) {
      console.error("[checkout-create-order] missing order id in response");
      return NextResponse.json(
        {
          success: false,
          error: "Order was created but no order ID was returned from WooCommerce.",
        },
        { status: 502 }
      );
    }

    const postIdNum =
      typeof orderIdRaw === "number" ? orderIdRaw : Number.parseInt(String(orderIdRaw), 10);
    const postId = Number.isFinite(postIdNum) && postIdNum > 0 ? postIdNum : null;

    if (postId != null && payload.insurance_option === "yes") {
      try {
        await appendParcelProtectionFee(postId);
      } catch (feeErr) {
        console.warn("[checkout-create-order] parcel protection fee failed", feeErr);
      }
    }

    /**
     * Woo totals can change after create (e.g. parcel protection fee lines, tax recalculation).
     * eWAY must use the latest order.total — never the stale POST /orders response.
     */
    let orderForPayment: unknown = order;
    if (postId != null) {
      try {
        orderForPayment = await getWooOrder(String(postId));
        const o = orderForPayment as { total?: string | number };
        console.log("[checkout-create-order] refreshed order before payment", {
          postId,
          total: o?.total,
        });
      } catch (refetchErr) {
        console.warn(
          "[checkout-create-order] pre-payment order refetch failed; using create response",
          refetchErr
        );
      }
    }

    const paymentCtx = {
      order: orderForPayment,
      payload,
      customerIp: clientIpFromRequest(req) || undefined,
      actorUserId: typeof actor.userId === "number" ? actor.userId : undefined,
    };

    const orderKey = extractWooOrderKey(orderForPayment);
    if (!orderKey) {
      return NextResponse.json(
        { success: false, error: "WooCommerce did not return order_key for this order." },
        { status: 502 }
      );
    }

    if (isCod) {
      return jsonCodOrderPlaced(orderIdRaw, orderKey);
    }

    if (payload.payment_method !== "eway") {
      return NextResponse.json({ success: false, error: "Invalid payment method." }, { status: 400 });
    }

    const paymentResult = await handlePayment({
      method: "eway",
      ...paymentCtx,
    });
    if (paymentResult.type === "error") {
      return NextResponse.json({ success: false, error: paymentResult.message }, { status: 502 });
    }
    return jsonSuccess(paymentResult, orderIdRaw, orderKey);
  } catch (error: unknown) {
    console.error("Checkout API error:", error);

    const zod = zodFail(error);
    if (zod) {
      return NextResponse.json(zod, { status: 400 });
    }

    const cartErrData = (error as { data?: { type?: string; missing?: unknown[] } })?.data;
    if (cartErrData?.type === "cart_items_unavailable") {
      return NextResponse.json(
        {
          success: false,
          error: "Some items in your cart are no longer available. Please review your cart.",
          code: "CART_ITEMS_UNAVAILABLE",
          missingItems: cartErrData.missing ?? [],
        },
        { status: 409 }
      );
    }
    if (cartErrData?.type === "woo_invalid_product_mapping") {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid product mapping from WooCommerce. Likely product type or plugin issue.",
          code: "WOO_INVALID_PRODUCT_MAPPING",
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "Order creation failed",
        error: "Order creation failed",
      },
      { status: 500 }
    );
  }
}
