import { NextRequest, NextResponse } from "next/server";
import { parseCheckoutQuoteTotalsInput } from "@/lib/checkout/initiatePayload";
import { quoteCheckoutTotals } from "@/utils/checkout-pricing";
import { readJsonBody, zodFail } from "@/utils/api-parse";
import { API_RATE_LIMITS, rateLimit } from "@/lib/api-security";
import { secureResponse } from "@/lib/security-headers";
import { createApiErrorResponse, getRequestId, withRequestId } from "@/lib/utils/api-safe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const limit = await rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 60,
  })(req);
  if (limit) return withRequestId(limit, requestId);

  let raw: unknown;
  try {
    raw = await readJsonBody(req);
  } catch {
    return withRequestId(secureResponse({ success: false, error: "Invalid JSON body" }, { status: 400 }), requestId);
  }

  let input;
  try {
    input = parseCheckoutQuoteTotalsInput(raw);
  } catch (error: unknown) {
    const zod = zodFail(error);
    if (zod) return withRequestId(NextResponse.json(zod, { status: 400 }), requestId);
    return withRequestId(secureResponse(
      { success: false, error: error instanceof Error ? error.message : "Invalid body" },
      { status: 400 },
    ), requestId);
  }

  try {
    const { totals } = await quoteCheckoutTotals(input);
    return withRequestId(secureResponse({ success: true, totals }), requestId);
  } catch (e: unknown) {
    return createApiErrorResponse(e, {
      requestId,
      defaultMessage: "Quote failed",
      fallbackBody: { success: false },
      logPrefix: "api/checkout/quote-totals",
    });
  }
}
