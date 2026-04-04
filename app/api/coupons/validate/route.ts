import { NextRequest, NextResponse } from "next/server";
import wcAPI from "@/lib/woocommerce";
import { createPublicApiHandler, API_TIMEOUT } from "@/lib/api-middleware";
import { sanitizeResponse } from "@/lib/sanitize";

/**
 * Validate coupon code via WooCommerce API
 * Returns discount amount and details if valid
 * Protected with rate limiting and response sanitization
 */
async function validateCoupon(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, items = [], subtotal } = body;

    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Coupon code is required" }, { status: 400 });
    }

    const trimmedCode = code.trim();

    // Fetch coupon from WooCommerce (try exact match first, then search - case-insensitive)
    let coupon;
    try {
      let response = await wcAPI.get("/coupons", {
        params: { code: trimmedCode, per_page: 1 },
      });
      let coupons = response.data;
      if (!coupons || coupons.length === 0) {
        response = await wcAPI.get("/coupons", {
          params: { search: trimmedCode, per_page: 10 },
        });
        coupons = response.data || [];
        coupon = Array.isArray(coupons)
          ? (coupons.find(
              (c: { code?: string }) => (c.code || "").toLowerCase() === trimmedCode.toLowerCase()
            ) ?? coupons[0])
          : null;
      } else {
        coupon = coupons[0];
      }
    } catch (error) {
      console.error("Coupon fetch error:", error);
      return NextResponse.json({ error: "Failed to validate coupon" }, { status: 500 });
    }

    if (!coupon) {
      return NextResponse.json(
        {
          valid: false,
          error: "Invalid coupon code",
        },
        { status: 200 } // Return 200 with valid: false for frontend handling
      );
    }

    // Check if coupon is active
    if (coupon.status !== "publish") {
      return NextResponse.json({
        valid: false,
        error: "This coupon is not active",
      });
    }

    // Check expiry dates
    const now = new Date();
    if (coupon.date_expires && new Date(coupon.date_expires) < now) {
      return NextResponse.json({
        valid: false,
        error: "This coupon has expired",
      });
    }

    // Check usage limits
    if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
      return NextResponse.json({
        valid: false,
        error: "This coupon has reached its usage limit",
      });
    }

    const discountTypeRaw = (coupon.discount_type || "fixed_cart").toLowerCase();
    const normalizedType = discountTypeRaw === "percentage" ? "percent" : discountTypeRaw;
    const isPercent = normalizedType === "percent" || discountTypeRaw.includes("percent");

    // Calculate discount when subtotal is provided
    let discount = 0;
    const subtotalNum =
      typeof subtotal === "number" ? subtotal : parseFloat(String(subtotal || 0)) || 0;
    if (subtotalNum > 0 && Array.isArray(items)) {
      let applicableSubtotal = subtotalNum;
      let applicableItems = items;

      if (coupon.minimum_amount && parseFloat(coupon.minimum_amount) > subtotalNum) {
        return NextResponse.json({
          valid: false,
          error: `Minimum order amount of $${coupon.minimum_amount} required`,
        });
      }
      if (coupon.exclude_sale_items) {
        applicableItems = items.filter((item: any) => !item.on_sale);
        applicableSubtotal = applicableItems.reduce(
          (sum: number, item: any) => sum + parseFloat(item.price || 0) * item.qty,
          0
        );
      }
      if (coupon.product_ids && coupon.product_ids.length > 0) {
        applicableItems = items.filter((item: any) =>
          coupon.product_ids.some((id: any) => Number(id) === Number(item.productId))
        );
        applicableSubtotal = applicableItems.reduce(
          (sum: number, item: any) => sum + parseFloat(item.price || 0) * item.qty,
          0
        );
        if (applicableItems.length === 0) {
          return NextResponse.json({
            valid: false,
            error: "This coupon is not valid for the products in your cart.",
          });
        }
      }
      if (coupon.excluded_product_ids && coupon.excluded_product_ids.length > 0) {
        applicableItems = items.filter(
          (item: any) =>
            !coupon.excluded_product_ids.some((id: any) => Number(id) === Number(item.productId))
        );
        applicableSubtotal = applicableItems.reduce(
          (sum: number, item: any) => sum + parseFloat(item.price || 0) * item.qty,
          0
        );
      }

      if (applicableItems.length === 0) {
        return NextResponse.json({
          valid: false,
          error: "This coupon is not valid for the products in your cart.",
        });
      }

      if (isPercent || discountTypeRaw === "percent" || discountTypeRaw === "percentage") {
        discount = (applicableSubtotal * parseFloat(coupon.amount || "0")) / 100;
        if (coupon.maximum_amount) {
          discount = Math.min(discount, parseFloat(coupon.maximum_amount));
        }
      } else if (discountTypeRaw === "fixed_cart") {
        discount = parseFloat(coupon.amount || "0");
      } else if (discountTypeRaw === "fixed_product") {
        discount = applicableItems.reduce((sum: number, item: any) => {
          return (
            sum +
            Math.min(
              parseFloat(coupon.amount || "0") * item.qty,
              parseFloat(item.price || "0") * item.qty
            )
          );
        }, 0);
      }
      discount = Math.min(discount, applicableSubtotal);
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[Coupon API]", {
        code: trimmedCode,
        subtotalNum,
        discountType: coupon.discount_type,
        amount: coupon.amount,
        discount,
      });
    }

    return NextResponse.json({
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        type: normalizedType,
        amount: coupon.amount,
        minimum_amount: coupon.minimum_amount,
        maximum_amount: coupon.maximum_amount,
        individual_use: coupon.individual_use,
        exclude_sale_items: coupon.exclude_sale_items,
        product_ids: coupon.product_ids || [],
        excluded_product_ids: coupon.excluded_product_ids || [],
        product_categories: coupon.product_categories || [],
        excluded_product_categories: coupon.excluded_product_categories || [],
        usage_limit: coupon.usage_limit,
        usage_count: coupon.usage_count,
        expiry_date: coupon.date_expires,
      },
      discount: parseFloat(discount.toFixed(2)),
    });
  } catch (error) {
    console.error("Coupon validation error:", error);
    return NextResponse.json(
      {
        error: "Coupon validation failed",
        details: error instanceof Error ? error.message : "An error occurred",
      },
      { status: 500 }
    );
  }
}

