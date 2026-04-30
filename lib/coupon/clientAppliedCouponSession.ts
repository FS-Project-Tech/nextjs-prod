/** Session keys for the headless applied coupon (see CouponProvider). */

export const APPLIED_COUPON_SESSION_KEY = "applied_coupon";
export const COUPON_DISCOUNT_SESSION_KEY = "coupon_discount";

export type StoredAppliedCoupon = { code: string | null; discount: number };

/**
 * Read persisted coupon from sessionStorage (sync).
 * Used so Strict Mode remounts / navigation can restore without a flash or delayed effect.
 */
export function readAppliedCouponFromSession(): StoredAppliedCoupon {
  if (typeof window === "undefined") return { code: null, discount: 0 };
  try {
    const rawCode = sessionStorage.getItem(APPLIED_COUPON_SESSION_KEY)?.trim();
    const code = rawCode && rawCode.length > 0 ? rawCode : null;
    const dr = sessionStorage.getItem(COUPON_DISCOUNT_SESSION_KEY);
    let discount = 0;
    if (dr != null && dr !== "") {
      const n = Number.parseFloat(dr);
      if (Number.isFinite(n) && n >= 0) discount = n;
    }
    return { code, discount };
  } catch {
    return { code: null, discount: 0 };
  }
}
