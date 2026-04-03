import { NextResponse } from "next/server";
import { computeShippingRates } from "@/lib/shipping-rates-server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let country = (searchParams.get("country") || "AU").trim().toUpperCase();
    if (country === "AUSTRALIA") country = "AU";
    const state = (searchParams.get("state") || "").trim();
    const postcode = (searchParams.get("postcode") || "").trim();
    const city = (searchParams.get("city") || "").trim();
    const subtotal = searchParams.get("subtotal");
    const cartSubtotal = subtotal ? parseFloat(subtotal) : 0;

    const { rates } = await computeShippingRates({
      country,
      state,
      postcode,
      city,
      cartSubtotal,
    });

    return NextResponse.json({ rates });
  } catch (error) {
    const axiosLike = error as { response?: { status?: number; data?: unknown } };
    const status = axiosLike.response?.status || 500;
    const message = axiosLike.response?.data || { message: "Failed to fetch shipping rates" };
    return NextResponse.json(message, { status });
  }
}
