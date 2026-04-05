import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/nextAuthOptions";
import { parseCheckoutPayload } from "@/lib/checkout/initiatePayload";
import { validateAndRecalculateCheckout } from "@/utils/checkout-pricing";
import { readJsonBody, zodFail } from "@/utils/api-parse";
import { getCheckoutSessionStore } from "@/lib/checkout-session-store";
import { getWooStorefrontUrl } from "@/lib/checkout-woo-url";
import { logCheckoutSession } from "@/lib/checkout-session-log";
import type { CheckoutSessionRecord } from "@/types/checkout-session";

export const dynamic = "force-dynamic";

const SESSION_TTL_MS = 15 * 60 * 1000;

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

function parseNumericUserId(user: Record<string, unknown> | undefined): number | null {
  if (!user) return null;
  const candidates = [user.id, user.userId, user.wpUserId];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * Creates a short-lived checkout session and returns a WooCommerce redirect URL
 * carrying only an opaque token (no PII in query beyond the random token).
 *
 * eWay path: Next validates cart/pricing here; Woo redeems the token and creates the order.
 */
export async function POST(req: NextRequest) {
  try {
    if (!process.env.CHECKOUT_SESSION_SERVER_SECRET?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Token checkout is not enabled. Set CHECKOUT_SESSION_SERVER_SECRET and redeploy, or disable NEXT_PUBLIC_CHECKOUT_EWAY_TOKEN_FLOW.",
        },
        { status: 503 }
      );
    }

    const rawBody = await readJsonBody(req);
    const payload = parseCheckoutPayload(rawBody);

    if (payload.payment_method !== "eway") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Token checkout session is only available for card (eWAY) payments.",
        },
        { status: 400 }
      );
    }

    const { validatedLineItems, shippingLine, totals } =
      await validateAndRecalculateCheckout(payload);

    const session = await getServerSession(authOptions);
    const user = session?.user as Record<string, unknown> | undefined;
    const userId = parseNumericUserId(user);

    const store = getCheckoutSessionStore();
    const idempotencyKey = req.headers.get("idempotency-key")?.trim();
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;

    if (idempotencyKey) {
      const existingToken = store.getTokenByIdempotencyKey(idempotencyKey);
      if (existingToken) {
        const existing = store.get(existingToken);
        if (existing && !existing.used && existing.expiresAt > now) {
          const wooUrl = getWooStorefrontUrl();
          if (!wooUrl) {
            return NextResponse.json(
              { success: false, error: "Store URL is not configured (NEXT_PUBLIC_WP_URL)." },
              { status: 500 }
            );
          }
          const redirectUrl = `${wooUrl}/?checkout_token=${encodeURIComponent(existingToken)}`;
          logCheckoutSession("info", "create-session.idempotent_replay", { idempotencyKey });
          return NextResponse.json({
            success: true,
            data: {
              redirectUrl,
              expiresAt: existing.expiresAt,
              idempotent: true,
            },
          });
        }
      }
    }

    const token = generateToken();
    const record: CheckoutSessionRecord = {
      token,
      createdAt: now,
      expiresAt,
      used: false,
      userId,
      idempotencyKey: idempotencyKey || undefined,
      payment_method: payload.payment_method,
      payload,
      validatedLineItems,
      shippingLine,
      totals,
    };

    store.put(record);
    if (idempotencyKey) {
      store.putIdempotency(idempotencyKey, token, expiresAt);
    }

    const wooUrl = getWooStorefrontUrl();
    if (!wooUrl) {
      return NextResponse.json(
        { success: false, error: "Store URL is not configured. Set NEXT_PUBLIC_WP_URL." },
        { status: 500 }
      );
    }

    const redirectUrl = `${wooUrl}/?checkout_token=${encodeURIComponent(token)}`;

    logCheckoutSession("info", "create-session.ok", {
      userId: userId ?? "guest",
      lineCount: validatedLineItems.length,
    });

    return NextResponse.json({
      success: true,
      data: {
        redirectUrl,
        expiresAt,
      },
    });
  } catch (error) {
    const zod = zodFail(error);
    if (zod) {
      return NextResponse.json(zod, { status: 400 });
    }

    const cartErrData = (error as any)?.data;
    if (cartErrData?.type === "cart_items_unavailable") {
      const message = "Some items in your cart are no longer available. Please review your cart.";
      logCheckoutSession("warn", "create-session.cart_items_unavailable", {
        message,
        missing: cartErrData.missing ?? [],
      });
      return NextResponse.json(
        {
          success: false,
          error: message,
          code: "CART_ITEMS_UNAVAILABLE",
          missingItems: cartErrData.missing ?? [],
        },
        { status: 409 }
      );
    }
    if (cartErrData?.type === "woo_invalid_product_mapping") {
      const message =
        "Invalid product mapping from WooCommerce. Likely product type or plugin issue.";
      logCheckoutSession("error", "create-session.woo_invalid_product_mapping", {
        message,
      });
      return NextResponse.json(
        {
          success: false,
          error: message,
          code: "WOO_INVALID_PRODUCT_MAPPING",
        },
        { status: 502 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to create checkout session.";
    logCheckoutSession("error", "create-session.failed", { message });
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
