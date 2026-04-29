import wcAPI from "@/lib/woocommerce";
import { HEADLESS_CHECKOUT_SESSION_META_KEY } from "@/lib/checkout/checkoutSessionConstants";
import { readWooMetaValue } from "@/lib/woo/orderMeta";
import type { CheckoutActor } from "@/types/checkout";

const LIST_FIELDS = "id,status,order_key,meta_data,date_created";
const MAX_ORDER_AGE_MS = 48 * 60 * 60 * 1000;

export type LastCheckoutStatusResult = {
  hasRecentOrder: boolean;
  woo_order_id?: number;
  status?: string;
  order_key?: string;
};

function parseOrderDateMs(raw: unknown): number | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

/**
 * Find the most recent Woo order for this logged-in customer whose headless checkout session meta
 * matches the browser session id. Used only for GET /api/checkout/last-status recovery (guests: no match).
 */
export async function resolveLastCheckoutOrderForRecovery(input: {
  actor: CheckoutActor;
  checkoutSessionId: string;
}): Promise<LastCheckoutStatusResult> {
  const sessionId = String(input.checkoutSessionId || "").trim();
  const customerId = input.actor.userId;
  if (!sessionId || !customerId || customerId <= 0) {
    return { hasRecentOrder: false };
  }

  const afterIso = new Date(Date.now() - MAX_ORDER_AGE_MS).toISOString();

  try {
    const { data: list } = await wcAPI.get("/orders", {
      params: {
        customer: customerId,
        per_page: 40,
        orderby: "date",
        order: "desc",
        after: afterIso,
        _fields: LIST_FIELDS,
      },
    });
    const orders = Array.isArray(list) ? list : [];

    const cutoff = Date.now() - MAX_ORDER_AGE_MS;

    for (const row of orders as Array<{
      id?: number;
      status?: string;
      order_key?: string;
      meta_data?: Array<{ key?: string; value?: unknown }>;
      date_created?: string;
    }>) {
      const sid = readWooMetaValue(row.meta_data, HEADLESS_CHECKOUT_SESSION_META_KEY);
      if (sid !== sessionId) continue;

      const created = parseOrderDateMs(row.date_created);
      if (created != null && created < cutoff) continue;

      const id = typeof row.id === "number" && row.id > 0 ? row.id : null;
      if (id == null) continue;

      const order_key =
        typeof row.order_key === "string" && row.order_key.trim() !== ""
          ? row.order_key.trim()
          : undefined;
      const status = typeof row.status === "string" ? row.status.trim() : "";

      return {
        hasRecentOrder: true,
        woo_order_id: id,
        status: status || undefined,
        order_key,
      };
    }
  } catch (e) {
    console.warn("[checkout] resolveLastCheckoutOrderForRecovery failed", {
      message: e instanceof Error ? e.message : String(e),
    });
  }

  return { hasRecentOrder: false };
}
