import { NextRequest, NextResponse } from "next/server";
import { computeShippingRates } from "@/lib/shipping-rates-server";
import type { ComputedShippingRate } from "@/lib/shipping-rates-server";
import { fetchProductsByIdsForServer } from "@/lib/woo-rest-server";

export const dynamic = "force-dynamic";

const MOLICARE_BRAND_SLUG = "molicare";
const BRAND_ATTRIBUTE_KEYS = ["brand", "brands", "pa_brand", "product_brand"];

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

function parseProductIdsParam(raw: string | null): number[] {
  if (!raw) return [];
  return [...new Set(
    raw
      .split(",")
      .map((x) => Number.parseInt(x.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0)
  )];
}

function hasMolicareInBrandList(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((entry) => {
    const e = entry as { slug?: unknown; name?: unknown };
    const slug = String(e?.slug ?? "").trim().toLowerCase();
    const name = String(e?.name ?? "").trim().toLowerCase();
    return slug === MOLICARE_BRAND_SLUG || name.includes(MOLICARE_BRAND_SLUG);
  });
}

function hasMolicareInAttributes(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((entry) => {
    const attr = entry as { name?: unknown; options?: unknown; option?: unknown };
    const attrName = String(attr?.name ?? "").trim().toLowerCase();
    if (!BRAND_ATTRIBUTE_KEYS.some((k) => attrName.includes(k))) return false;

    const options = Array.isArray(attr?.options) ? attr.options : [attr?.option];
    return options.some((opt) => String(opt ?? "").trim().toLowerCase().includes(MOLICARE_BRAND_SLUG));
  });
}

function productIsMolicare(product: unknown): boolean {
  const p = product as {
    brands?: unknown;
    brand?: unknown;
    attributes?: unknown;
    name?: unknown;
    slug?: unknown;
  };

  if (hasMolicareInBrandList(p.brands) || hasMolicareInBrandList(p.brand)) return true;
  if (hasMolicareInAttributes(p.attributes)) return true;

  const name = String(p?.name ?? "").trim().toLowerCase();
  const slug = String(p?.slug ?? "").trim().toLowerCase();
  return name.includes(MOLICARE_BRAND_SLUG) || slug.includes(MOLICARE_BRAND_SLUG);
}

async function cartHasMolicareBrand(productIds: number[]): Promise<boolean> {
  if (productIds.length === 0) return false;
  try {
    const products = await fetchProductsByIdsForServer(productIds);
    if (!Array.isArray(products) || products.length === 0) return false;
    return products.some(productIsMolicare);
  } catch {
    return false;
  }
}

function applyShippingDisplayCriteria(
  rates: ComputedShippingRate[],
  input: { country: string; state: string; city: string; postcode: string; cartSubtotal: number },
  hasMolicareBrand: boolean
): ComputedShippingRate[] {
  const addressReady = isAddressComplete(input);
  let freeShippingSelected = false;
  return rates.filter((rate) => {
    if (String(rate.method_id).trim().toLowerCase() !== "free_shipping") return true;
    if (!addressReady) return false;

    // Keep only one free-shipping option in checkout UI (first matching Woo rate wins).
    if (freeShippingSelected) return false;

    // Business rule: any MoliCare product in cart unlocks free shipping visibility.
    if (hasMolicareBrand) {
      freeShippingSelected = true;
      return true;
    }

    const allowed = shouldShowFreeShipping(rate, input.cartSubtotal);
    if (allowed) freeShippingSelected = true;
    return allowed;
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
    const productIds = parseProductIdsParam(searchParams.get("productIds"));

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

    const [result, hasMolicareBrand] = await Promise.all([
      Promise.race([
        computeShippingRates({
          country,
          state,
          postcode,
          city,
          cartSubtotal: cartSubtotalSafe,
        }),
        timeout,
      ]) as Promise<{ rates: any[] }>,
      cartHasMolicareBrand(productIds),
    ]);

    const ratesRaw = Array.isArray(result?.rates) ? (result.rates as ComputedShippingRate[]) : [];
    const rates = applyShippingDisplayCriteria(ratesRaw, {
      country,
      state,
      city,
      postcode,
      cartSubtotal: cartSubtotalSafe,
    }, hasMolicareBrand);
    const molicareFreeShippingApplied =
      hasMolicareBrand &&
      rates.some((r) => String(r.method_id).trim().toLowerCase() === "free_shipping");

    // ✅ 3. SAFE RESPONSE
    return NextResponse.json(
      {
        rates,
        molicareFreeShippingApplied,
        notice: molicareFreeShippingApplied ? "Molicare FREE Shipping applied" : undefined,
      },
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
