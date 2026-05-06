import { NextRequest, NextResponse } from "next/server";
import { parseCheckoutQuoteTotalsInput } from "@/lib/checkout/initiatePayload";
import { buildQuoteSnapshotV1, getQuoteSigningSecret, signQuoteSnapshot } from "@/lib/checkout/quoteSigning";
import { deriveCustomerPricingKey, wooStoreCurrency } from "@/lib/checkout/pricingOptions";
import { resolveCheckoutActor } from "@/utils/checkout-auth";
import { quoteCheckoutTotals } from "@/utils/checkout-pricing";
import { readJsonBody, zodFail } from "@/utils/api-parse";
import { rateLimitMemory } from "@/lib/api-security";
import { secureResponse } from "@/lib/security-headers";
import { createApiErrorResponse, getRequestId, withRequestId } from "@/lib/utils/api-safe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const limit = await rateLimitMemory({
    windowMs: 60 * 1000,
    maxRequests: 60,
    softFail: true,
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
    const actor = await resolveCheckoutActor({ skipNdisCustomerLookup: true });
    const pricing = await quoteCheckoutTotals(input, {
      requestId,
      currency: wooStoreCurrency(),
      customerType: deriveCustomerPricingKey(actor),
    });
    const snapshot = buildQuoteSnapshotV1({
      input,
      pricing: {
        totals: pricing.totals,
        shippingLine: pricing.shippingLine,
        validatedLineItems: pricing.validatedLineItems,
        wooLineItems: pricing.wooLineItems,
      },
    });
    const quote_signature = signQuoteSnapshot(snapshot);
    if (!getQuoteSigningSecret() || !quote_signature) {
      return withRequestId(
        secureResponse(
          {
            success: true,
            totals: pricing.totals,
            shippingAdjusted: pricing.shippingAdjusted,
            shippingLine: pricing.shippingLine,
            validatedLineItems: pricing.validatedLineItems,
            wooLineItems: pricing.wooLineItems,
            signing_version: 1,
            quote_signing_configured: false,
          },
          { status: 200 },
        ),
        requestId,
      );
    }
    return withRequestId(
      secureResponse(
        {
          success: true,
          totals: pricing.totals,
          shippingAdjusted: pricing.shippingAdjusted,
          shippingLine: pricing.shippingLine,
          validatedLineItems: pricing.validatedLineItems,
          wooLineItems: pricing.wooLineItems,
          quote_signature,
          quote_snapshot: snapshot,
          signing_version: 1,
          quote_signing_configured: true,
        },
        { status: 200 },
      ),
      requestId,
    );
  } catch (e: unknown) {
    return createApiErrorResponse(e, {
      requestId,
      defaultMessage: "Quote failed",
      fallbackBody: { success: false },
      logPrefix: "api/checkout/quote-totals",
    });
  }
}
