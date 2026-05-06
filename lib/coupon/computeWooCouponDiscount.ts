import {
  cartLineEligibleForCouponDiscount,
  restrictionsFromWooCoupon,
} from "@/lib/coupon/wooCouponEligibility";

/** One cart line with Woo REST pricing + taxonomy + sale flag (mirrors WC cart item eligibility). */
export type PricedCartLineForCoupon = {
  product_id: number;
  variation_id?: number;
  quantity: number;
  unit: number;
  on_sale: boolean;
  category_ids: number[];
};

/**
 * Computes discount amount from WC REST coupon object and priced lines (same cases as core Woo:
 * percent, fixed_cart, fixed_product; product/category restrictions; exclude_sale_items).
 */
export function computeWooCouponDiscount(
  coupon: Record<string, unknown>,
  lines: PricedCartLineForCoupon[],
): { discount: number; hasEligibleLine: boolean } {
  if (!lines.length) {
    return { discount: 0, hasEligibleLine: false };
  }

  const restriction = restrictionsFromWooCoupon(coupon);
  const excludeSale = Boolean(coupon.exclude_sale_items);

  const eligibleByProductRules = lines.map((line) =>
    cartLineEligibleForCouponDiscount(
      { product_id: line.product_id, variation_id: line.variation_id },
      restriction,
      line.category_ids,
    ),
  );

  const inDiscountPool = lines.map((line, i) => {
    if (!eligibleByProductRules[i]) return false;
    if (excludeSale && line.on_sale) return false;
    return true;
  });

  const eligibleSubtotal = lines.reduce(
    (sum, line, i) => sum + (inDiscountPool[i] ? line.unit * line.quantity : 0),
    0,
  );

  const anyEligible = inDiscountPool.some(Boolean);
  const cartSubtotal = lines.reduce((sum, line) => sum + line.unit * line.quantity, 0);

  const amount = Number.parseFloat(String(coupon.amount || "0")) || 0;
  const rawType = String(coupon.discount_type || "").toLowerCase();
  const type =
    rawType === "percentage" || rawType.includes("percent") ? "percent" : rawType;

  let discount = 0;

  if (type === "percent") {
    discount = (eligibleSubtotal * amount) / 100;
    const cap = coupon.maximum_amount ? Number.parseFloat(String(coupon.maximum_amount)) : NaN;
    if (Number.isFinite(cap) && cap > 0) {
      discount = Math.min(discount, cap);
    }
  } else if (type === "fixed_cart") {
    discount = anyEligible ? amount : 0;
  } else if (type === "fixed_product") {
    discount = lines.reduce((sum, line, i) => {
      if (!inDiscountPool[i]) return sum;
      const lineTot = line.unit * line.quantity;
      return sum + Math.min(amount * line.quantity, lineTot);
    }, 0);
  }

  discount = Math.min(discount, cartSubtotal);
  if (!Number.isFinite(discount) || discount < 0) discount = 0;

  return {
    discount: Number(discount.toFixed(2)),
    hasEligibleLine: anyEligible,
  };
}
