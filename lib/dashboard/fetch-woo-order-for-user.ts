import wcAPI from "@/lib/woocommerce";
import { getWpBaseUrl } from "@/lib/wp-utils";
import { orderBelongsToDashboardUser } from "@/lib/dashboard/orderOwnership";

/**
 * Load a WooCommerce order by display order number (dashboard-safe), scoped to dashboard user.
 */
export async function fetchWooOrderDetailForUser(
  orderRef: string,
  customerId: number,
  userEmail: string | null,
): Promise<Record<string, unknown> | null> {
  const ref = decodeURIComponent(orderRef).trim();
  if (!ref) return null;

  const tryFull = async (id: number): Promise<Record<string, unknown> | null> => {
    try {
      const { data } = await wcAPI.get(`/orders/${id}`);
      if (
        data &&
        orderBelongsToDashboardUser({
          order: data,
          userEmail,
          wooCustomerId: customerId,
        })
      ) {
        return data as Record<string, unknown>;
      }
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status !== 404) throw e;
    }
    return null;
  };

  let list: Record<string, unknown>[] = [];
  try {
    const { data } = await wcAPI.get("/orders", {
      params: { customer: customerId, search: ref, per_page: 100 },
    });
    list = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  } catch {
    return null;
  }

  const match = list.find((o) => {
    const num = String(o.number ?? o.order_number ?? "");
    return num === ref;
  });
  if (match?.id != null) {
    const idNum = typeof match.id === "number" ? match.id : parseInt(String(match.id), 10);
    if (Number.isFinite(idNum)) {
      const full = await tryFull(idNum);
      if (full) return full;
    }
  }

  const wpBase = getWpBaseUrl();
  if (wpBase) {
    try {
      const lookupRes = await fetch(
        `${wpBase}/wp-json/custom/v1/order-by-number/${encodeURIComponent(ref)}`,
        { cache: "no-store" },
      );
      if (lookupRes.ok) {
        const body = (await lookupRes.json()) as { post_id?: number };
        if (body.post_id) {
          const full = await tryFull(body.post_id);
          if (full) return full;
        }
      }
    } catch {
      /* noop */
    }
  }

  return null;
}
