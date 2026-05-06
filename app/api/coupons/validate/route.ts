import { NextRequest, NextResponse } from "next/server";
import { createPublicApiHandler, API_TIMEOUT } from "@/lib/api-middleware";
import { wcGet } from "@/lib/woocommerce/wc-fetch";
import { computeWooCouponDiscount, type PricedCartLineForCoupon } from "@/lib/coupon/computeWooCouponDiscount";
import { fetchLineCouponMeta } from "@/lib/coupon/fetchLineCouponMeta";
import { wooCouponOrderGate } from "@/lib/coupon/wooCouponOrderGate";
import { restrictionsFromWooCoupon } from "@/lib/coupon/wooCouponEligibility";

function normalizeDiscountType(coupon: Record<string, unknown>): string {
  const raw = String(coupon.discount_type ?? "fixed_cart").toLowerCase();
  if (raw === "percentage" || raw.includes("percent")) return "percent";
  return raw;
}

async function fetchCouponByCode(trimmedCode: string): Promise<Record<string, unknown> | null> {
  try {
    let res = await wcGet<unknown[]>("/coupons", { code: trimmedCode, per_page: 1 }, "noStore");
    let coupons = res.data;
    if (!Array.isArray(coupons) || coupons.length === 0) {
      res = await wcGet<unknown[]>("/coupons", { search: trimmedCode, per_page: 10 }, "noStore");
      coupons = res.data || [];
      const found = Array.isArray(coupons)
        ? coupons.find(
            (c: unknown) =>
              typeof c === "object" &&
              c !== null &&
              String((c as { code?: string }).code ?? "").toLowerCase() === trimmedCode.toLowerCase(),
          )
        : undefined;
      return (found as Record<string, unknown>) ?? null;
    }
    return (coupons[0] as Record<string, unknown>) ?? null;
  } catch (e) {
    console.error("Coupon fetch error:", e);
    return null;
  }
}

type RawLine = Record<string, unknown>;

function parseBodyItems(items: unknown): RawLine[] {
  if (!Array.isArray(items)) return [];
  return items.filter((x): x is RawLine => Boolean(x) && typeof x === "object");
}

async function buildPricedLines(items: RawLine[]): Promise<PricedCartLineForCoupon[]> {
  const out: PricedCartLineForCoupon[] = [];
  for (const r of items) {
    const productId = Number(r.productId ?? r.product_id ?? 0);
    const vid = Number(r.variationId ?? r.variation_id ?? 0);
    const qty = Math.max(1, Math.floor(Number(r.qty ?? r.quantity ?? 1) || 1));
    if (!Number.isFinite(productId) || productId <= 0) continue;
    const variationId = Number.isFinite(vid) && vid > 0 ? vid : undefined;

    const meta = await fetchLineCouponMeta(productId, variationId ?? 0);
    const clientPrice = Number.parseFloat(String(r.price ?? r.unit ?? ""));
    const unit = Number.isFinite(clientPrice) && clientPrice > 0 ? clientPrice : meta.unit;
    const onSale = typeof r.on_sale === "boolean" ? r.on_sale : meta.on_sale;

    out.push({
      product_id: productId,
      ...(variationId ? { variation_id: variationId } : {}),
      quantity: qty,
      unit,
      on_sale: onSale,
      category_ids: meta.category_ids,
    });
  }
  return out;
}

function publicCouponPayload(coupon: Record<string, unknown>, normalizedType: string) {
  return {
    id: coupon.id,
    code: coupon.code,
    type: normalizedType,
    amount: coupon.amount,
    minimum_amount: coupon.minimum_amount,
    maximum_amount: coupon.maximum_amount,
    individual_use: coupon.individual_use,
    exclude_sale_items: coupon.exclude_sale_items,
    product_ids: coupon.product_ids ?? [],
    excluded_product_ids: coupon.excluded_product_ids ?? [],
    product_categories: coupon.product_categories ?? [],
    excluded_product_categories: coupon.excluded_product_categories ?? [],
    usage_limit: coupon.usage_limit,
    usage_count: coupon.usage_count,
    expiry_date: coupon.date_expires,
  };
}

