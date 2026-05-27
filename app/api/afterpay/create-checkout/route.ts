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
import { runFullCartValidation } from "@/lib/cart/validate-cart-full";
import {
  getCheckoutWpToken,
  syncCheckoutCustomerAfterOrder,
} from "@/lib/checkout/syncCheckoutCustomerAfterOrder";
import { afterpayConfigured, afterpaySiteUrl } from "@/lib/afterpay/env";
import { parseAfterpayCheckoutBody } from "@/lib/afterpay/schema";
import { savePendingCheckoutPayload } from "@/lib/afterpay/pendingSession";
import { buildAfterpayCreateCheckoutBody } from "@/lib/afterpay/buildCheckoutRequest";
import { afterpayCreateCheckout, isAfterpayApiError } from "@/lib/afterpay/afterpayHttp";
import { buildWooCheckoutOrderInput } from "@/lib/checkout/executeWooCheckoutOrder";
import { upsertValidatedCheckoutOrder } from "@/lib/checkout/upsertWooCheckoutOrder";
import { extractWooOrderId, extractWooOrderNumber } from "@/lib/services/wooService";
import {
  assertPayloadMatchesQuoteSnapshot,
  isQuoteSnapshotFresh,
  quoteSigningConstants,
  verifyQuoteSignature,
} from "@/lib/checkout/quoteSigning";

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
    requestId
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
        { status: 503 }
      ),
      requestId
    );
  }

  const siteUrl = afterpaySiteUrl();
  if (!siteUrl) {
    return withRequestId(
      NextResponse.json(
        {
          success: false,
          error:
            "AFTERPAY_REDIRECT_BASE_URL (or NEXT_PUBLIC_SITE_URL) is required for Afterpay redirects.",
        },
        { status: 503 }
      ),
      requestId
    );
  }

  let raw: unknown;
  try {
    raw = await readJsonBody(req);
  } catch {
    return withRequestId(
      NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 }),
      requestId
    );
  }

  let payload;
  try {
    payload = parseAfterpayCheckoutBody(raw);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Invalid checkout payload";
    return withRequestId(
      NextResponse.json({ success: false, error: message }, { status: 400 }),
      requestId
    );
  }

  try {
    payload = stripEmptyNdisHcpFromInitiatePayload(payload);

    after(async () => {
      try {
        const actor = await resolveCheckoutActor({ skipNdisCustomerLookup: true });
        const wpToken = await getCheckoutWpToken(req);
        await syncCheckoutCustomerAfterOrder(actor, payload, wpToken);
      } catch (e) {
        console.warn("[afterpay create-checkout] customer profile / address book sync failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    });

    const cartItems = payload.cart_items ?? [];
    const cartValidationPromise = runFullCartValidation(cartItems);

    type PricingResult = Awaited<ReturnType<typeof validateAndRecalculateCheckout>>;
    let pricing: Pick<PricingResult, "totals" | "wooLineItems" | "shippingLine">;

    if (payload.quote_signing) {
      const { signature, snapshot } = payload.quote_signing;
      if (!verifyQuoteSignature(snapshot, signature)) {
        return withRequestId(
          NextResponse.json(
            {
              success: false,
              error: "Invalid or expired quote signature. Refresh totals and try again.",
            },
            { status: 401 }
          ),
          requestId
        );
      }
      if (
        !isQuoteSnapshotFresh(snapshot, Date.now(), quoteSigningConstants.DEFAULT_QUOTE_MAX_AGE_MS)
      ) {
        return withRequestId(
          NextResponse.json(
            {
              success: false,
              error: "Quote expired. Refresh totals and try again.",
              code: "QUOTE_EXPIRED",
            },
            { status: 410 }
          ),
          requestId
        );
      }
      const match = assertPayloadMatchesQuoteSnapshot(payload, snapshot);
      if (match.ok === false) {
        return withRequestId(
          NextResponse.json(
            { success: false, error: match.message, code: "QUOTE_PAYLOAD_MISMATCH" },
            { status: 409 }
          ),
          requestId
        );
      }
      pricing = {
        totals: snapshot.totals,
        wooLineItems: snapshot.woo_line_items,
        shippingLine: snapshot.shipping_line,
      };
    } else {
      pricing = await validateAndRecalculateCheckout(payload);
    }

    const cartCheck = await validateCartForEwayCheckout({
      cart_items: cartItems,
      totals: pricing.totals,
      validationResult: await cartValidationPromise,
    });
    if (cartCheck.ok === false) {
      return withRequestId(
        NextResponse.json(
          {
            success: false,
            error: cartCheck.errors[0]?.message ?? "Cart validation failed",
          },
          { status: 400 }
        ),
        requestId
      );
    }

    const checkoutSessionId =
      typeof payload.checkout_session_id === "string" && payload.checkout_session_id.trim()
        ? payload.checkout_session_id.trim()
        : randomUUID();
    payload = {
      ...payload,
      checkout_session_id: checkoutSessionId,
    };

    const actor = await resolveCheckoutActor({ skipNdisCustomerLookup: true });
    const pendingWooOrder = await upsertValidatedCheckoutOrder({
      payload,
      input: buildWooCheckoutOrderInput({
        payload,
        wooLineItems: pricing.wooLineItems,
        shippingLine: pricing.shippingLine,
        actor,
      }),
      timing: { mode: "inline" },
      checkoutSessionId,
      actor,
      completePayment: false,
      perf: { requestId },
    });

    const orderId = extractWooOrderId(pendingWooOrder);
    const merchantReference =
      extractWooOrderNumber(pendingWooOrder) || (orderId == null ? "" : String(orderId));
    if (!merchantReference) {
      return withRequestId(
        NextResponse.json(
          { success: false, error: "WooCommerce did not return an order number for Afterpay." },
          { status: 502 }
        ),
        requestId
      );
    }

    const pendingEnvelopeJson = JSON.stringify({
      payload,
      totals: pricing.totals,
      merchantReference,
    });
    await savePendingCheckoutPayload(merchantReference, pendingEnvelopeJson);

    const checkoutBody = buildAfterpayCreateCheckoutBody({
      payload,
      totals: pricing.totals,
      wooLineItems: pricing.wooLineItems,
      shippingLine: pricing.shippingLine,
      merchantReference,
      siteUrl,
    });

    const ap = await afterpayCreateCheckout(checkoutBody);
    const redirectCheckoutUrl =
      typeof ap.redirectCheckoutUrl === "string" ? ap.redirectCheckoutUrl.trim() : "";
    if (!redirectCheckoutUrl) {
      return withRequestId(
        NextResponse.json(
          { success: false, error: "Afterpay did not return a redirect URL." },
          { status: 502 }
        ),
        requestId
      );
    }
    const afterpayToken = typeof ap.token === "string" ? ap.token.trim() : "";
    if (afterpayToken) {
      await savePendingCheckoutPayload(afterpayToken, pendingEnvelopeJson);
    }

    return withRequestId(
      corsResponse(
        req,
        NextResponse.json({
          success: true,
          redirectCheckoutUrl,
          merchantReference,
        })
      ),
      requestId
    );
  } catch (error: unknown) {
    if (isAfterpayApiError(error)) {
      console.warn("[api/afterpay/create-checkout] afterpay rejected checkout", {
        requestId,
        status: error.httpStatus,
        errorCode: error.errorCode || null,
        message: error.message,
      });
      return withRequestId(
        corsResponse(
          req,
          NextResponse.json(
            {
              success: false,
              error: error.publicMessage,
              code: error.errorCode || "AFTERPAY_REJECTED",
              requestId,
            },
            { status: error.httpStatus >= 500 ? 502 : 400 }
          )
        ),
        requestId
      );
    }

    return withRequestId(
      corsResponse(
        req,
        createApiErrorResponse(error, {
          requestId,
          defaultMessage: "Unable to start Afterpay checkout.",
          logPrefix: "api/afterpay/create-checkout",
        })
      ),
      requestId
    );
  }
}
