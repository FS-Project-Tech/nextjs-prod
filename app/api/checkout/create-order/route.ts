import { NextRequest, NextResponse } from "next/server";
import type { HandlePaymentResult } from "@/lib/services/paymentService";
import { parseCheckoutPayload } from "@/lib/checkout/initiatePayload";
import { canUseOnAccount, resolveCheckoutActor } from "@/utils/checkout-auth";
import { validateAndRecalculateCheckout } from "@/utils/checkout-pricing";
import { readJsonBody, zodFail } from "@/utils/api-parse";
import { INSURANCE_OPTION_META_KEY } from "@/lib/checkout-parcel-protection";
import {
  appendParcelProtectionFee,
  createValidatedCheckoutOrder,
  extractWooOrderId,
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
      type: "redirect" | "success";
      url?: string;
      redirect?: string;
      orderId: number | string;
      order_ref: string;
    }
  | { success: false; error: string; code?: string; missingItems?: unknown[] };

function orderResponseHeaders(orderIdRaw: string | number | bigint): Record<string, string> {
  const orderHeader = encodeURIComponent(String(orderIdRaw));
  const orderIdPlain = String(orderIdRaw);
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "X-Create-Order-Id": orderHeader,
    "X-Order-Id": orderIdPlain,
    "Access-Control-Expose-Headers": "X-Create-Order-Id, X-Order-Id",
  };
}

function serializeOrderId(orderIdRaw: string | number | bigint): number | string {
  if (typeof orderIdRaw === "bigint") return String(orderIdRaw);
  if (typeof orderIdRaw === "number" && Number.isFinite(orderIdRaw)) return orderIdRaw;
  return String(orderIdRaw);
}

/** Always returns JSON — never an undefined body. */
function jsonSuccess(
  paymentResult: Extract<HandlePaymentResult, { type: "success" } | { type: "redirect" }>,
  orderIdRaw: string | number | bigint
): NextResponse {
  const body: CreateOrderResponseBody = {
    success: true,
    type: paymentResult.type,
    orderId: serializeOrderId(orderIdRaw),
    order_ref: String(orderIdRaw),
    ...(paymentResult.type === "redirect"
      ? { url: paymentResult.url }
      : { redirect: paymentResult.redirect }),
  };
  return NextResponse.json(
    { success: true, data: body },
    {
      status: 200,
      headers: orderResponseHeaders(orderIdRaw),
    }
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await readJsonBody(req);
    const payload = parseCheckoutPayload(rawBody);

    const actor = await resolveCheckoutActor({
      skipNdisCustomerLookup: payload.payment_method !== "cod",
    });

    if (payload.payment_method === "cod") {
      if (!actor.authenticated) {
        return NextResponse.json(
          { success: false, error: "Authentication required for On Account." },
          { status: 401 }
        );
      }
      if (!canUseOnAccount(actor)) {
        return NextResponse.json(
          {
            success: false,
            error: "On Account is only available for approved administrator accounts.",
          },
          { status: 403 }
        );
      }
    }

    const { validatedLineItems, shippingLine } = await validateAndRecalculateCheckout(payload);

    const paymentTitle = payload.payment_method === "eway" ? "Credit Card (eWAY)" : "On Account";

    let order: unknown;
    try {
      order = await createValidatedCheckoutOrder({
        payment_method: payload.payment_method,
        payment_method_title: paymentTitle,
        set_paid: false,
        status: "pending",
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

    const paymentCtx = {
      order,
      payload,
      customerIp: clientIpFromRequest(req) || undefined,
      actorUserId: typeof actor.userId === "number" ? actor.userId : undefined,
    };

    // --- On Account (Woo gateway id `cod`) ---
    if (payload.payment_method === "cod") {
      const paymentResult = await handlePayment({
        method: "cod",
        ...paymentCtx,
      });
      if (paymentResult.type === "error") {
        return NextResponse.json({ success: false, error: paymentResult.message }, { status: 502 });
      }
      return jsonSuccess(paymentResult, orderIdRaw);
    }

    // --- eWAY hosted card ---
    if (payload.payment_method === "eway") {
      const paymentResult = await handlePayment({
        method: "eway",
        ...paymentCtx,
      });
      if (paymentResult.type === "error") {
        return NextResponse.json({ success: false, error: paymentResult.message }, { status: 502 });
      }
      return jsonSuccess(paymentResult, orderIdRaw);
    }

    return NextResponse.json({ success: false, error: "Invalid payment method." }, { status: 400 });
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

    const message = error instanceof Error ? error.message : "Checkout failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
