/** Query params removed from `/checkout` after read (toasts) or on load (eWAY return). */
export const CHECKOUT_TRANSIENT_QUERY_PARAMS = [
  "cancelled",
  "error",
  "AccessCode",
  "accessCode",
  "access_code",
  "Accesscode",
] as const;

export function checkoutUrlHasTransientQueryParams(
  searchParams: URLSearchParams | { has: (key: string) => boolean }
): boolean {
  return CHECKOUT_TRANSIENT_QUERY_PARAMS.some((key) => searchParams.has(key));
}

/** Strip transient checkout query params from the address bar (client-only). */
export function stripCheckoutTransientQueryParamsFromAddressBar(): void {
  if (typeof window === "undefined") return;
  try {
    const u = new URL(window.location.href);
    if (!checkoutUrlHasTransientQueryParams(u.searchParams)) return;
    for (const key of CHECKOUT_TRANSIENT_QUERY_PARAMS) {
      u.searchParams.delete(key);
    }
    const q = u.searchParams.toString();
    const next = u.pathname + (q ? `?${q}` : "");
    window.history.replaceState(window.history.state, "", next);
  } catch {
    /* ignore */
  }
}
