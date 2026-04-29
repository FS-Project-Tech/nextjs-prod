/**
 * @deprecated Prefer POST `/api/checkout` (same handler). Kept for backward compatibility.
 */
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { handleCheckoutPost } from "@/lib/checkout/handleCheckoutPost";
import { API_RATE_LIMITS, rateLimitMemory, validateTrustedBrowserOrigin } from "@/lib/api-security";
import { createApiErrorResponse, getRequestId, withRequestId } from "@/lib/utils/api-safe";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  console.warn(
    "[DEPRECATED] POST /api/checkout/create-order is deprecated; use POST /api/checkout instead.",
  );
  const requestId = getRequestId(req);
  if (!validateTrustedBrowserOrigin(req)) {
    return withRequestId(NextResponse.json({ error: "Forbidden" }, { status: 403 }), requestId);
  }

  const limit = await rateLimitMemory(API_RATE_LIMITS.CHECKOUT_WRITE)(req);
  if (limit) return withRequestId(limit, requestId);

  try {
    const checkoutRequestId = randomUUID();
    console.log("[checkout:start]", checkoutRequestId);
    const response = await handleCheckoutPost(req, checkoutRequestId);
    return withRequestId(response, requestId);
  } catch (error) {
    return createApiErrorResponse(error, {
      requestId,
      defaultMessage: "Checkout service unavailable. Please retry.",
      logPrefix: "api/checkout/create-order",
    });
  }
}
