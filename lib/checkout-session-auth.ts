import { NextRequest, NextResponse } from "next/server";

/**
 * Shared secret for server-to-server calls (WooCommerce PHP → Next.js).
 * Set `CHECKOUT_SESSION_SERVER_SECRET` to a long random string; use the same value in WordPress.
 */
export function assertCheckoutSessionServerAuth(req: NextRequest): NextResponse | null {
  const expected = process.env.CHECKOUT_SESSION_SERVER_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      {
        success: false,
        error: "Checkout session API is not configured (missing CHECKOUT_SESSION_SERVER_SECRET).",
      },
      { status: 503 }
    );
  }

  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerSecret = req.headers.get("x-checkout-session-secret")?.trim() || "";

  const provided = bearer || headerSecret;
  if (!provided || provided !== expected) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
