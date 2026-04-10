import { getWpBaseUrl } from "@/lib/wp-utils";

/**
 * Links guest orders to the logged-in Woo customer (custom WP REST route).
 * Intended to run once per credentials sign-in (see `jwt` callback when `user` is set),
 * not on every dashboard API request.
 */
export async function linkGuestOrdersAfterLogin(wpToken: string | undefined | null): Promise<void> {
  const token = typeof wpToken === "string" ? wpToken.trim() : "";
  if (!token) return;

  const wpBase = getWpBaseUrl().replace(/\/+$/, "");
  if (!wpBase) return;

  try {
    const res = await fetch(`${wpBase}/wp-json/custom/v1/link-guest-orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("[linkGuestOrders] link-guest-orders failed", { status: res.status });
    }
  } catch (e) {
    console.warn("[linkGuestOrders] link-guest-orders request error", e);
  }
}
