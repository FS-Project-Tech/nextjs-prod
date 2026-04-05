/**
 * Unified checkout payment orchestration (eWAY hosted card).
 * All payment truth is server-side; Woo order is the source of truth.
 */
import type { CheckoutInitiatePayload } from "@/types/checkout";
import {
  createEwayHostedPayment,
  isEwayConfigured,
  verifyEwayPayment,
} from "@/lib/services/ewayService";
import {
  extractWooOrderId,
  extractWooOrderKey,
  resolveOrderPostId,
  updateWooOrder,
} from "@/lib/services/wooService";

export type HandlePaymentContext = {
  method: "eway";
  order: unknown;
  payload: CheckoutInitiatePayload;
  customerIp?: string;
  actorUserId?: number;
};

/** @deprecated use HandlePaymentContext */
export type PostOrderPaymentContext = HandlePaymentContext;

export type HandlePaymentResult =
  | { type: "redirect"; url: string }
  | { type: "error"; message: string };

/** @deprecated use HandlePaymentResult */
export type PostOrderPaymentResult = HandlePaymentResult;

async function resolvePostId(order: unknown): Promise<number | null> {
  const idRaw = extractWooOrderId(order);
  if (idRaw == null) return null;
  if (typeof idRaw === "number" && Number.isFinite(idRaw) && idRaw > 0) {
    return idRaw;
  }
  const s = String(idRaw).trim();
  const n = Number.parseInt(s, 10);
  if (Number.isFinite(n) && n > 0 && String(n) === s) return n;
  return resolveOrderPostId(s);
}

/**
 * After Woo order exists: start eWAY hosted payment.
 */
export async function handlePayment(ctx: HandlePaymentContext): Promise<HandlePaymentResult> {
  const postId = await resolvePostId(ctx.order);
  if (postId == null) {
    console.error("[payment] handlePayment: missing order id");
    return { type: "error", message: "Order was created but has no ID." };
  }

  const o = ctx.order as Record<string, unknown>;
  const billing = ctx.payload.billing;
  const sp = ctx.payload.shipping;
  const ship = {
    first_name: sp.first_name,
    last_name: sp.last_name,
    address_1: sp.address_1,
    city: sp.city,
    state: sp.state || "",
    postcode: sp.postcode,
    country: sp.country,
  };

  if (!isEwayConfigured()) {
    return {
      type: "error",
      message:
        "eWAY is not configured. Set EWAY_API_KEY, EWAY_PASSWORD, and a public site URL for redirects.",
    };
  }

  const total =
    typeof o.total === "string" ? o.total : typeof o.total === "number" ? String(o.total) : "0";
  const currency = typeof o.currency === "string" && o.currency.trim() ? o.currency.trim() : "AUD";

  const orderKey = extractWooOrderKey(ctx.order);
  if (!orderKey) {
    return {
      type: "error",
      message: "WooCommerce order is missing order_key; cannot build payment return URL.",
    };
  }

  console.log("[payment] eway: creating hosted payment", { postId });
  const eway = await createEwayHostedPayment({
    wooOrderId: postId,
    orderKey,
    orderTotal: total,
    currencyCode: currency,
    billing,
    shipping: ship,
    customerIp: ctx.customerIp,
  });

  if (eway.ok === false) {
    console.error("[payment] eWAY hosted payment failed", eway.error);
    return { type: "error", message: eway.error };
  }

  console.log("[payment] eway: SharedPaymentUrl issued", { postId });
  return { type: "redirect", url: eway.sharedPaymentUrl };
}

/** @deprecated use handlePayment */
export const handlePostOrderPayment = handlePayment;

export async function markOrderPaymentFailed(orderRef: string): Promise<void> {
  const postId = await resolveOrderPostId(orderRef);
  if (!postId) return;
  try {
    await updateWooOrder(postId, { status: "failed", set_paid: false });
    console.log("[payment] order marked failed", { postId });
  } catch (e) {
    console.warn("[payment] markOrderPaymentFailed", e);
  }
}

