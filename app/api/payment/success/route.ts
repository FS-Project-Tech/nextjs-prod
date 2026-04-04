import { NextRequest, NextResponse } from "next/server";
import { verifyEwayAndMarkWooPaid } from "@/lib/services/paymentService";

export const dynamic = "force-dynamic";

/**
 * Fallback return URL: point eWAY RedirectUrl here if you want server-side verify on return.
 * Example: `${SITE}/api/payment/success?order_id={orderId}&AccessCode=[AccessCode]`
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const accessCode = (sp.get("AccessCode") || sp.get("accessCode") || "").trim();
  const orderRef = (sp.get("order_id") || sp.get("orderId") || "").trim();

  const base = req.nextUrl.clone();

  if (!accessCode) {
    base.pathname = "/checkout";
    base.search = "?payment=missing_access_code";
    return NextResponse.redirect(base);
  }

  console.log("[payment/success] GET verify", {
    hasOrderRef: Boolean(orderRef),
  });

  const r = await verifyEwayAndMarkWooPaid({
    accessCode,
    orderRef: orderRef || null,
  });

  if (!r.ok) {
    base.pathname = "/checkout";
    base.search = `?payment=verify_failed&message=${encodeURIComponent(r.error || "error")}`;
    return NextResponse.redirect(base);
  }

  if (r.paid && r.orderPostId) {
    base.pathname = "/order-success";
    base.search = `?orderId=${encodeURIComponent(String(r.orderPostId))}`;
    return NextResponse.redirect(base);
  }

  const ref = orderRef || String(r.orderPostId || "");
  if (ref) {
    base.pathname = "/order-review";
    base.search = `?order_id=${encodeURIComponent(ref)}`;
    return NextResponse.redirect(base);
  }

  base.pathname = "/checkout";
  base.search = "?payment=pending";
  return NextResponse.redirect(base);
}
