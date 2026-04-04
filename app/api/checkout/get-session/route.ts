import { NextRequest, NextResponse } from "next/server";
import { assertCheckoutSessionServerAuth } from "@/lib/checkout-session-auth";
import { getCheckoutSessionStore } from "@/lib/checkout-session-store";
import { toPublicSession } from "@/lib/checkout-session-serialize";
import { logCheckoutSession } from "@/lib/checkout-session-log";
import { readJsonBody } from "@/utils/api-parse";

export const dynamic = "force-dynamic";

type GetSessionBody = {
  token?: string;
  /**
   * When true (default), session is marked used atomically before returning payload.
   * WooCommerce should use default so the token cannot create duplicate orders.
   */
  consume?: boolean;
};

/**
 * Server-to-server: WooCommerce (or automation) validates a checkout token and receives
 * normalized session data to build the Woo order. Requires CHECKOUT_SESSION_SERVER_SECRET.
 *
 * POST JSON: { "token": "...", "consume": true }
 * Headers: Authorization: Bearer <CHECKOUT_SESSION_SERVER_SECRET>
 */
export async function POST(req: NextRequest) {
  const authErr = assertCheckoutSessionServerAuth(req);
  if (authErr) return authErr;

  let body: GetSessionBody;
  try {
    body = (await readJsonBody(req)) as GetSessionBody;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json({ success: false, error: "token is required." }, { status: 400 });
  }

  const consume = body.consume !== false;
  const store = getCheckoutSessionStore();
  const record = store.get(token);

  if (!record) {
    logCheckoutSession("warn", "get-session.not_found", { tokenPrefix: token.slice(0, 8) });
    return NextResponse.json(
      { success: false, error: "Invalid or unknown checkout token." },
      { status: 404 }
    );
  }

  if (record.expiresAt < Date.now()) {
    logCheckoutSession("warn", "get-session.expired", { tokenPrefix: token.slice(0, 8) });
    return NextResponse.json(
      { success: false, error: "Checkout session has expired." },
      { status: 410 }
    );
  }

  if (record.used) {
    return NextResponse.json(
      { success: false, error: "Checkout token has already been used." },
      { status: 410 }
    );
  }

  if (consume) {
    const consumed = store.consume(token);
    if (!consumed) {
      return NextResponse.json(
        { success: false, error: "Checkout token could not be consumed (race or already used)." },
        { status: 409 }
      );
    }
  }

  const session = toPublicSession(record);

  logCheckoutSession("info", "get-session.ok", {
    consume,
    tokenPrefix: token.slice(0, 8),
    payment_method: session.payment_method,
  });

  return NextResponse.json({
    success: true,
    consumed: consume,
    session,
  });
}
