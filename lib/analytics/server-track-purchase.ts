import { createHash, randomUUID } from "node:crypto";

export type ServerPurchaseItem = {
  id: string | number;
  name: string;
  price: number;
  quantity: number;
};

export type ServerPurchasePayload = {
  orderId: string;
  value: number;
  currency: string;
  email?: string;
  items: ServerPurchaseItem[];
};

const GA4_MP_URL = "https://www.google-analytics.com/mp/collect";

function metaEmailHash(email: string): string {
  const normalized = email.trim().toLowerCase();
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

function wooLineToItem(li: Record<string, unknown>): ServerPurchaseItem | null {
  const productIdRaw = li.product_id ?? li.id ?? li.sku;
  if (
    productIdRaw == null ||
    (typeof productIdRaw !== "string" && typeof productIdRaw !== "number")
  ) {
    return null;
  }
  const productId = productIdRaw;
  const qtyRaw = li.quantity ?? 1;
  const qty = typeof qtyRaw === "number" ? qtyRaw : Number.parseInt(String(qtyRaw), 10);
  const quantity = Number.isFinite(qty) && qty > 0 ? qty : 1;
  const priceRaw = li.price ?? li.subtotal;
  const price =
    typeof priceRaw === "number"
      ? priceRaw
      : Number.parseFloat(String(priceRaw ?? "0")) || 0;
  const name = typeof li.name === "string" && li.name.trim() ? li.name : "Item";
  return { id: productId, name, price, quantity };
}

/**
 * Build a purchase payload from a WooCommerce order object (create or GET response).
 */
export function buildPurchasePayloadFromWooOrder(
  order: unknown,
  email?: string,
): ServerPurchasePayload | null {
  if (!order || typeof order !== "object" || Array.isArray(order)) return null;
  const o = order as Record<string, unknown>;
  const id = o.id ?? o.number;
  if (id == null) return null;
  const totalRaw = o.total;
  const value =
    typeof totalRaw === "number"
      ? totalRaw
      : Number.parseFloat(String(totalRaw ?? "0")) || 0;
  const cur = String(o.currency ?? "AUD").trim().toUpperCase() || "AUD";
  const lines = Array.isArray(o.line_items) ? o.line_items : [];
  const items: ServerPurchaseItem[] = [];
  for (const line of lines) {
    if (!line || typeof line !== "object" || Array.isArray(line)) continue;
    const item = wooLineToItem(line as Record<string, unknown>);
    if (item) items.push(item);
  }
  if (items.length === 0 && value > 0) {
    items.push({
      id: String(id),
      name: "Order",
      price: value,
      quantity: 1,
    });
  }
  const trimmedEmail =
    typeof email === "string" && email.trim() ? email.trim() : undefined;
  return {
    orderId: String(id),
    value,
    currency: cur,
    email: trimmedEmail,
    items,
  };
}

async function sendGa4Purchase(payload: ServerPurchasePayload): Promise<void> {
  const measurementId = process.env.GA4_MEASUREMENT_ID?.trim();
  const apiSecret = process.env.GA4_API_SECRET?.trim();
  if (!measurementId || !apiSecret) {
    console.warn("[analytics] GA4 skipped: GA4_MEASUREMENT_ID or GA4_API_SECRET missing");
    return;
  }

  const url = new URL(GA4_MP_URL);
  url.searchParams.set("measurement_id", measurementId);
  url.searchParams.set("api_secret", apiSecret);

  const body = {
    client_id: randomUUID(),
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: payload.orderId,
          value: payload.value,
          currency: payload.currency,
          items: payload.items.map((it) => ({
            item_id: String(it.id),
            item_name: it.name,
            price: it.price,
            quantity: it.quantity,
          })),
        },
      },
    ],
  };

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GA4 MP ${res.status}: ${text.slice(0, 500)}`);
  }
}

async function sendMetaPurchase(payload: ServerPurchasePayload): Promise<void> {
  const pixelId = process.env.META_PIXEL_ID?.trim();
  const accessToken = process.env.META_ACCESS_TOKEN?.trim();
  if (!pixelId || !accessToken) {
    console.warn("[analytics] Meta CAPI skipped: META_PIXEL_ID or META_ACCESS_TOKEN missing");
    return;
  }

  const eventUrl = new URL(`https://graph.facebook.com/v18.0/${pixelId}/events`);
  eventUrl.searchParams.set("access_token", accessToken);

  const eventTime = Math.floor(Date.now() / 1000);
  const contentIds = payload.items.map((it) => String(it.id));
  const contents = payload.items.map((it) => ({
    id: String(it.id),
    quantity: it.quantity,
    item_price: it.price,
  }));

  const userData: Record<string, string[]> = {};
  if (payload.email) {
    userData.em = [metaEmailHash(payload.email)];
  }

  const dataPayload: Record<string, unknown> = {
    event_name: "Purchase",
    event_time: eventTime,
    action_source: "website",
    custom_data: {
      currency: payload.currency,
      value: String(payload.value),
      content_ids: contentIds,
      content_type: "product",
      contents,
    },
  };
  if (Object.keys(userData).length > 0) {
    dataPayload.user_data = userData;
  }

  const res = await fetch(eventUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: [dataPayload] }),
  });

  const json = (await res.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;

  if (!res.ok) {
    const msg = json?.error?.message ?? (await res.text().catch(() => ""));
    throw new Error(`Meta CAPI ${res.status}: ${String(msg).slice(0, 500)}`);
  }
}

/**
 * Sends purchase to GA4 (Measurement Protocol) and Meta (Conversion API) in parallel.
 * Never throws; logs failures. Missing env vars skip the corresponding sender.
 */
export async function trackPurchaseServerSide(payload: ServerPurchasePayload): Promise<void> {
  await Promise.all([
    sendGa4Purchase(payload).catch((err) => {
      console.error("[analytics] GA4 purchase failed", err);
    }),
    sendMetaPurchase(payload).catch((err) => {
      console.error("[analytics] Meta purchase failed", err);
    }),
  ]);
}
