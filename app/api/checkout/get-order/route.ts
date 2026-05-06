import { NextRequest, NextResponse } from "next/server";
import wcAPI from "@/lib/woocommerce";
import { keysMatchWooOrder } from "@/lib/order/orderKeyVerify";
import { scheduleEwayOrderReturnVerify } from "@/lib/payment/scheduleEwayOrderReturnVerify";
import { resolveOrderPostId } from "@/lib/services/wooService";
import { createApiErrorResponse, getRequestId, withRequestId } from "@/lib/utils/api-safe";

/**
 * GET /api/checkout/get-order?orderId=<id>&key=<wc_order_key>[&AccessCode=…]
 * Loads order via WooCommerce REST (wc/v3) only. Requires matching order_key (guest-safe).
 *
 * `orderId` may be the WooCommerce **post ID** or the customer-facing **order number**
 * (Sequential Order Numbers, etc.). When those differ, a direct GET /orders/{orderId} can
 * return the wrong row (ID collision); we fall back to searching by exact order number + key.
 */
export const dynamic = "force-dynamic";

/** Lean payload for order-review UI (smaller JSON over the wire). */
const ORDER_REVIEW_WOO_FIELDS =
  "id,number,order_number,order_key,status,total,subtotal,total_shipping,shipping_total,total_tax,tax_total,discount_total,payment_method,payment_method_title,date_created,billing,shipping,line_items,meta_data,currency";

function orderReviewReadParams(): { _fields: string } {
  return { _fields: ORDER_REVIEW_WOO_FIELDS };
}

function coerceOrderKey(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

async function fetchOrderById(
  orderRef: string | number,
  params: { _fields?: string },
  readTimeout: number,
): Promise<Record<string, unknown>> {
  const { data } = await wcAPI.get(`/orders/${encodeURIComponent(String(orderRef))}`, {
    timeout: readTimeout,
    ...(Object.keys(params).length ? { params } : {}),
  });
  return data as Record<string, unknown>;
}

/**
 * When the URL uses the display order # but WC REST resolved a different post by ID first,
 * find the order whose `number` / `order_number` matches and whose `order_key` matches the URL.
 */
async function findOrderMatchingKeyByExactOrderNumber(
  orderRef: string,
  keyParam: string,
  lean: { _fields: string },
  readTimeout: number,
): Promise<Record<string, unknown> | null> {
  const ref = String(orderRef || "").trim();
  if (!ref) return null;

  const { data: orders } = await wcAPI.get("/orders", {
    params: { search: ref, per_page: 100 },
    timeout: readTimeout,
  });
  if (!Array.isArray(orders)) return null;

  for (const raw of orders) {
    const o = raw as { id?: number; number?: string; order_number?: string };
    const num = String(o.number ?? "").trim();
    const onum = String(o.order_number ?? "").trim();
    if (num !== ref && onum !== ref) continue;

    const id = Number(o.id);
    if (!Number.isFinite(id) || id <= 0) continue;

    try {
      const full = await fetchOrderById(id, lean, readTimeout);
      const k = coerceOrderKey(full.order_key);
      if (k && keysMatchWooOrder(k, keyParam)) {
        return full;
      }
    } catch {
      /* try next candidate */
    }
  }
  return null;
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
  const requestId = getRequestId(req);
  try {
    const sp = req.nextUrl.searchParams;
    const orderIdParam = (sp.get("orderId") || sp.get("order_id") || "").trim();
    const keyParam = (sp.get("key") || "").trim();
    const accessCode = (sp.get("AccessCode") || sp.get("accessCode") || "").trim();

    if (!orderIdParam || !keyParam) {
      return withRequestId(
        NextResponse.json(
        { error: "orderId and key (WooCommerce order_key) are required" },
        { status: 400 }
      ),
      requestId
      );
    }

    const readTimeout = orderReviewReadTimeoutMs();
    const mutationTimeout = wooCheckoutMutationTimeoutMs();
    const lean = orderReviewReadParams();

    let order: Record<string, unknown> | null = null;
    try {
      order = await fetchOrderById(orderIdParam, lean, readTimeout);
    } catch (firstErr: unknown) {
      const status = (firstErr as { response?: { status?: number } }).response?.status;
      if (status !== 404) throw firstErr;
    }

    if (!order) {
      const postId = await resolveOrderPostId(orderIdParam);
      if (!postId) {
        return withRequestId(NextResponse.json({ error: "Order not found" }, { status: 404 }), requestId);
      }
      order = await fetchOrderById(postId, lean, readTimeout);
    }

    let wooKey = coerceOrderKey(order.order_key);
    if (!wooKey || !keysMatchWooOrder(wooKey, keyParam)) {
      const oid = Number(order.id ?? 0);
      if (Number.isFinite(oid) && oid > 0) {
        try {
          const full = await fetchOrderById(oid, {}, readTimeout);
          const altKey = coerceOrderKey(full.order_key);
          if (altKey && keysMatchWooOrder(altKey, keyParam)) {
            order = full;
            wooKey = altKey;
          }
        } catch {
          /* keep lean order + fail below */
        }
      }
    }

    wooKey = coerceOrderKey(order.order_key);
    if (!wooKey || !keysMatchWooOrder(wooKey, keyParam)) {
      const byNumber = await findOrderMatchingKeyByExactOrderNumber(
        orderIdParam,
        keyParam,
        lean,
        readTimeout,
      );
      if (byNumber) {
        order = byNumber;
        wooKey = coerceOrderKey(order.order_key);
      }
    }

    wooKey = coerceOrderKey(order.order_key);
    if (!wooKey || !keysMatchWooOrder(wooKey, keyParam)) {
      return withRequestId(NextResponse.json({ error: "Invalid order key" }, { status: 403 }), requestId);
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

    return withRequestId(
      NextResponse.json(
      { order },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    ),
    requestId
    );
  } catch (error) {
    const err = error as Error & { response?: { status?: number; data?: unknown } };
    if (err.response?.status === 404) {
      return withRequestId(NextResponse.json({ error: "Order not found" }, { status: 404 }), requestId);
    }
    if (err.response?.status && err.response.status < 500 && err.response.status !== 429) {
      return withRequestId(
        NextResponse.json({ error: err.message || "Failed to load order" }, { status: err.response.status }),
        requestId
      );
    }
    return createApiErrorResponse(error, {
      requestId,
      defaultMessage: err.message || "Failed to load order",
      logPrefix: "api/checkout/get-order",
    });
  }
}
