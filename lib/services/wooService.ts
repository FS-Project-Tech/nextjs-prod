/**
 * WooCommerce REST (orders) — checkout order lifecycle.
 * Use {@link createWooOrder} / {@link updateWooOrder} from `@/services/woocommerce` (re-exported here).
 */
import wcAPI from "@/lib/woocommerce";
import {
  addWooOrderNote,
  createWooOrder,
  createWooOrderMinimal,
  updateWooOrder,
  updateWooOrderAsync,
  type WooCreateOrderInput,
} from "@/services/woocommerce";
import { logWooOrderLineItems, logValidatedItems } from "@/lib/woo/debugLogger";
import { PARCEL_PROTECTION_FEE_AUD } from "@/lib/checkout-parcel-protection";
import { getAxiosErrorDetails, hasAxiosResponse, isTimeoutError } from "@/lib/utils/errors";

export type { WooCreateOrderInput };
export { addWooOrderNote, createWooOrder, updateWooOrder, updateWooOrderAsync };

export async function getWooOrder(orderRef: string): Promise<unknown> {
  const ref = String(orderRef || "").trim();
  if (!ref) throw new Error("orderRef required");
  const { data } = await wcAPI.get(`/orders/${encodeURIComponent(ref)}`);
  return data;
}

/** REST fallback when Store API checkout omits `order_key` (some hosts/plugins). */
export async function fetchWooOrderKeyById(
  orderId: string | number,
  timeoutMs: number = Number(process.env.WOOCOMMERCE_ORDER_READ_TIMEOUT_MS || 45000),
): Promise<string | null> {
  const id = String(orderId).trim();
  if (!id) return null;
  try {
    const { data } = await wcAPI.get(`/orders/${encodeURIComponent(id)}`, {
      timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 45000,
    });
    const k = (data as { order_key?: unknown })?.order_key;
    return typeof k === "string" && k.trim() ? k.trim() : null;
  } catch (err) {
    console.warn("[wooService] fetchWooOrderKeyById failed", { id, err });
    return null;
  }
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

export function extractWooOrderKey(order: unknown): string | null {
  if (order == null || typeof order !== "object") return null;
  const k = (order as { order_key?: unknown }).order_key;
  if (typeof k === "string" && k.trim()) return k.trim();
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
 * Single timeout source of truth: axios only (do not combine with AbortController timers — both
 * firing at the same ms produces CanceledError: "canceled" and flaky retries).
 */
function minimalCreateFirstTimeoutMs(): number {
  const n = Number(process.env.WOOCOMMERCE_CHECKOUT_MINIMAL_CREATE_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 5_000;
}

/** Second attempt with a higher budget (slow Woo). */
function minimalCreateRetryTimeoutMs(): number {
  const n = Number(process.env.WOOCOMMERCE_CHECKOUT_MINIMAL_CREATE_RETRY_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 8_000;
}

function extensionPutFirstTimeoutMs(): number {
  const n = Number(process.env.WOOCOMMERCE_CHECKOUT_EXTENSION_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 10_000;
}

function extensionPutRetryTimeoutMs(): number {
  const n = Number(process.env.WOOCOMMERCE_CHECKOUT_EXTENSION_RETRY_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 16_000;
}

function isAbortLike(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return e.name === "AbortError" || e.name === "CanceledError";
}

function orderCreateRetriable(e: unknown): boolean {
  if (isTimeoutError(e) || isAbortLike(e)) return true;
  if (!hasAxiosResponse(e)) return true;
  const s = getAxiosErrorDetails(e).status || 0;
  return s === 408 || s === 429 || (s >= 500 && s < 600);
}

/** Shipping, fees, coupons, meta — phase-2 PUT only. COD → `processing` after extras are applied. */
export function buildCheckoutExtensionPatch(input: WooCreateOrderInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (String(input.payment_method || "").toLowerCase() === "cod") {
    patch.status = "processing";
  }
  if (input.shipping_line) {
    patch.shipping_lines = [
      {
        method_id: input.shipping_line.method_id,
        method_title: input.shipping_line.method_title,
        total: input.shipping_line.total,
        total_tax: "0",
        taxes: [],
      },
    ];
  }
  if (input.fee_lines && input.fee_lines.length > 0) {
    patch.fee_lines = input.fee_lines;
  }
  if (input.meta_data && input.meta_data.length > 0) {
    patch.meta_data = input.meta_data;
  }
  if (input.coupon_code?.trim()) {
    patch.coupon_lines = [{ code: input.coupon_code.trim() }];
  }
  return patch;
}

async function applyOrderExtensionWithRetry(
  orderId: number,
  patch: Record<string, unknown>,
): Promise<unknown> {
  const timeouts = [extensionPutFirstTimeoutMs(), extensionPutRetryTimeoutMs()];
  let lastErr: unknown;
  for (let attempt = 0; attempt < timeouts.length; attempt++) {
    const ms = timeouts[attempt];
    try {
      console.log("[checkout] async update start", { orderId, attempt, timeoutMs: ms });
      const updated = await updateWooOrderAsync(orderId, patch, { timeoutMs: ms });
      console.log("[checkout] async update success", { orderId, attempt });
      return updated;
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt < timeouts.length - 1 && orderCreateRetriable(e)) {
        console.warn("[checkout] retry attempt", {
          phase: "woo_extension_put",
          orderId,
          attempt: attempt + 1,
          message: msg,
        });
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

export type OrderExtensionTiming =
  | { mode: "inline" }
  | { mode: "after_response"; schedule: (task: () => Promise<void>) => void };

function validateCreatedLineItems(order: unknown): void {
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
    })),
  );

  const invalidMap = lineItems.some((li) => Number(li?.product_id || 0) <= 0);
  if (invalidMap) {
    const err = new Error(
      "Invalid product mapping from WooCommerce. Likely product type or plugin issue.",
    );
    (err as { data?: unknown }).data = {
      type: "woo_invalid_product_mapping",
      line_items: lineItems,
    };
    throw err;
  }
}

/**
 * Phase 1: minimal POST /orders (fast). Phase 2: PUT shipping, fees, meta, coupons.
 * COD can defer phase 2 with `after()` so the HTTP response returns immediately after phase 1.
 */
export async function createValidatedCheckoutOrder(
  input: WooCreateOrderInput,
  timing: OrderExtensionTiming,
): Promise<unknown> {
  logValidatedItems(
    input.line_items.map((li) => ({
      product_id: li.product_id,
      variation_id: li.variation_id,
      quantity: li.quantity,
    })),
  );

  const t1 = minimalCreateFirstTimeoutMs();
  const t2 = minimalCreateRetryTimeoutMs();
  const minimalInput = {
    payment_method: input.payment_method,
    payment_method_title: input.payment_method_title,
    set_paid: input.set_paid,
    status: input.status,
    customer_id: input.customer_id,
    line_items: input.line_items,
    billing: input.billing,
    shipping: input.shipping,
  };

  console.log("[checkout] start", {
    phase: "woo_minimal_create",
    payment_method: input.payment_method,
    status: input.status,
    lineCount: input.line_items.length,
    firstTimeoutMs: t1,
  });

  let orderMinimal: unknown;
  try {
    orderMinimal = await createWooOrderMinimal(minimalInput, { timeoutMs: t1 });
  } catch (firstErr) {
    if (!orderCreateRetriable(firstErr)) throw firstErr;
    console.warn("[checkout] retry attempt", {
      phase: "woo_minimal_create",
      timeoutMs: t2,
      message: firstErr instanceof Error ? firstErr.message : String(firstErr),
    });
    orderMinimal = await createWooOrderMinimal(minimalInput, { timeoutMs: t2 });
  }

  console.log("[checkout] woo create success", {
    orderId: extractWooOrderId(orderMinimal),
    payment_method: input.payment_method,
  });

  validateCreatedLineItems(orderMinimal);

  const postIdRaw = extractWooOrderId(orderMinimal);
  const postIdNum =
    typeof postIdRaw === "number" ? postIdRaw : Number.parseInt(String(postIdRaw), 10);
  if (!Number.isFinite(postIdNum) || postIdNum <= 0) {
    throw new Error("WooCommerce did not return a valid order ID after create.");
  }

  const patch = buildCheckoutExtensionPatch(input);
  const keys = Object.keys(patch);
  if (keys.length === 0) {
    return orderMinimal;
  }

  const runExtension = () => applyOrderExtensionWithRetry(postIdNum, patch);

  if (timing.mode === "after_response") {
    timing.schedule(() =>
      (async () => {
        console.log("[checkout] async update start", { orderId: postIdNum, deferred: true });
        try {
          await runExtension();
          console.log("[checkout] async update success", { orderId: postIdNum, deferred: true });
        } catch (e) {
          console.error("[checkout] async update fail", {
            orderId: postIdNum,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      })().then(() => {}),
    );
    return orderMinimal;
  }

  const updated = await runExtension();
  return updated ?? orderMinimal;
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
        tax_status: "none",
      },
    ],
  });
  console.log("[woo] parcel protection fee appended", { orderId });
}