export async function verifyEwayAndMarkWooPaid(opts: {
  accessCode: string;
  orderRef?: string | null;
}): Promise<{
  ok: boolean;
  paid: boolean;
  orderPostId: number | null;
  error?: string;
  transactionId?: string | null;
  responseCode?: string | null;
}> {
  const v = await verifyEwayPayment(opts.accessCode);
  if (v.ok === false) {
    return { ok: false, paid: false, orderPostId: null, error: v.error };
  }

  const hint =
    (opts.orderRef && String(opts.orderRef).trim()) ||
    (v.invoiceReference && v.invoiceReference.trim()) ||
    "";

  if (!v.success) {
    if (hint) await markOrderPaymentFailed(hint);
    return {
      ok: true,
      paid: false,
      orderPostId: null,
      transactionId: v.transactionId ?? null,
      responseCode: v.responseCode ?? null,
    };
  }

  if (!hint) {
    return {
      ok: true,
      paid: false,
      orderPostId: null,
      transactionId: v.transactionId ?? null,
      responseCode: v.responseCode ?? null,
    };
  }

  const postId = await resolveOrderPostId(hint);
  if (!postId) {
    return {
      ok: true,
      paid: false,
      orderPostId: null,
      transactionId: v.transactionId ?? null,
      responseCode: v.responseCode ?? null,
    };
  }

  try {
    await updateWooOrder(postId, {
      status: "processing",
      set_paid: true,
      ...(v.transactionId ? { transaction_id: v.transactionId } : {}),
    });
    console.log("[payment] Woo order marked paid (eWAY verified)", { postId });
  } catch (e) {
    console.error("[payment] Woo update after eWAY verify failed", e);
    return {
      ok: false,
      paid: false,
      orderPostId: null,
      error: "Verified payment but WooCommerce update failed.",
    };
  }

  return {
    ok: true,
    paid: true,
    orderPostId: postId,
    transactionId: v.transactionId ?? null,
    responseCode: v.responseCode ?? null,
  };
}

function pickString(body: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = body[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

function readTransactionStatus(body: Record<string, unknown>): boolean | null {
  const tx =
    body.Transaction && typeof body.Transaction === "object"
      ? (body.Transaction as Record<string, unknown>)
      : null;
  const candidates = [body.TransactionStatus, tx?.TransactionStatus, body.transactionStatus];
  for (const c of candidates) {
    if (c === true) return true;
    if (c === false) return false;
    if (typeof c === "string") {
      const s = c.trim().toLowerCase();
      if (s === "true" || s === "1") return true;
      if (s === "false" || s === "0") return false;
    }
    if (typeof c === "number") return c === 1;
  }
  return null;
}

/** eWAY merchant notification — prefer AccessCode + verify API. */
export async function processEwayWebhookPayload(
  body: Record<string, unknown>
): Promise<{ handled: boolean; message: string }> {
  if (process.env.NODE_ENV !== "production") {
    console.log("[payment-webhook] received", { keyCount: Object.keys(body).length });
  }

  const accessCode = pickString(body, ["AccessCode", "accessCode", "access_code", "Accesscode"]);

  if (accessCode) {
    const orderRef =
      pickString(body, [
        "InvoiceReference",
        "invoice_reference",
        "order_id",
        "OrderId",
        "orderId",
      ]) || null;

    const r = await verifyEwayAndMarkWooPaid({
      accessCode,
      orderRef,
    });
    if (!r.ok) {
      return { handled: false, message: r.error || "verify failed" };
    }
    return {
      handled: true,
      message: r.paid ? "Order marked paid." : "Payment not approved or order unresolved.",
    };
  }

  const txOk = readTransactionStatus(body);
  const invoiceRef = pickString(body, ["InvoiceReference", "invoice_reference", "order_id"]);

  if (txOk === true && invoiceRef) {
    const postId = await resolveOrderPostId(invoiceRef);
    if (postId) {
      await updateWooOrder(postId, { status: "processing", set_paid: true });
      console.warn(
        "[payment-webhook] paid via TransactionStatus without AccessCode — configure webhook to send AccessCode when possible"
      );
      return { handled: true, message: "Order marked paid (webhook fields only)." };
    }
  }

  if (txOk === false && invoiceRef) {
    await markOrderPaymentFailed(invoiceRef);
    return { handled: true, message: "Order marked failed." };
  }

  return { handled: false, message: "No actionable eWAY fields." };
}
