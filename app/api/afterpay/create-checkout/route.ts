import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import {
  API_RATE_LIMITS,
  corsResponse,
  rateLimitMemory,
  validateTrustedBrowserOrigin,
} from "@/lib/api-security";
import { createApiErrorResponse, getRequestId, withRequestId } from "@/lib/utils/api-safe";
import { readJsonBody } from "@/utils/api-parse";
import { stripEmptyNdisHcpFromInitiatePayload } from "@/lib/checkout/ndisHcpPayload";
import { resolveCheckoutActor } from "@/utils/checkout-auth";
import { validateAndRecalculateCheckout } from "@/utils/checkout-pricing";
import { validateCartForEwayCheckout } from "@/lib/checkout/validateCartForEwayCheckout";
import { syncCheckoutUserMeta } from "@/lib/checkout/syncCheckoutUserMeta";
import { afterpayConfigured, afterpaySiteUrl } from "@/lib/afterpay/env";
import { parseAfterpayCheckoutBody } from "@/lib/afterpay/schema";
import { savePendingCheckoutPayload } from "@/lib/afterpay/pendingSession";
import { buildAfterpayCreateCheckoutBody } from "@/lib/afterpay/buildCheckoutRequest";
import { afterpayCreateCheckout } from "@/lib/afterpay/afterpayHttp";

export const dynamic = "force-dynamic";

export async function OPTIONS(req: NextRequest) {
  const requestId = getRequestId(req);
  if (!validateTrustedBrowserOrigin(req)) {
    return withRequestId(NextResponse.json({ error: "Forbidden" }, { status: 403 }), requestId);
  }
  return withRequestId(
    new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": req.headers.get("origin") || req.nextUrl.origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key",
        Vary: "Origin",
      },
    }),
    requestId,
  );
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  if (!validateTrustedBrowserOrigin(req)) {
    return withRequestId(NextResponse.json({ error: "Forbidden" }, { status: 403 }), requestId);
  }

  const limit = await rateLimitMemory(API_RATE_LIMITS.CHECKOUT_WRITE)(req);
  if (limit) return withRequestId(limit, requestId);

  if (!afterpayConfigured()) {
    return withRequestId(
      NextResponse.json(
        { success: false, error: "Afterpay is not configured on this store." },
        { status: 503 },
      ),
      requestId,
    );
  }

  const siteUrl = afterpaySiteUrl();
  if (!siteUrl) {
    return withRequestId(
      NextResponse.json(
        {
          success: false,
          error: "NEXT_PUBLIC_SITE_URL is required for Afterpay redirects.",
        },
        { status: 503 },
      ),
      requestId,
    );
  }

  let raw: unknown;
  try {
    raw = await readJsonBody(req);
  } catch {
    return withRequestId(
      NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 }),
      requestId,
    );
  }

  let payload;
  try {
    payload = parseAfterpayCheckoutBody(raw);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Invalid checkout payload";
    return withRequestId(NextResponse.json({ success: false, error: message }, { status: 400 }), requestId);
  }

  try {
    payload = stripEmptyNdisHcpFromInitiatePayload(payload);

    after(async () => {
      try {
        const actor = await resolveCheckoutActor({ skipNdisCustomerLookup: true });
        await syncCheckoutUserMeta(actor, payload);
      } catch (e) {
        console.warn("[afterpay create-checkout] user meta sync failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    });

    const pricing = await validateAndRecalculateCheckout(payload);
    const cartCheck = await validateCartForEwayCheckout({
      cart_items: payload.cart_items!,
      totals: pricing.totals,
    });
    if (cartCheck.ok === false) {
      return withRequestId(
        NextResponse.json(
          {
            success: false,
            error: cartCheck.errors[0]?.message ?? "Cart validation failed",
          },
          { status: 400 },
        ),
        requestId,
      );
    }

    const merchantReference = randomUUID();

    await savePendingCheckoutPayload(
      merchantReference,
      JSON.stringify({ payload, totals: pricing.totals }),
    );

    const checkoutBody = buildAfterpayCreateCheckoutBody({
      payload,
      totals: pricing.totals,
      wooLineItems: pricing.wooLineItems,
      shippingLine: pricing.shippingLine,
      merchantReference,
      siteUrl,
    });

    const ap = await afterpayCreateCheckout(checkoutBody);
    const redirectCheckoutUrl = typeof ap.redirectCheckoutUrl === "string" ? ap.redirectCheckoutUrl.trim() : "";
    if (!redirectCheckoutUrl) {
      return withRequestId(
        NextResponse.json(
          { success: false, error: "Afterpay did not return a redirect URL." },
          { status: 502 },
        ),
        requestId,
      );
    }

    return withRequestId(
      corsResponse(
        req,
        NextResponse.json({
          success: true,
          redirectCheckoutUrl,
          merchantReference,
        }),
      ),
      requestId,
    );
  } catch (error: unknown) {
    return withRequestId(
      corsResponse(
        req,
        createApiErrorResponse(error, {
          requestId,
          defaultMessage: "Unable to start Afterpay checkout.",
          logPrefix: "api/afterpay/create-checkout",
        }),
      ),
      requestId,
    );
  }
}
