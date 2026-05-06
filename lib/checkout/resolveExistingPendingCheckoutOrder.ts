import wcAPI from "@/lib/woocommerce";
import {
  CHECKOUT_SESSION_ID_ORDER_META_KEY,
  HEADLESS_CHECKOUT_SESSION_META_KEY,
} from "@/lib/checkout/checkoutSessionConstants";
import { readWooMetaValue } from "@/lib/woo/orderMeta";
import { keysMatchWooOrder } from "@/lib/order/orderKeyVerify";
import type { CheckoutResumePayload } from "@/types/checkout";

const PENDING_LIST_FIELDS =
  "id,meta_data,payment_method,status,order_key,billing,customer_id,date_created,total";

/** Recent `processing` orders with the same headless session are treated as duplicate checkout (COD moves fast). */
function dedupWindowMs(): number {
  const n = Number(process.env.CHECKOUT_SESSION_DEDUP_WINDOW_MINUTES);
  const mins = Number.isFinite(n) && n > 0 ? n : 60;
  return mins * 60 * 1000;
}

export type HeadlessSessionDedupResult =
  | { state: "none" }
  | { state: "pending"; orderId: number }
  | {
      state: "processing";
      orderId: number;
      orderKey: string;
      total: string | null;
    };

function orderMatchesHeadlessSession(
  meta: unknown,
  checkoutSessionId: string,
): boolean {
  const sid = String(checkoutSessionId || "").trim();
  if (!sid) return false;
  const a = readWooMetaValue(
    meta as Array<{ key?: string; value?: unknown }>,
    HEADLESS_CHECKOUT_SESSION_META_KEY,
  );
  const b = readWooMetaValue(
    meta as Array<{ key?: string; value?: unknown }>,
    CHECKOUT_SESSION_ID_ORDER_META_KEY,
  );
  return a === sid || b === sid;
}

function rowMatchesSessionAndPm(
  row: {
    id?: number;
    meta_data?: unknown;
    payment_method?: string;
  },
  sid: string,
  pm: string,
): boolean {
  if (typeof row.id !== "number" || row.id <= 0) return false;
  const rowPm = String(row.payment_method || "").toLowerCase();
  if (pm && rowPm && rowPm !== pm) return false;
  return orderMatchesHeadlessSession(row.meta_data, sid);
}

/**
 * Detect an existing order for this headless session: pending (reuse) or recent processing (duplicate submit).
 */
export async function findHeadlessSessionOrderDedup(opts: {
  checkoutSessionId: string;
  billingEmail: string;
  paymentMethod: string;
}): Promise<HeadlessSessionDedupResult> {
  const sid = String(opts.checkoutSessionId || "").trim();
  const emailRaw = String(opts.billingEmail || "").trim();
  if (!sid || !emailRaw) return { state: "none" };
  const pm = String(opts.paymentMethod || "").toLowerCase();

  try {
    const afterIso = new Date(Date.now() - dedupWindowMs()).toISOString();
    const pendingParams = {
      search: emailRaw,
      status: "pending" as const,
      per_page: 50,
      orderby: "date" as const,
      order: "desc" as const,
      _fields: PENDING_LIST_FIELDS,
    };
    const processingParams = {
      search: emailRaw,
      status: "processing" as const,
      after: afterIso,
      per_page: 50,
      orderby: "date" as const,
      order: "desc" as const,
      _fields: PENDING_LIST_FIELDS,
    };
    const [{ data: pendingList }, { data: procList }] = await Promise.all([
      wcAPI.get("/orders", { params: pendingParams }),
      wcAPI.get("/orders", { params: processingParams }),
    ]);
    const pending = Array.isArray(pendingList) ? pendingList : [];
    for (const row of pending) {
      if (!rowMatchesSessionAndPm(row, sid, pm)) continue;
      return { state: "pending", orderId: row.id as number };
    }

    const processing = Array.isArray(procList) ? procList : [];
    for (const row of processing) {
      if (!rowMatchesSessionAndPm(row, sid, pm)) continue;
      const ok = typeof row.order_key === "string" && row.order_key.trim();
      if (!ok) continue;
      const t = row.total;
      const totalStr =
        t == null ? null : typeof t === "string" ? t : String(t);
      return {
        state: "processing",
        orderId: row.id as number,
        orderKey: String(row.order_key).trim(),
        total: totalStr,
      };
    }
  } catch (e) {
    console.warn("[checkout] findHeadlessSessionOrderDedup failed", {
      message: e instanceof Error ? e.message : String(e),
    });
  }
  return { state: "none" };
}

/**
 * Find a pending or recent processing Woo order whose headless session meta matches (recovery after timeout).
 */
