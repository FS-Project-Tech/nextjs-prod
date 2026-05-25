import { NextRequest, NextResponse } from "next/server";
import { getWooOrder } from "@/lib/services/wooService";
import { keysMatchWooOrder } from "@/lib/order/orderKeyVerify";

export const dynamic = "force-dynamic";

async function orderKeyMatches(orderRef: string, orderKey: string): Promise<boolean> {
  if (!orderRef || !orderKey) return false;
  try {
    const order = (await getWooOrder(orderRef)) as { order_key?: unknown };
    const wooKey = typeof order.order_key === "string" ? order.order_key : "";
    return Boolean(wooKey && keysMatchWooOrder(wooKey, orderKey));
  } catch (e) {
    console.warn("[payment/success] order key validation failed", {
      hasOrderRef: Boolean(orderRef),
      message: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

function redirectToCheckout(base: URL, payment: string, message?: string): NextResponse {
  base.pathname = "/checkout";
  const search = new URLSearchParams({ payment });
  if (message) search.set("message", message);
  base.search = search.toString();
  return NextResponse.redirect(base);
}

function redirectToOrderReview(params: {
  base: URL;
  orderRef: string;
  orderKey?: string;
  payment?: string;
  accessCode?: string;
}): NextResponse {
  const { base, orderRef, orderKey, payment, accessCode } = params;
  base.pathname = "/checkout/order-review";
  const search = new URLSearchParams({ orderId: orderRef });
  if (orderKey) search.set("key", orderKey);
  if (payment) search.set("payment", payment);
  if (accessCode) search.set("AccessCode", accessCode);
  base.search = search.toString();
  return NextResponse.redirect(base);
}

/**
 * Primary eWAY return URL. Validate the signed Woo order link, then hand off immediately
 * to order review; the first order-review API call schedules eWAY verification after response.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const accessCode = (sp.get("AccessCode") || sp.get("accessCode") || "").trim();
  const orderRef = (sp.get("order_id") || sp.get("orderId") || "").trim();
  const orderKey = (sp.get("key") || "").trim();

  const base = new URL(req.nextUrl.href);

  if (!accessCode) {
    if (orderRef) {
      return redirectToOrderReview({
        base,
        orderRef,
        orderKey,
        payment: "missing_access_code",
      });
    }
    return redirectToCheckout(base, "missing_access_code");
  }

  console.log("[payment/success] GET handoff", {
    hasOrderRef: Boolean(orderRef),
  });

  if (!orderRef) {
    return redirectToCheckout(base, "missing_order_id");
  }

  const canTrustOrderRef = await orderKeyMatches(orderRef, orderKey);
  if (!canTrustOrderRef) {
    return redirectToCheckout(base, "verify_failed", "invalid_order_key");
  }

  return redirectToOrderReview({
    base,
    orderRef,
    orderKey,
    payment: "pending",
    accessCode,
  });
}