async function validateCoupon(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { code, items = [], subtotal } = body as {
      code?: unknown;
      items?: unknown;
      subtotal?: unknown;
    };

    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Coupon code is required" }, { status: 400 });
    }

    const trimmedCode = code.trim();
    const coupon = await fetchCouponByCode(trimmedCode);

    if (!coupon) {
      return NextResponse.json(
        { valid: false, error: "Invalid coupon code" },
        { status: 200 },
      );
    }

    const rawRows = parseBodyItems(items);
    const lines = await buildPricedLines(rawRows);

    if (rawRows.length > 0 && lines.length === 0) {
      return NextResponse.json(
        { valid: false, error: "No valid line items for this coupon." },
        { status: 200 },
      );
    }

    const computedSubtotal = lines.reduce((s, l) => s + l.unit * l.quantity, 0);
    const subtotalNum =
      typeof subtotal === "number"
        ? subtotal
        : Number.parseFloat(String(subtotal ?? "0")) || 0;
    const orderSubtotal = lines.length > 0 ? computedSubtotal : subtotalNum;

    const gate = wooCouponOrderGate(coupon, orderSubtotal);
    if (!gate.ok) {
      return NextResponse.json({ valid: false, error: gate.error }, { status: 200 });
    }

    if (lines.length === 0) {
      const r = restrictionsFromWooCoupon(coupon);
      const needsCartLines =
        r.product_ids.length > 0 ||
        r.product_categories.length > 0 ||
        r.excluded_product_ids.length > 0 ||
        r.excluded_product_categories.length > 0 ||
        Boolean(coupon.exclude_sale_items);
      if (needsCartLines) {
        return NextResponse.json(
          {
            valid: false,
            error: "This coupon applies to your cart contents. Add items to validate it.",
          },
          { status: 200 },
        );
      }
    }

    const normalizedType = normalizeDiscountType(coupon);
    const { discount, hasEligibleLine } = computeWooCouponDiscount(coupon, lines);

    if (lines.length > 0 && !hasEligibleLine) {
      return NextResponse.json(
        {
          valid: false,
          error: "This coupon is not valid for the products in your cart.",
        },
        { status: 200 },
      );
    }

    let finalDiscount = discount;
    if (lines.length === 0) {
      const amount = Number.parseFloat(String(coupon.amount ?? "0")) || 0;
      if (normalizedType === "percent") {
        finalDiscount = (orderSubtotal * amount) / 100;
        const cap = coupon.maximum_amount ? Number.parseFloat(String(coupon.maximum_amount)) : NaN;
        if (Number.isFinite(cap) && cap > 0) finalDiscount = Math.min(finalDiscount, cap);
      } else if (normalizedType === "fixed_cart") {
        finalDiscount = amount;
      } else {
        finalDiscount = 0;
      }
      finalDiscount = Math.min(finalDiscount, Math.max(0, orderSubtotal));
      finalDiscount = Number(finalDiscount.toFixed(2));
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[Coupon API]", {
        code: trimmedCode,
        orderSubtotal,
        discountType: coupon.discount_type,
        amount: coupon.amount,
        discount: finalDiscount,
      });
    }

    return NextResponse.json({
      valid: true,
      coupon: publicCouponPayload(coupon, normalizedType),
      discount: finalDiscount,
    });
  } catch (error) {
    console.error("Coupon validation error:", error);
    return NextResponse.json(
      {
        error: "Coupon validation failed",
        details: error instanceof Error ? error.message : "An error occurred",
      },
      { status: 500 },
    );
  }
}

/** Same validation + discount math as POST (for cart preview). */
async function calculateDiscount(req: NextRequest) {
  return validateCoupon(req);
}

export const POST = createPublicApiHandler(validateCoupon, {
  rateLimit: {
    windowMs: 60 * 1000,
    maxRequests: 30,
  },
  timeout: API_TIMEOUT.DEFAULT,
  sanitize: true,
  allowedMethods: ["POST"],
});

export const PUT = createPublicApiHandler(calculateDiscount, {
  rateLimit: {
    windowMs: 60 * 1000,
    maxRequests: 30,
  },
  timeout: API_TIMEOUT.DEFAULT,
  sanitize: true,
  allowedMethods: ["PUT"],
});
