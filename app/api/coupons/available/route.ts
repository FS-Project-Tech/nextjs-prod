import { NextRequest, NextResponse } from "next/server";
import wcAPI from "@/lib/woocommerce";
import { createPublicApiHandler, API_TIMEOUT } from "@/lib/api-middleware";
import { sanitizeResponse } from "@/lib/sanitize";

/**
 * GET /api/coupons/available
 * Fetch available coupons based on cart subtotal
 * Returns coupons that meet minimum spend requirements
 */
async function getAvailableCoupons(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subtotal = parseFloat(searchParams.get("subtotal") || "0");

    // Fetch all published coupons
    const response = await wcAPI.get("/coupons", {
      params: {
        status: "publish",
        per_page: 100,
        orderby: "date",
        order: "desc",
      },
    });

    const coupons = response.data || [];
    const now = new Date();

    // Filter and format available coupons
    const availableCoupons = coupons
      .filter((coupon: any) => {
        // Check if coupon is expired
        if (coupon.date_expires && new Date(coupon.date_expires) < now) {
          return false;
        }

        // Check usage limits
        if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
          return false;
        }

        // Check minimum amount requirement
        if (coupon.minimum_amount) {
          const minAmount = parseFloat(coupon.minimum_amount);
          if (subtotal < minAmount) {
            return false; // Don't show if cart doesn't meet minimum
          }
        }

        return true;
      })
      .map((coupon: any) => {
        // Calculate potential discount
        let discountAmount = 0;
        const minAmount = coupon.minimum_amount ? parseFloat(coupon.minimum_amount) : 0;

        switch (coupon.discount_type) {
          case "percent":
            discountAmount = (subtotal * parseFloat(coupon.amount || "0")) / 100;
            if (coupon.maximum_amount) {
              discountAmount = Math.min(discountAmount, parseFloat(coupon.maximum_amount));
            }
            break;
          case "fixed_cart":
            discountAmount = parseFloat(coupon.amount || "0");
            break;
          case "fixed_product":
            // For fixed_product, we'd need cart items to calculate accurately
            // For now, show the amount per product
            discountAmount = parseFloat(coupon.amount || "0");
            break;
        }

        return {
          id: coupon.id,
          code: coupon.code,
          type: coupon.discount_type,
          amount: coupon.amount,
          minimum_amount: coupon.minimum_amount,
          maximum_amount: coupon.maximum_amount,
          description: coupon.description || "",
          expiry_date: coupon.date_expires,
          usage_limit: coupon.usage_limit,
          usage_count: coupon.usage_count,
          discount_amount: Math.min(discountAmount, subtotal), // Don't exceed subtotal
          min_spend: minAmount,
          is_eligible: subtotal >= minAmount,
        };
      })
      .sort((a: any, b: any) => {
        // Sort by discount amount (highest first), then by minimum spend (lowest first)
        if (b.discount_amount !== a.discount_amount) {
          return b.discount_amount - a.discount_amount;
        }
        return (a.min_spend || 0) - (b.min_spend || 0);
      });

    return NextResponse.json({
      coupons: availableCoupons,
      count: availableCoupons.length,
    });
  } catch (error) {
    console.error("Available coupons error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch available coupons",
        details: error instanceof Error ? error.message : "An error occurred",
        coupons: [],
        count: 0,
      },
      { status: 500 }
    );
  }
}

// Export with security middleware
export const GET = createPublicApiHandler(getAvailableCoupons, {
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 requests per minute
  },
  timeout: API_TIMEOUT.DEFAULT,
  sanitize: true,
  allowedMethods: ["GET"],
});
