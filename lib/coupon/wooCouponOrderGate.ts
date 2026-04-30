/**
 * Order-level Woo coupon checks (before line-item eligibility / discount math).
 */
export function wooCouponOrderGate(
  coupon: Record<string, unknown>,
  orderSubtotal: number,
): { ok: boolean; error?: string } {
  if (String(coupon.status ?? "") !== "publish") {
    return { ok: false, error: "This coupon is not active" };
  }

  const exp = coupon.date_expires;
  if (exp != null && String(exp).trim() !== "") {
    const d = new Date(String(exp));
    if (!Number.isNaN(d.getTime()) && d < new Date()) {
      return { ok: false, error: "This coupon has expired" };
    }
  }

  const limit = coupon.usage_limit != null ? Number(coupon.usage_limit) : 0;
  const count = coupon.usage_count != null ? Number(coupon.usage_count) : 0;
  if (limit > 0 && count >= limit) {
    return { ok: false, error: "This coupon has reached its usage limit" };
  }

  const minAmt = Number.parseFloat(String(coupon.minimum_amount ?? "")) || 0;
  if (minAmt > 0 && orderSubtotal < minAmt) {
    return { ok: false, error: `Minimum order amount of $${minAmt} required` };
  }

  return { ok: true };
}