/**
 * Calculate discount amount for cart items
 * Protected with rate limiting and response sanitization
 */
async function calculateDiscount(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, items, subtotal } = body;

    if (!code || !items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: "Coupon code, items, and subtotal are required" },
        { status: 400 }
      );
    }

    // Fetch coupon (same lookup as validateCoupon - case-insensitive)
    const trimmedCode = typeof code === "string" ? code.trim() : "";
    let coupon;
    let response = await wcAPI.get("/coupons", {
      params: { code: trimmedCode, per_page: 1 },
    });
    let coupons = response.data;
    if (!coupons || coupons.length === 0) {
      response = await wcAPI.get("/coupons", {
        params: { search: trimmedCode, per_page: 10 },
      });
      coupons = response.data || [];
      coupon = Array.isArray(coupons)
        ? (coupons.find(
            (c: { code?: string }) => (c.code || "").toLowerCase() === trimmedCode.toLowerCase()
          ) ?? coupons[0])
        : null;
    } else {
      coupon = coupons[0];
    }

    if (!coupon || coupon.status !== "publish") {
      return NextResponse.json({
        valid: false,
        discount: 0,
        error: "Invalid coupon",
      });
    }

    // Calculate discount based on coupon type
    let discount = 0;
    const subtotalNum =
      typeof subtotal === "number" ? subtotal : parseFloat(String(subtotal || 0)) || 0;
    let applicableSubtotal = subtotalNum;

    // Check minimum amount
    if (coupon.minimum_amount && parseFloat(coupon.minimum_amount) > subtotalNum) {
      return NextResponse.json({
        valid: false,
        discount: 0,
        error: `Minimum order amount of $${coupon.minimum_amount} required`,
      });
    }

    // Filter items based on coupon restrictions
    let applicableItems = items;
    if (coupon.exclude_sale_items) {
      // Filter out sale items
      applicableItems = items.filter((item: any) => !item.on_sale);
      applicableSubtotal = applicableItems.reduce(
        (sum: number, item: any) => sum + parseFloat(item.price || 0) * item.qty,
        0
      );
    }

    if (coupon.product_ids && coupon.product_ids.length > 0) {
      // Only apply to specific products
      applicableItems = items.filter((item: any) =>
        coupon.product_ids.some((id: any) => Number(id) === Number(item.productId))
      );
      applicableSubtotal = applicableItems.reduce(
        (sum: number, item: any) => sum + parseFloat(item.price || 0) * item.qty,
        0
      );
      if (applicableItems.length === 0) {
        return NextResponse.json({
          valid: false,
          discount: 0,
          error: "This coupon is not valid for the products in your cart.",
        });
      }
    }

    if (coupon.excluded_product_ids && coupon.excluded_product_ids.length > 0) {
      // Exclude specific products
      applicableItems = items.filter(
        (item: any) =>
          !coupon.excluded_product_ids.some((id: any) => Number(id) === Number(item.productId))
      );
      applicableSubtotal = applicableItems.reduce(
        (sum: number, item: any) => sum + parseFloat(item.price || 0) * item.qty,
        0
      );
    }

    if (applicableItems.length === 0) {
      return NextResponse.json({
        valid: false,
        discount: 0,
        error: "This coupon is not valid for the products in your cart.",
      });
    }

    // Calculate discount (WooCommerce may return 'percent' or 'percentage')
    const discountType = (coupon.discount_type || "").toLowerCase();
    switch (discountType) {
      case "percent":
      case "percentage":
        discount = (applicableSubtotal * parseFloat(coupon.amount || "0")) / 100;
        if (coupon.maximum_amount) {
          discount = Math.min(discount, parseFloat(coupon.maximum_amount));
        }
        break;
      case "fixed_cart":
        discount = parseFloat(coupon.amount || "0");
        break;
      case "fixed_product":
        // Apply to each applicable item
        discount = applicableItems.reduce((sum: number, item: any) => {
          return (
            sum +
            Math.min(
              parseFloat(coupon.amount || "0") * item.qty,
              parseFloat(item.price || "0") * item.qty
            )
          );
        }, 0);
        break;
      default:
        discount = 0;
    }

    // Ensure discount doesn't exceed subtotal
    discount = Math.min(discount, applicableSubtotal);

    return NextResponse.json({
      valid: true,
      discount: parseFloat(discount.toFixed(2)),
      coupon: {
        code: coupon.code,
        type: coupon.discount_type,
        amount: coupon.amount,
      },
    });
  } catch (error) {
    console.error("Discount calculation error:", error);
    const message = error instanceof Error ? error.message : "Discount calculation failed";
    return NextResponse.json(
      {
        error: "Discount calculation failed",
        details: message,
      },
      { status: 500 }
    );
  }
}

// Export with security middleware
export const POST = createPublicApiHandler(validateCoupon, {
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 requests per minute (lower for coupon validation)
  },
  timeout: API_TIMEOUT.DEFAULT,
  sanitize: true,
  allowedMethods: ["POST"],
});

// Export PUT handler with security middleware
export const PUT = createPublicApiHandler(calculateDiscount, {
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 requests per minute
  },
  timeout: API_TIMEOUT.DEFAULT,
  sanitize: true,
  allowedMethods: ["PUT"],
});
