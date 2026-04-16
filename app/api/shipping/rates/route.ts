import { NextRequest, NextResponse } from "next/server";
import { computeShippingRates } from "@/lib/shipping-rates-server";
import type { ComputedShippingRate } from "@/lib/shipping-rates-server";

export const dynamic = "force-dynamic";

function isAddressComplete(input: { country: string; state: string; city: string; postcode: string }): boolean {
  return Boolean(
    String(input.country || "").trim() &&
      String(input.state || "").trim() &&
      String(input.city || "").trim() &&
      String(input.postcode || "").trim()
  );
}

function shouldShowFreeShipping(rate: ComputedShippingRate, cartSubtotal: number): boolean {
  const minimumOk =
    typeof rate.minimum_amount === "number" ? cartSubtotal >= rate.minimum_amount : true;
  const requires = String(rate.requires || "").trim().toLowerCase();

  // Hide when Woo requires coupon (or min+coupon) because coupon context is not passed here.
  if (requires === "coupon" || requires === "both") return false;
  return minimumOk;
}

function applyShippingDisplayCriteria(
  rates: ComputedShippingRate[],
  input: { country: string; state: string; city: string; postcode: string; cartSubtotal: number }
): ComputedShippingRate[] {
  const addressReady = isAddressComplete(input);
  return rates.filter((rate) => {
    if (String(rate.method_id).trim().toLowerCase() !== "free_shipping") return true;
    if (!addressReady) return false;
    return shouldShowFreeShipping(rate, input.cartSubtotal);
  });
}

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

    const ratesRaw = Array.isArray(result?.rates) ? (result.rates as ComputedShippingRate[]) : [];
    const rates = applyShippingDisplayCriteria(ratesRaw, {
      country,
      state,
      city,
      postcode,
      cartSubtotal: cartSubtotalSafe,
    });

    // ✅ 3. SAFE RESPONSE
    return NextResponse.json(
      { rates },
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