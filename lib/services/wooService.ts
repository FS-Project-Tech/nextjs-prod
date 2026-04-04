/**
 * WooCommerce REST (orders) — checkout order lifecycle.
 * Use {@link createWooOrder} / {@link updateWooOrder} from `@/services/woocommerce` (re-exported here).
 */
import wcAPI from "@/lib/woocommerce";
import { createWooOrder, updateWooOrder, type WooCreateOrderInput } from "@/services/woocommerce";
import { logWooOrderLineItems, logValidatedItems } from "@/lib/woo/debugLogger";
import { PARCEL_PROTECTION_FEE_AUD } from "@/lib/checkout-parcel-protection";

export type { WooCreateOrderInput };
export { createWooOrder, updateWooOrder };

export async function getWooOrder(orderRef: string): Promise<unknown> {
  const ref = String(orderRef || "").trim();
  if (!ref) throw new Error("orderRef required");
  const { data } = await wcAPI.get(`/orders/${encodeURIComponent(ref)}`);
  return data;
}

export async function resolveOrderPostId(orderRef: string): Promise<number | null> {
  const ref = String(orderRef || "").trim();
  if (!ref) return null;

  try {
    const { data } = await wcAPI.get(`/orders/${encodeURIComponent(ref)}`);
    const id = Number((data as { id?: unknown })?.id);
    if (Number.isFinite(id) && id > 0) return id;
  } catch (err: unknown) {
    const status = Number((err as { response?: { status?: number } })?.response?.status || 0);
    if (status !== 404) throw err;
  }

  const { data: orders } = await wcAPI.get("/orders", {
    params: { search: ref, per_page: 20 },
  });
  const match = Array.isArray(orders)
    ? orders.find(
        (o: { id?: number; number?: string; order_number?: string }) =>
          String(o.number ?? o.order_number ?? o.id) === ref
      )
    : null;
  const id = Number(match?.id || 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function pickIdCandidates(o: Record<string, unknown>): unknown[] {
  return [
    o.id,
    o.ID,
    o.order_id,
    o.number,
    o.order_number,
    (o as { woocommerce_order_id?: unknown }).woocommerce_order_id,
  ];
}

function firstResolvedId(candidates: unknown[]): number | string | null {
  for (const raw of candidates) {
    if (raw == null) continue;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
    if (typeof raw === "string") {
      const t = raw.trim();
      if (!t) continue;
      const n = Number.parseInt(t, 10);
      if (Number.isFinite(n) && n > 0) return n;
      return t;
    }
  }
  return null;
}

export function extractWooOrderId(order: unknown): number | string | null {
  if (order == null || typeof order !== "object") return null;
  const root = order as Record<string, unknown>;
  const nested =
    root.data != null && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : null;
  const nestedHasId =
    nested != null &&
    (nested.id != null ||
      nested.order_id != null ||
      nested.number != null ||
      nested.order_number != null);
  const o = nestedHasId ? (nested as Record<string, unknown>) : root;

  const fromPrimary = firstResolvedId(pickIdCandidates(o));
  if (fromPrimary != null) return fromPrimary;

  const orderObj =
    o.order != null && typeof o.order === "object" && !Array.isArray(o.order)
      ? (o.order as Record<string, unknown>)
      : root.order != null && typeof root.order === "object" && !Array.isArray(root.order)
        ? (root.order as Record<string, unknown>)
        : null;
  if (orderObj) {
    const fromNestedOrder = firstResolvedId(pickIdCandidates(orderObj));
    if (fromNestedOrder != null) return fromNestedOrder;
  }

  return null;
}

/**
 * POST /orders with validation that line_items map to real product IDs (catches bad plugins).
 */
export async function createValidatedCheckoutOrder(input: WooCreateOrderInput): Promise<unknown> {
  logValidatedItems(
    input.line_items.map((li) => ({
      product_id: li.product_id,
      variation_id: li.variation_id,
      quantity: li.quantity,
    }))
  );

  console.log("[woo] create order", {
    payment_method: input.payment_method,
    status: input.status,
    lineCount: input.line_items.length,
    has_customer: Boolean(input.customer_id && input.customer_id > 0),
  });

  const order = await createWooOrder(input);
  const lineItems = Array.isArray((order as { line_items?: unknown })?.line_items)
    ? ((order as { line_items: Array<Record<string, unknown>> }).line_items as Array<
        Record<string, unknown>
      >)
    : [];

  logWooOrderLineItems(
    lineItems.map((li) => ({
      product_id: Number(li?.product_id || 0),
      variation_id: li?.variation_id != null ? Number(li.variation_id || 0) : null,
      name: typeof li?.name === "string" ? li.name : "",
      quantity: Number(li?.quantity || 0),
      subtotal: String(li?.subtotal ?? ""),
    }))
  );

  const invalidMap = lineItems.some((li) => Number(li?.product_id || 0) <= 0);
  if (invalidMap) {
    const err = new Error(
      "Invalid product mapping from WooCommerce. Likely product type or plugin issue."
    );
    (err as { data?: unknown }).data = {
      type: "woo_invalid_product_mapping",
      line_items: lineItems,
    };
    throw err;
  }

  return order;
}

/** Append parcel protection fee line (after order exists). */
export async function appendParcelProtectionFee(orderId: number): Promise<void> {
  const { data } = await wcAPI.get(`/orders/${orderId}`);
  const existing = Array.isArray((data as { fee_lines?: unknown }).fee_lines)
    ? (data as { fee_lines: Array<Record<string, unknown>> }).fee_lines.map((f) => ({
        id: f.id,
        name: f.name,
        total: f.total,
        tax_status: f.tax_status,
      }))
    : [];
  await updateWooOrder(orderId, {
    fee_lines: [
      ...existing,
      {
        name: "Parcel Protection",
        total: PARCEL_PROTECTION_FEE_AUD.toFixed(2),
        tax_status: "taxable",
      },
    ],
  });
  console.log("[woo] parcel protection fee appended", { orderId });
}
