import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/nextAuthOptions";
import { parseCheckoutPayload } from "@/lib/checkout/initiatePayload";
import { stripEmptyNdisHcpFromInitiatePayload } from "@/lib/checkout/ndisHcpPayload";
import { validateCartForEwayCheckout } from "@/lib/checkout/validateCartForEwayCheckout";
import { validateAndRecalculateCheckout } from "@/utils/checkout-pricing";
import { readJsonBody, zodFail } from "@/utils/api-parse";
import { getCheckoutSessionStore } from "@/lib/checkout-session-store";
import { getWooStorefrontUrl } from "@/lib/checkout-woo-url";
import { logCheckoutSession } from "@/lib/checkout-session-log";
import { API_RATE_LIMITS, rateLimit, validateTrustedBrowserOrigin } from "@/lib/api-security";
import type { CheckoutSessionRecord } from "@/types/checkout-session";
import { createApiErrorResponse, getRequestId, withRequestId } from "@/lib/utils/api-safe";

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
  const requestId = getRequestId(req);
  try {
    if (!validateTrustedBrowserOrigin(req)) {
      return withRequestId(
        NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
        requestId
      );
    }

    const limit = await rateLimit(API_RATE_LIMITS.CHECKOUT_WRITE)(req);
    if (limit) return withRequestId(limit, requestId);

    if (!process.env.CHECKOUT_SESSION_SERVER_SECRET?.trim()) {
      return withRequestId(
        NextResponse.json(
        {
          success: false,
          error:
            "Token checkout is not enabled. Set CHECKOUT_SESSION_SERVER_SECRET and redeploy, or disable NEXT_PUBLIC_CHECKOUT_EWAY_TOKEN_FLOW.",
        },
        { status: 503 }
      ),
      requestId
      );
    }

    const rawBody = await readJsonBody(req);
    const payload = stripEmptyNdisHcpFromInitiatePayload(parseCheckoutPayload(rawBody));

    if (payload.payment_method !== "eway") {
      return withRequestId(
        NextResponse.json(
        {
          success: false,
          error:
            "Token checkout session is only available for card (eWAY) payments.",
        },
        { status: 400 }
      ),
      requestId
      );
    }

    const { validatedLineItems, wooLineItems, shippingLine, totals } =
      await validateAndRecalculateCheckout(payload);

    const cartCheck = await validateCartForEwayCheckout({
      cart_items: payload.cart_items!,
      totals,
    });
    if (cartCheck.ok === false) {
      return withRequestId(
        NextResponse.json(
        {
          success: false,
          error: cartCheck.errors[0]?.message ?? "Cart validation failed",
          valid: cartCheck.valid,
          errors: cartCheck.errors,
          code: cartCheck.code,
        },
        { status: cartCheck.code === "SUBTOTAL_MISMATCH" ? 409 : 400 },
      ),
      requestId
      );
    }

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
            return withRequestId(
              NextResponse.json(
              { success: false, error: "Store URL is not configured (NEXT_PUBLIC_WP_URL)." },
              { status: 500 }
            ),
            requestId
            );
          }
          const redirectUrl = `${wooUrl}/?checkout_token=${encodeURIComponent(existingToken)}`;
          logCheckoutSession("info", "create-session.idempotent_replay", { idempotencyKey });
          return withRequestId(NextResponse.json({
            success: true,
            data: {
              redirectUrl,
              expiresAt: existing.expiresAt,
              idempotent: true,
            },
          }), requestId);
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
      wooLineItems,
      shippingLine,
      totals,
    };

    store.put(record);
    if (idempotencyKey) {
      store.putIdempotency(idempotencyKey, token, expiresAt);
    }

    const wooUrl = getWooStorefrontUrl();
    if (!wooUrl) {
      return withRequestId(
        NextResponse.json(
        { success: false, error: "Store URL is not configured. Set NEXT_PUBLIC_WP_URL." },
        { status: 500 }
      ),
      requestId
      );
    }

    const redirectUrl = `${wooUrl}/?checkout_token=${encodeURIComponent(token)}`;

    logCheckoutSession("info", "create-session.ok", {
      userId: userId ?? "guest",
      lineCount: validatedLineItems.length,
    });

    return withRequestId(NextResponse.json({
      success: true,
      data: {
        redirectUrl,
        expiresAt,
      },
    }), requestId);
  } catch (error) {
    const zod = zodFail(error);
    if (zod) {
      return withRequestId(NextResponse.json(zod, { status: 400 }), requestId);
    }

    const cartErrData = (error as any)?.data;
    if (cartErrData?.type === "cart_items_unavailable") {
      const message = "Some items in your cart are no longer available. Please review your cart.";
      logCheckoutSession("warn", "create-session.cart_items_unavailable", {
        message,
        missing: cartErrData.missing ?? [],
      });
      return withRequestId(
        NextResponse.json(
        {
          success: false,
          error: message,
          code: "CART_ITEMS_UNAVAILABLE",
          missingItems: cartErrData.missing ?? [],
        },
        { status: 409 }
      ),
      requestId
      );
    }
    if (cartErrData?.type === "woo_invalid_product_mapping") {
      const message =
        "Invalid product mapping from WooCommerce. Likely product type or plugin issue.";
      logCheckoutSession("error", "create-session.woo_invalid_product_mapping", {
        message,
      });
      return withRequestId(
        NextResponse.json(
        {
          success: false,
          error: message,
          code: "WOO_INVALID_PRODUCT_MAPPING",
        },
        { status: 502 }
      ),
      requestId
      );
    }

    const message = error instanceof Error ? error.message : "Failed to create checkout session.";
    logCheckoutSession("error", "create-session.failed", { message });
    return createApiErrorResponse(error, {
      requestId,
      defaultMessage: message,
      fallbackBody: { success: false },
      logPrefix: "api/checkout/create-session",
    });
  }
}
