import { NextRequest, NextResponse } from "next/server";
import { computeShippingRates } from "@/lib/shipping-rates-server";

export const dynamic = "force-dynamic";

/**
 * GET — server-side Woo zone/method resolution (same engine as checkout order pricing).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const country = searchParams.get("country") || "AU";
  const state = searchParams.get("state") || "";
  const postcode = searchParams.get("postcode") || "";
  const city = searchParams.get("city") || "";
  const subtotalRaw = searchParams.get("subtotal");
  const cartSubtotal = Number.parseFloat(subtotalRaw || "0");
  const cartSubtotalSafe = Number.isFinite(cartSubtotal) ? cartSubtotal : 0;

  try {
    const { rates } = await computeShippingRates({
      country,
      state,
      postcode,
      city,
      cartSubtotal: cartSubtotalSafe,
    });
    return NextResponse.json({ rates }, { status: 200 });
  } catch (e) {
    console.error("[api/shipping/rates]", e);
    return NextResponse.json(
      { error: "Shipping fetch failed", rates: [] },
      { status: 500 },
    );
  }
}
