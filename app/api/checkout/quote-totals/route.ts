import { NextRequest, NextResponse } from "next/server";
import { parseCheckoutQuoteTotalsInput } from "@/lib/checkout/initiatePayload";
import { quoteCheckoutTotals } from "@/utils/checkout-pricing";
import { readJsonBody, zodFail } from "@/utils/api-parse";
import { API_RATE_LIMITS, rateLimit } from "@/lib/api-security";
import { secureResponse } from "@/lib/security-headers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const limit = await rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 60,
  })(req);
  if (limit) return limit;

  let raw: unknown;
  try {
    raw = await readJsonBody(req);
  } catch {
    return secureResponse({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  let input;
  try {
    input = parseCheckoutQuoteTotalsInput(raw);
  } catch (error: unknown) {
    const zod = zodFail(error);
    if (zod) return NextResponse.json(zod, { status: 400 });
    return secureResponse(
      { success: false, error: error instanceof Error ? error.message : "Invalid body" },
      { status: 400 },
    );
  }

  try {
    const { totals } = await quoteCheckoutTotals(input);
    return secureResponse({ success: true, totals });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Quote failed";
    return secureResponse({ success: false, error: message }, { status: 400 });
  }
}
