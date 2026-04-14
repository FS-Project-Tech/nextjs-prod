import { NextRequest, NextResponse } from "next/server";
import { computeShippingRates } from "@/lib/shipping-rates-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const country = searchParams.get("country") || "AU";
    const state = searchParams.get("state") || "";
    const postcode = searchParams.get("postcode") || "";
    const city = searchParams.get("city") || "";

    const subtotalRaw = searchParams.get("subtotal");
    const cartSubtotal = Number.parseFloat(subtotalRaw || "0");
    const cartSubtotalSafe = Number.isFinite(cartSubtotal) ? cartSubtotal : 0;

    // ✅ 1. VALIDATION (CRITICAL)
    if (!country || !postcode) {
      return NextResponse.json(
        { error: "Missing required fields", rates: [] },
        { status: 400 }
      );
    }

    if (cartSubtotalSafe <= 0) {
      return NextResponse.json(
        { error: "Invalid subtotal", rates: [] },
        { status: 400 }
      );
    }

    // ✅ 2. TIMEOUT WRAPPER (prevents hanging)
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout fetching shipping")), 8000)
    );

    const result = await Promise.race([
      computeShippingRates({
        country,
        state,
        postcode,
        city,
        cartSubtotal: cartSubtotalSafe,
      }),
      timeout,
    ]) as { rates: any[] };

    // ✅ 3. SAFE RESPONSE
    return NextResponse.json(
      { rates: result?.rates || [] },
      { status: 200 }
    );

  } catch (e: any) {
    console.error("[api/shipping/rates ERROR]", {
      message: e?.message,
      stack: e?.stack,
    });

    return NextResponse.json(
      { error: "Shipping fetch failed", rates: [] },
      { status: 500 }
    );
  }
}