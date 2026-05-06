import {
  applyOrderExtensionWithRetry,
  buildCheckoutExtensionPatch,
  createValidatedCheckoutOrder,
  getWooOrder,
  validateCreatedLineItems,
  type OrderExtensionTiming,
} from "@/lib/services/wooService";
import { updateWooOrder, type WooCreateOrderInput } from "@/services/woocommerce";
import {
  CHECKOUT_SESSION_ID_ORDER_META_KEY,
  HEADLESS_CHECKOUT_SESSION_META_KEY,
} from "@/lib/checkout/checkoutSessionConstants";
import {
  findHeadlessSessionOrderDedup,
  resolveExistingPendingCheckoutOrderId,
} from "@/lib/checkout/resolveExistingPendingCheckoutOrder";
import { CheckoutSessionOrderExistsError } from "@/lib/checkout/checkoutSessionDuplicateError";
import { mergeWooOrderMetaByKey } from "@/lib/woo/orderMeta";
import { buildWooLineItemsFullReplacePayload } from "@/lib/woo/orderLineItemsReplace";
import type { CheckoutActor, CheckoutInitiatePayload } from "@/types/checkout";
 
function parseWooMoney(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (/^\d+,\d{1,2}$/.test(s)) {
      return Number.parseFloat(s.replace(",", ".")) || 0;
    }
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
 
function parseOrderTotal(order: unknown): number {
  return parseWooMoney((order as Record<string, unknown>)?.total);
}
 
/**
 * Payment uses WooCommerce `order.total` only — we only assert the order is non-empty and Woo reported a positive total.
 */
export function assertWooOrderPayable(order: unknown): void {
  const root = order as Record<string, unknown>;
  const lines = Array.isArray(root.line_items) ? root.line_items : [];
  if (lines.length === 0) {
    const err = new Error("Cart is empty");
    (err as { code?: string }).code = "EMPTY_LINE_ITEMS";
    throw err;
  }
 
  const woo = parseOrderTotal(order);
  if (!Number.isFinite(woo) || woo <= 0) {
    const err = new Error("Invalid total");
    (err as { code?: string }).code = "INVALID_TOTAL";
    throw err;
  }
}
 
/**
 * Create or update a pending Woo order (idempotent session + latest-pending reuse for logged-in users).
 */
export async function upsertValidatedCheckoutOrder(params: {
  payload: CheckoutInitiatePayload;
  input: WooCreateOrderInput;
  timing: OrderExtensionTiming;
  checkoutSessionId: string;
  actor: CheckoutActor;
  customerIp?: string;
  perf?: { wooCreateMs?: number; wooPatchMs?: number; requestId?: string };
}): Promise<unknown> {
  const { payload, input, timing, checkoutSessionId, actor, customerIp, perf } = params;
 
  if (!input.line_items?.length) {
    const err = new Error("Cart is empty");
    (err as { code?: string }).code = "EMPTY_LINE_ITEMS";
    throw err;
  }
 
  const dedup = await findHeadlessSessionOrderDedup({
    checkoutSessionId,
    billingEmail: payload.billing.email || "",
    paymentMethod: payload.payment_method,
  });
  if (dedup.state === "processing") {
    throw new CheckoutSessionOrderExistsError(
      dedup.orderId,
      dedup.orderKey,
      dedup.total,
      payload.payment_method,
    );
  }

  let existingId: number | null =
    dedup.state === "pending" ? dedup.orderId : null;
  if (existingId == null) {
    existingId = await resolveExistingPendingCheckoutOrderId({
      customerId: actor.userId,
      checkoutSessionId,
      paymentMethod: payload.payment_method,
      billingEmail: payload.billing.email || "",
      resume: payload.checkout_resume ?? undefined,
    });
  }
 
  const sessionRows = [
    { key: HEADLESS_CHECKOUT_SESSION_META_KEY, value: checkoutSessionId },
    { key: CHECKOUT_SESSION_ID_ORDER_META_KEY, value: checkoutSessionId },
  ];
  const baseMeta = input.meta_data ?? [];
 
  if (existingId != null) {
    const existingFull = await getWooOrder(String(existingId));
    const ex = existingFull as Record<string, unknown>;
    const st = String(ex.status || "").toLowerCase();
    if (st !== "pending") {
      throw new Error("This checkout order is no longer pending. Please start a new checkout.");
    }
    if (actor.userId && actor.userId > 0) {
      const oc = Number(ex.customer_id || 0);
      if (oc > 0 && oc !== actor.userId) {
        throw new Error("Order does not belong to this account.");
      }
    }
 
    const mergedMeta = mergeWooOrderMetaByKey(
      ex.meta_data as Array<{ id?: number; key: string; value: unknown }>,
      [...sessionRows, ...baseMeta],
    );
 
    const linePayload = buildWooLineItemsFullReplacePayload(existingFull, input.line_items);
 
    const phase1: Record<string, unknown> = {
      line_items: linePayload,
      billing: input.billing,
      shipping: input.shipping,
      payment_method: input.payment_method,
      payment_method_title: input.payment_method_title,
      set_paid: false,
      status: "pending",
      meta_data: mergedMeta,
    };
    if (customerIp) {
      phase1.customer_ip_address = customerIp;
    }
 
    const tUp = Date.now();
    await updateWooOrder(existingId, phase1);
    if (perf) perf.wooCreateMs = Date.now() - tUp;

    const existingShippingLineId = Number(
      (ex.shipping_lines as Array<{ id?: unknown }> | undefined)?.[0]?.id || 0,
    );
    const extPatch = buildCheckoutExtensionPatch(input, {
      omitMeta: true,
      existingShippingLineId:
        Number.isFinite(existingShippingLineId) && existingShippingLineId > 0
          ? existingShippingLineId
          : undefined,
    });
    const tExt = Date.now();
    if (Object.keys(extPatch).length > 0) {
      await applyOrderExtensionWithRetry(existingId, extPatch);
    }
    if (perf) perf.wooPatchMs = Date.now() - tExt;
 
    const refreshed = await getWooOrder(String(existingId));
    validateCreatedLineItems(refreshed);
    assertWooOrderPayable(refreshed);
    return refreshed;
  }
 
  const order = await createValidatedCheckoutOrder(input, timing, {
    checkoutSessionMeta: sessionRows,
    perf,
  });
  validateCreatedLineItems(order);
  /** COD may defer shipping/meta via `after()`; total is validated after extension in executeWooCheckoutOrder. */
  if (timing.mode === "inline") {
    assertWooOrderPayable(order);
  }
  return order;
}