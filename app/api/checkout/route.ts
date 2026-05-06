import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { handleCheckoutPost } from "@/lib/checkout/handleCheckoutPost";
import {
  API_RATE_LIMITS,
  corsResponse,
  validateTrustedBrowserOrigin,
  rateLimitMemory,
} from "@/lib/api-security";
import { createApiErrorResponse, getRequestId, withRequestId } from "@/lib/utils/api-safe";
import { runCheckoutWithIdempotency } from "@/lib/checkout/checkoutPostIdempotency";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key, X-Idempotency-Key",
      Vary: "Origin",
    },
    }),
    requestId
  );
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  // ✅ 1. Same-origin / trusted-origin validation
  if (!validateTrustedBrowserOrigin(req)) {
    return withRequestId(NextResponse.json({ error: "Forbidden" }, { status: 403 }), requestId);
  }

  // ✅ 2. Rate limiting (protects from spam / bot checkout)
  const limit = await rateLimitMemory(API_RATE_LIMITS.CHECKOUT_WRITE)(req);
  if (limit) return withRequestId(limit, requestId);

  try {
    const checkoutRequestId = randomUUID();
    console.log("[checkout:start]", checkoutRequestId);
    const idempotencyKey =
      req.headers.get("Idempotency-Key")?.trim() ||
      req.headers.get("X-Idempotency-Key")?.trim() ||
      undefined;
    // ✅ 3. Business logic — same Idempotency-Key replays success without a second Woo order
    const res = await runCheckoutWithIdempotency(idempotencyKey, () =>
      handleCheckoutPost(req, checkoutRequestId),
    );
    // ✅ 4. Apply CORS headers
    return withRequestId(corsResponse(req, res), requestId);
  } catch (error) {
    return withRequestId(
      corsResponse(
        req,
        createApiErrorResponse(error, {
          requestId,
          defaultMessage: "Checkout service unavailable. Please retry.",
          logPrefix: "api/checkout",
        })
      ),
      requestId
    );
  }
}