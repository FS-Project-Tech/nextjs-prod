import { NextRequest, NextResponse } from "next/server";
import wcAPI from "@/lib/woocommerce";
import { keysMatchWooOrder } from "@/lib/order/orderKeyVerify";
import { scheduleEwayOrderReturnVerify } from "@/lib/payment/scheduleEwayOrderReturnVerify";
import { resolveOrderPostId } from "@/lib/services/wooService";

/**
 * GET /api/checkout/get-order?orderId=<id>&key=<wc_order_key>[&AccessCode=…]
 * Loads order via WooCommerce REST (wc/v3) only. Requires matching order_key (guest-safe).
 */
export const dynamic = "force-dynamic";

/** Lean payload for order-review UI (smaller JSON over the wire). */
const ORDER_REVIEW_WOO_FIELDS =
  "id,number,order_number,order_key,status,total,subtotal,total_shipping,shipping_total,total_tax,tax_total,discount_total,payment_method,payment_method_title,date_created,billing,shipping,line_items,meta_data,currency";

function orderReviewReadParams(): { _fields: string } {
  return { _fields: ORDER_REVIEW_WOO_FIELDS };
}

/** Fast read for order-review (avoid waiting on 90s budget when Woo is healthy). */
function orderReviewReadTimeoutMs(): number {
  const n = Number(process.env.WOOCOMMERCE_ORDER_REVIEW_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 20_000;
}

/** Woo PUT/GET during eWAY return can exceed default 30s axios timeout on slow hosts. */
function wooCheckoutMutationTimeoutMs(): number {
  const n = Number(process.env.WOOCOMMERCE_CHECKOUT_WRITE_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 90_000;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const orderIdParam = (sp.get("orderId") || sp.get("order_id") || "").trim();
    const keyParam = (sp.get("key") || "").trim();
    const accessCode = (sp.get("AccessCode") || sp.get("accessCode") || "").trim();

    if (!orderIdParam || !keyParam) {
      return NextResponse.json(
        { error: "orderId and key (WooCommerce order_key) are required" },
        { status: 400 }
      );
    }

    const readTimeout = orderReviewReadTimeoutMs();
    const mutationTimeout = wooCheckoutMutationTimeoutMs();
    const lean = orderReviewReadParams();

    let order: Record<string, unknown> | null = null;
    try {
      const { data } = await wcAPI.get(`/orders/${encodeURIComponent(orderIdParam)}`, {
        timeout: readTimeout,
        params: lean,
      });
      order = data as Record<string, unknown>;
    } catch (firstErr: unknown) {
      const status = (firstErr as { response?: { status?: number } }).response?.status;
      if (status !== 404) throw firstErr;
    }

    if (!order) {
      const postId = await resolveOrderPostId(orderIdParam);
      if (!postId) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }
      const { data } = await wcAPI.get(`/orders/${postId}`, {
        timeout: readTimeout,
        params: lean,
      });
      order = data as Record<string, unknown>;
    }

    const wooKey = typeof order.order_key === "string" ? order.order_key : "";
    if (!wooKey || !keysMatchWooOrder(wooKey, keyParam)) {
      return NextResponse.json({ error: "Invalid order key" }, { status: 403 });
    }

    if (
      accessCode &&
      String(order.status || "").toLowerCase() === "pending" &&
      String(order.payment_method || "").toLowerCase() === "eway"
    ) {
      scheduleEwayOrderReturnVerify({
        accessCode,
        orderId: order.id as number | string,
        mutationTimeoutMs: mutationTimeout,
        logTag: "[checkout/get-order]",
      });
    }

    return NextResponse.json(
      { order },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    const err = error as Error & { response?: { status?: number; data?: unknown } };
    console.error("[checkout/get-order]", err.message, err.response?.status);
    if (err.response?.status === 404) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: err.message || "Failed to load order" },
      { status: err.response?.status || 500 }
    );
  }
}
