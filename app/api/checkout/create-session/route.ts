import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { parseCheckoutPayload } from "@/lib/checkout/initiatePayload";
import { stripEmptyNdisHcpFromInitiatePayload } from "@/lib/checkout/ndisHcpPayload";
import { pricingWithEwayCartGate } from "@/lib/checkout/pricingWithEwayCartGate";
import { deriveCustomerPricingKey, wooStoreCurrency } from "@/lib/checkout/pricingOptions";
import {
  assertPayloadMatchesQuoteSnapshot,
  isQuoteSnapshotFresh,
  quoteSigningConstants,
  verifyQuoteSignature,
} from "@/lib/checkout/quoteSigning";
import { resolveCheckoutActor } from "@/utils/checkout-auth";
import { readJsonBody, zodFail } from "@/utils/api-parse";
import { getCheckoutSessionStore } from "@/lib/checkout-session-store";
import { getWooStorefrontUrl } from "@/lib/checkout-woo-url";
import { logCheckoutSession } from "@/lib/checkout-session-log";
import { API_RATE_LIMITS, rateLimitMemory, validateTrustedBrowserOrigin } from "@/lib/api-security";
import type { CheckoutSessionRecord } from "@/types/checkout-session";
import type { WooLineItem } from "@/services/woocommerce";
import { createApiErrorResponse, getRequestId, withRequestId } from "@/lib/utils/api-safe";

export const dynamic = "force-dynamic";

const SESSION_TTL_MS = 15 * 60 * 1000;

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Creates a short-lived checkout session and returns a WooCommerce redirect URL
 * carrying only an opaque token (no PII in query beyond the random token).
 *
 * eWay path: prefers a {@link payload.quote_signing} bundle from POST /api/checkout/quote-totals (fast, no Woo here).
 * If signing is absent, falls back to full pricing + cart gate unless CHECKOUT_CREATE_SESSION_REQUIRE_SIGNED_QUOTE=true.
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

    const limit = await rateLimitMemory(API_RATE_LIMITS.CHECKOUT_WRITE)(req);
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

    const actorPromise = resolveCheckoutActor({ skipNdisCustomerLookup: true });
    let rawBody: unknown;
    try {
      rawBody = await readJsonBody(req);
    } catch {
      await actorPromise.catch(() => {});
      return withRequestId(
        NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 }),
        requestId,
      );
    }

    let payload;
    try {
      payload = stripEmptyNdisHcpFromInitiatePayload(parseCheckoutPayload(rawBody));
    } catch (parseErr) {
      await actorPromise.catch(() => {});
      throw parseErr;
    }

    if (payload.payment_method !== "eway") {
      await actorPromise.catch(() => {});
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

    const actor = await actorPromise;
    const userId =
      actor.userId != null && actor.userId > 0 ? actor.userId : null;

    /** Force Woo-backed pricing in create-session (same as missing signed quote before fast path existed). */
    const legacyPricing =
      String(process.env.CHECKOUT_CREATE_SESSION_LEGACY_PRICING || "").trim() === "true";
    /** When true, missing quote_signing returns 400 instead of running full Woo pricing here. */
    const requireSignedQuote =
      String(process.env.CHECKOUT_CREATE_SESSION_REQUIRE_SIGNED_QUOTE || "").trim() === "true";

    let validatedLineItems: Array<{ product_id: number; variation_id?: number; quantity: number }>;
    let wooLineItems: WooLineItem[];
    let shippingLine: CheckoutSessionRecord["shippingLine"];
    let totals: CheckoutSessionRecord["totals"];

    const runFullWooPricingGate = async (): Promise<NextResponse | null> => {
      const gate = await pricingWithEwayCartGate(payload, {
        requestId,
        currency: wooStoreCurrency(),
        customerType: deriveCustomerPricingKey(actor),
      });
      if (gate.ok === false) {
        const cartCheck = gate.cartCheck;
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
          requestId,
        );
      }
      ({ validatedLineItems, wooLineItems, shippingLine, totals } = gate.pricing);
      return null;
    };

    if (legacyPricing) {
      const errRes = await runFullWooPricingGate();
      if (errRes) return errRes;
    } else if (payload.quote_signing) {
      const { signature, snapshot } = payload.quote_signing;
      if (!verifyQuoteSignature(snapshot, signature)) {
        return withRequestId(
          NextResponse.json(
            { success: false, error: "Invalid or expired quote signature. Refresh order totals and try again." },
            { status: 401 },
          ),
          requestId,
        );
      }
      if (!isQuoteSnapshotFresh(snapshot, Date.now(), quoteSigningConstants.DEFAULT_QUOTE_MAX_AGE_MS)) {
        return withRequestId(
          NextResponse.json(
            { success: false, error: "Quote expired. Refresh totals and try again.", code: "QUOTE_EXPIRED" },
            { status: 410 },
          ),
          requestId,
        );
      }
      const match = assertPayloadMatchesQuoteSnapshot(payload, snapshot);
      if (match.ok === false) {
        return withRequestId(
          NextResponse.json(
            { success: false, error: match.message, code: "QUOTE_PAYLOAD_MISMATCH" },
            { status: 409 },
          ),
          requestId,
        );
      }
      validatedLineItems = snapshot.validated_line_items.map((li) => ({
        product_id: li.product_id,
        quantity: li.quantity,
        ...(li.variation_id != null && li.variation_id > 0 ? { variation_id: li.variation_id } : {}),
      }));
      wooLineItems = snapshot.woo_line_items;
      shippingLine = snapshot.shipping_line;
      totals = snapshot.totals;
    } else if (requireSignedQuote) {
      return withRequestId(
        NextResponse.json(
          {
            success: false,
            error:
              "Signed quote required (CHECKOUT_CREATE_SESSION_REQUIRE_SIGNED_QUOTE). Wait for totals to load after quote-totals returns quote_signature, or disable strict mode.",
            code: "QUOTE_SIGNING_REQUIRED",
          },
          { status: 400 },
        ),
        requestId,
      );
    } else {
      const errRes = await runFullWooPricingGate();
      if (errRes) return errRes;
    }

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
