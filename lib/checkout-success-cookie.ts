/**
 * Short-lived cookie set on successful POST /api/checkout so the browser can
 * complete the flow when a proxy strips the JSON body or custom X-* headers.
 * Non-HttpOnly so client JS can read once and clear (Path=/, short Max-Age).
 */
export const CHECKOUT_SUCCESS_COOKIE = "checkout_done";

export function encodeCheckoutSuccessCookie(
  orderId: string | number | undefined | null,
  orderRefForUrl: string | number | undefined | null
): string {
  const i = orderId != null && String(orderId) !== "" ? String(orderId) : "";
  const r = orderRefForUrl != null && String(orderRefForUrl) !== "" ? String(orderRefForUrl) : i;
  return encodeURIComponent(JSON.stringify({ i, r }));
}

export function decodeCheckoutSuccessCookieParam(raw: string): {
  id: string;
  ref: string;
} | null {
  try {
    const o = JSON.parse(decodeURIComponent(raw)) as { i?: string; r?: string };
    if (!o || typeof o !== "object") return null;
    const i = String(o.i ?? "");
    const r = String(o.r ?? i);
    if (!i && !r) return null;
    return { id: i, ref: r };
  } catch {
    return null;
  }
}

/** Read cookie value from document.cookie (client only). */
export function parseCheckoutSuccessCookieFromDocument(): {
  id: string;
  ref: string;
} | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CHECKOUT_SUCCESS_COOKIE}=([^;]*)`));
  const raw = match?.[1];
  if (!raw) return null;
  return decodeCheckoutSuccessCookieParam(raw);
}

export function clearCheckoutSuccessCookieClient() {
  if (typeof document === "undefined") return;
  const secure =
    typeof window !== "undefined" && window.location?.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CHECKOUT_SUCCESS_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}