export async function findPendingOrderIdByHeadlessSession(opts: {
  checkoutSessionId: string;
  billingEmail: string;
  paymentMethod: string;
}): Promise<number | null> {
  const r = await findHeadlessSessionOrderDedup(opts);
  if (r.state === "pending") return r.orderId;
  if (r.state === "processing") return r.orderId;
  return null;
}

/**
 * When enabled (default), logged-in users without a browser session id match may reuse their
 * **newest headless** pending order (same payment method, has `_headless_checkout_session_id` meta).
 * Prevents a second Woo order when the customer abandoned eWAY / refreshed and got a new checkout
 * session UUID. Line items are fully replaced on upsert.
 *
 * Set `CHECKOUT_REUSE_LATEST_PENDING_ORDER=false` to disable this fallback (legacy behavior).
 */
function reuseLatestPendingEnabled(): boolean {
  return process.env.CHECKOUT_REUSE_LATEST_PENDING_ORDER !== "false";
}

/** Pending orders from headless checkout always carry this meta; avoids merging into unrelated pendings. */
function orderHasHeadlessSessionMeta(meta: unknown): boolean {
  const v = readWooMetaValue(
    meta as Array<{ key?: string; value?: unknown }>,
    HEADLESS_CHECKOUT_SESSION_META_KEY,
  );
  return Boolean(v && String(v).trim());
}

/**
 * Find an existing pending Woo order to update instead of creating a duplicate.
 * Priority: explicit resume (guest) → session meta match → latest **headless** pending with same payment method (logged-in).
 */
export async function resolveExistingPendingCheckoutOrderId(opts: {
  customerId: number | undefined;
  checkoutSessionId: string;
  paymentMethod: string;
  billingEmail: string;
  resume?: CheckoutResumePayload | null;
}): Promise<number | null> {
  const emailNorm = String(opts.billingEmail || "")
    .trim()
    .toLowerCase();

  if (opts.resume?.order_id && opts.resume.order_key) {
    try {
      const { data: order } = await wcAPI.get(
        `/orders/${encodeURIComponent(String(opts.resume.order_id))}`,
        { params: { _fields: "id,status,order_key,billing,customer_id" } },
      );
      const o = order as {
        id?: number;
        status?: string;
        order_key?: string;
        billing?: { email?: string };
        customer_id?: number;
      };
      const keyOk =
        typeof o.order_key === "string" &&
        keysMatchWooOrder(o.order_key, opts.resume.order_key.trim());
      const pending = String(o.status || "").toLowerCase() === "pending";
      const billEmail = String(o.billing?.email || "")
        .trim()
        .toLowerCase();
      const emailOk = emailNorm && billEmail === emailNorm;
      const customerOk =
        !opts.customerId ||
        opts.customerId <= 0 ||
        Number(o.customer_id || 0) === opts.customerId;
      if (keyOk && pending && emailOk && customerOk && typeof o.id === "number" && o.id > 0) {
        return o.id;
      }
    } catch {
      return null;
    }
    return null;
  }

  const wcCustomerId =
    typeof opts.customerId === "number" && Number.isFinite(opts.customerId) && opts.customerId > 0
      ? opts.customerId
      : null;

  /** Guest session + email dedup runs in {@link upsertValidatedCheckoutOrder} via {@link findHeadlessSessionOrderDedup}. */

  if (!wcCustomerId) {
    return null;
  }

  try {
    const { data: list } = await wcAPI.get("/orders", {
      params: {
        customer: wcCustomerId,
        status: "pending",
        per_page: 25,
        orderby: "date",
        order: "desc",
        _fields: PENDING_LIST_FIELDS,
      },
    });
    const orders = Array.isArray(list) ? list : [];
    const pm = String(opts.paymentMethod || "").toLowerCase();

    const bySession = orders.find((row: { id?: number; meta_data?: unknown }) => {
      return (
        orderMatchesHeadlessSession(row.meta_data, opts.checkoutSessionId) &&
        typeof row.id === "number" &&
        row.id > 0
      );
    });
    if (bySession?.id) return Number(bySession.id);

    if (!reuseLatestPendingEnabled() || orders.length === 0) return null;

    const candidates = orders.filter((row: { id?: number; payment_method?: string; meta_data?: unknown }) => {
      if (typeof row.id !== "number" || row.id <= 0) return false;
      const rowPm = String(row.payment_method || "").toLowerCase();
      if (rowPm && rowPm !== pm) return false;
      return orderHasHeadlessSessionMeta(row.meta_data);
    });

    const latest = candidates[0] as { id?: number } | undefined;
    if (!latest || typeof latest.id !== "number" || latest.id <= 0) return null;
    return latest.id;
  } catch (e) {
    console.warn("[checkout] resolveExistingPendingCheckoutOrderId failed", {
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
