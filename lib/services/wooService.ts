/**
 * WooCommerce REST (orders) — checkout order lifecycle.
 * Use {@link createWooOrder} / {@link updateWooOrder} from `@/services/woocommerce` (re-exported here).
 */
import wcAPI from "@/lib/woocommerce";
import {
  addWooOrderNote,
  buildWooOrderWriteConfig,
  createWooOrder,
  createWooOrderMinimal,
  updateWooOrder,
  updateWooOrderAsync,
  type WooCreateOrderInput,
} from "@/services/woocommerce";
import { logWooOrderLineItems, logValidatedItems } from "@/lib/woo/debugLogger";
import { PARCEL_PROTECTION_FEE_AUD } from "@/lib/checkout-parcel-protection";
import { getAxiosErrorDetails, hasAxiosResponse, isTimeoutError } from "@/lib/utils/errors";
import {
  CHECKOUT_SESSION_ID_ORDER_META_KEY,
  HEADLESS_CHECKOUT_SESSION_META_KEY,
} from "@/lib/checkout/checkoutSessionConstants";
import { findPendingOrderIdByHeadlessSession } from "@/lib/checkout/resolveExistingPendingCheckoutOrder";
 
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

function extractCheckoutSessionIdFromSessionMeta(
  sessionMeta: Array<{ key: string; value: unknown }>,
): string {
  for (const row of sessionMeta) {
    const k = String(row?.key || "");
    if (k !== HEADLESS_CHECKOUT_SESSION_META_KEY && k !== CHECKOUT_SESSION_ID_ORDER_META_KEY) {
      continue;
    }
    const v = row?.value;
    const s = typeof v === "string" ? v.trim() : String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

/**
 * When POST /orders times out, Woo may still have created the order — find it by session meta + email
 * instead of posting a duplicate.
 */
async function tryRecoverPendingOrderAfterCreateFailure(
  sessionMeta: Array<{ key: string; value: unknown }>,
  minimalInput: {
    billing?: { email?: string };
    payment_method?: string;
  },
): Promise<unknown | null> {
  const sid = extractCheckoutSessionIdFromSessionMeta(sessionMeta);
  const email = String(minimalInput.billing?.email || "").trim();
  if (!sid || !email) return null;
  const id = await findPendingOrderIdByHeadlessSession({
    checkoutSessionId: sid,
    billingEmail: email,
    paymentMethod: String(minimalInput.payment_method || ""),
  });
  if (id == null) return null;
  return getWooOrder(String(id));
}
 
/** Shipping, fees, coupons, meta — phase-2 PUT only. COD → `processing` after extras are applied. */
export function buildCheckoutExtensionPatch(
  input: WooCreateOrderInput,
  options?: { omitMeta?: boolean; existingShippingLineId?: number },
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (String(input.payment_method || "").toLowerCase() === "cod") {
    patch.status = "processing";
  }
  if (input.shipping_line) {
    const sl: Record<string, unknown> = {
      method_id: input.shipping_line.method_id,
      method_title: input.shipping_line.method_title,
      total: input.shipping_line.total,
      total_tax: "0",
      taxes: [],
    };
    if (
      typeof options?.existingShippingLineId === "number" &&
      Number.isFinite(options.existingShippingLineId) &&
      options.existingShippingLineId > 0
    ) {
      sl.id = options.existingShippingLineId;
    }
    const inst = input.shipping_line.instance_id?.trim();
    if (inst) {
      sl.instance_id = inst;
    }
    patch.shipping_lines = [sl];
  }
  if (input.fee_lines && input.fee_lines.length > 0) {
    patch.fee_lines = input.fee_lines;
  }
  if (!options?.omitMeta && input.meta_data && input.meta_data.length > 0) {
    patch.meta_data = input.meta_data;
  }
  if (input.coupon_code?.trim()) {
    patch.coupon_lines = [{ code: input.coupon_code.trim() }];
  }
  return patch;
}

/** One POST /orders with extension fields (shipping, fees, coupons, meta) — skips phase-2 PUT when Woo accepts it. */
function buildSingleShotOrderPayload(
  input: WooCreateOrderInput,
  sessionMeta: Array<{ key: string; value: unknown }>,
): Record<string, unknown> {
  const patch = buildCheckoutExtensionPatch(input);
  const status =
    typeof patch.status === "string" && patch.status.trim()
      ? patch.status
      : input.status;
  const body: Record<string, unknown> = {
    payment_method: input.payment_method,
    payment_method_title: input.payment_method_title,
    set_paid: input.set_paid,
    status,
    ...(input.customer_id && input.customer_id > 0 ? { customer_id: input.customer_id } : {}),
    line_items: input.line_items,
    billing: input.billing,
    shipping: input.shipping,
    meta_data: [...sessionMeta, ...(input.meta_data ?? [])],
  };
  if (Array.isArray(patch.shipping_lines) && patch.shipping_lines.length > 0) {
    body.shipping_lines = patch.shipping_lines;
  }
  if (Array.isArray(patch.fee_lines) && patch.fee_lines.length > 0) {
    body.fee_lines = patch.fee_lines;
  }
  if (Array.isArray(patch.coupon_lines) && patch.coupon_lines.length > 0) {
    body.coupon_lines = patch.coupon_lines;
  }
  return body;
}

async function trySingleShotOrderCreate(
  input: WooCreateOrderInput,
  sessionMeta: Array<{ key: string; value: unknown }>,
  timeoutMs: number,
  requestId?: string,
): Promise<unknown | null> {
  const patch = buildCheckoutExtensionPatch(input);
  if (Object.keys(patch).length === 0) {
    return null;
  }
  try {
    const body = buildSingleShotOrderPayload(input, sessionMeta);
    const res = await wcAPI.post("/orders", body, buildWooOrderWriteConfig({ timeoutMs }));
    return res.data;
  } catch (e) {
    console.warn("[checkout] single-shot order create failed, falling back to minimal+patch", {
      requestId,
      message: e instanceof Error ? e.message : String(e),
      status: getAxiosErrorDetails(e).status,
    });
    return null;
  }
}
 
export async function applyOrderExtensionWithRetry(
  orderId: number,
  patch: Record<string, unknown>,
): Promise<unknown> {
  const timeouts = [extensionPutFirstTimeoutMs(), extensionPutRetryTimeoutMs()];
  let lastErr: unknown;
  for (let attempt = 0; attempt < timeouts.length; attempt++) {
    const ms = timeouts[attempt];
    try {
      const shippingPatch = Array.isArray((patch as { shipping_lines?: unknown }).shipping_lines)
        ? ((patch as { shipping_lines?: Array<Record<string, unknown>> }).shipping_lines ?? [])
        : [];
      // If a previous attempt may have already created shipping lines, retry by updating
      // the existing line id instead of appending another shipping line.
      if (
        attempt > 0 &&
        shippingPatch.length === 1 &&
        shippingPatch[0] &&
        (shippingPatch[0].id == null || Number(shippingPatch[0].id) <= 0)
      ) {
        try {
          const current = (await getWooOrder(String(orderId))) as {
            shipping_lines?: Array<{ id?: number }>;
          };
          const existingShippingId = Number(current.shipping_lines?.[0]?.id || 0);
          if (Number.isFinite(existingShippingId) && existingShippingId > 0) {
            shippingPatch[0] = { ...shippingPatch[0], id: existingShippingId };
          }
        } catch (readErr) {
          console.warn("[checkout] retry pre-read failed", {
            phase: "woo_extension_put",
            orderId,
            attempt,
            message: readErr instanceof Error ? readErr.message : String(readErr),
          });
        }
      }
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
 
export function validateCreatedLineItems(order: unknown): void {
  const lineItems = Array.isArray((order as { line_items?: unknown })?.line_items)
    ? ((order as { line_items: Array<Record<string, unknown>> }).line_items as Array<
        Record<string, unknown>
      >)
    : [];
 
  if (lineItems.length === 0) {
    const err = new Error("Cart is empty");
    (err as { code?: string }).code = "EMPTY_LINE_ITEMS";
    throw err;
  }
 
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
  options?: {
    checkoutSessionMeta?: Array<{ key: string; value: unknown }>;
    perf?: { wooCreateMs?: number; wooPatchMs?: number; requestId?: string };
  },
): Promise<unknown> {
  if (!input.line_items?.length) {
    const err = new Error("Cart is empty");
    (err as { code?: string }).code = "EMPTY_LINE_ITEMS";
    throw err;
  }

  const rid = options?.perf?.requestId;

  logValidatedItems(
    input.line_items.map((li) => ({
      product_id: li.product_id,
      variation_id: li.variation_id,
      quantity: li.quantity,
    })),
  );

  const sessionMeta = options?.checkoutSessionMeta ?? [];
  const t1 = minimalCreateFirstTimeoutMs();
  const t2 = minimalCreateRetryTimeoutMs();

  const patchProbe = buildCheckoutExtensionPatch(input);
  let skipMinimalCreate = false;
  let orderMinimal: unknown;
  let singleShotOrRecoverMs = 0;

  if (Object.keys(patchProbe).length > 0) {
    const tShot = Date.now();
    const shot = await trySingleShotOrderCreate(input, sessionMeta, t1, rid);
    if (shot != null) {
      if (options?.perf) {
        options.perf.wooCreateMs = Date.now() - tShot;
        options.perf.wooPatchMs = 0;
      }
      console.log("[checkout] woo single-shot create success", {
        requestId: rid,
        orderId: extractWooOrderId(shot),
        payment_method: input.payment_method,
      });
      validateCreatedLineItems(shot);
      return shot;
    }
    const recoveredAfterSingleShot = await tryRecoverPendingOrderAfterCreateFailure(sessionMeta, {
      billing: input.billing,
      payment_method: input.payment_method,
    });
    if (recoveredAfterSingleShot != null) {
      orderMinimal = recoveredAfterSingleShot;
      skipMinimalCreate = true;
      singleShotOrRecoverMs = Date.now() - tShot;
      console.warn(
        "[checkout] recovered order after single-shot failure (avoiding duplicate minimal POST)",
        {
          requestId: rid,
          orderId: extractWooOrderId(orderMinimal),
          payment_method: input.payment_method,
        },
      );
    }
  }

  const minimalInput = {
    payment_method: input.payment_method,
    payment_method_title: input.payment_method_title,
    set_paid: input.set_paid,
    status: input.status,
    customer_id: input.customer_id,
    line_items: input.line_items,
    billing: input.billing,
    shipping: input.shipping,
    ...(sessionMeta.length ? { meta_data: sessionMeta } : {}),
  };

  console.log("[checkout] start", {
    requestId: rid,
    phase: "woo_minimal_create",
    payment_method: input.payment_method,
    status: input.status,
    lineCount: input.line_items.length,
    firstTimeoutMs: t1,
  });

  const tMinStart = Date.now();

  if (!skipMinimalCreate) {
    try {
      orderMinimal = await createWooOrderMinimal(minimalInput, { timeoutMs: t1 });
    } catch (firstErr) {
      if (!orderCreateRetriable(firstErr)) throw firstErr;
      const recoveredAfterFail = await tryRecoverPendingOrderAfterCreateFailure(
        sessionMeta,
        minimalInput,
      );
      if (recoveredAfterFail != null) {
        orderMinimal = recoveredAfterFail;
        console.warn("[checkout] recovered order after create error (likely timeout; skipping retry POST)", {
          requestId: rid,
          orderId: extractWooOrderId(orderMinimal),
          message: firstErr instanceof Error ? firstErr.message : String(firstErr),
        });
      } else {
        console.warn("[checkout] retry attempt", {
          requestId: rid,
          phase: "woo_minimal_create",
          timeoutMs: t2,
          message: firstErr instanceof Error ? firstErr.message : String(firstErr),
        });
        try {
          orderMinimal = await createWooOrderMinimal(minimalInput, { timeoutMs: t2 });
        } catch (secondErr) {
          if (!orderCreateRetriable(secondErr)) throw secondErr;
          const recoveredSecond = await tryRecoverPendingOrderAfterCreateFailure(
            sessionMeta,
            minimalInput,
          );
          if (recoveredSecond != null) {
            orderMinimal = recoveredSecond;
            console.warn("[checkout] recovered order after second create error (skipping throw)", {
              requestId: rid,
              orderId: extractWooOrderId(orderMinimal),
              message: secondErr instanceof Error ? secondErr.message : String(secondErr),
            });
          } else {
            throw secondErr;
          }
        }
      }
    }
  }

  if (options?.perf) {
    options.perf.wooCreateMs = skipMinimalCreate
      ? singleShotOrRecoverMs
      : Date.now() - tMinStart;
  }

  console.log("[checkout] woo create success", {
    requestId: rid,
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

  /**
   * If Woo already has a shipping line (plugin default, recovered single-shot order, etc.),
   * PATCH must send that line's `id` or Woo appends a duplicate shipping row.
   */
  let existingShippingLineIdFromOrder: number | undefined;
  if (input.shipping_line) {
    try {
      const current = (await getWooOrder(String(postIdNum))) as {
        shipping_lines?: Array<{ id?: unknown; method_id?: unknown }>;
      };
      const lines = current.shipping_lines;
      if (Array.isArray(lines) && lines.length > 0) {
        const want = String(input.shipping_line.method_id || "");
        const byMethod = want
          ? lines.find((l) => String(l.method_id || "") === want)
          : undefined;
        const idRaw = (byMethod ?? lines[0])?.id;
        const n = Number(idRaw);
        if (Number.isFinite(n) && n > 0) {
          existingShippingLineIdFromOrder = n;
        }
      }
    } catch (e) {
      console.warn("[checkout] pre-extension shipping_lines read failed", {
        orderId: postIdNum,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const patch = buildCheckoutExtensionPatch(input, {
    existingShippingLineId: existingShippingLineIdFromOrder,
  });
  const keys = Object.keys(patch);
  if (keys.length === 0) {
    return orderMinimal;
  }

  const runExtension = () => applyOrderExtensionWithRetry(postIdNum, patch);

  if (timing.mode === "after_response") {
    if (options?.perf) {
      options.perf.wooPatchMs = 0;
    }
    timing.schedule(() =>
      (async () => {
        console.log("[checkout] async update start", {
          requestId: rid,
          orderId: postIdNum,
          deferred: true,
        });
        try {
          await runExtension();
          console.log("[checkout] async update success", {
            requestId: rid,
            orderId: postIdNum,
            deferred: true,
          });
        } catch (e) {
          console.error("[checkout] async update fail", {
            requestId: rid,
            orderId: postIdNum,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      })().then(() => {}),
    );
    return orderMinimal;
  }

  const tPatch = Date.now();
  const updated = await runExtension();
  if (options?.perf) {
    options.perf.wooPatchMs = Date.now() - tPatch;
  }
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