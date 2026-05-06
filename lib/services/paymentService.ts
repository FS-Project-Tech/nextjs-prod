/**
 * Unified checkout payment orchestration (eWAY hosted card).
 * Charge amount comes from validated checkout totals when provided; Woo `order.total` is fallback only.
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
  getWooOrder,
  resolveOrderPostId,
  updateWooOrder,
} from "@/lib/services/wooService";
import {
  mergeEwayPaymentSessionMeta,
  readCanonicalCheckoutPaymentTotalString,
  readCurrentWooOrderTotalString,
  readStoredEwayPaymentOrderTotal,
  readStoredPaymentUrl,
  shouldReuseEwayPayment,
} from "@/lib/woo/orderPaymentLock";

export type HandlePaymentContext = {
  method: "eway";
  order: unknown;
  payload: CheckoutInitiatePayload;
  customerIp?: string;
  actorUserId?: number;
  /** Validated grand total (major units string); when set, eWAY uses this instead of Woo `order.total`. */
  validatedCheckoutTotalStr?: string;
  /** Checkout correlation id from `/api/checkout` for log stitching. */
  requestId?: string;
};

/** @deprecated use HandlePaymentContext */
export type PostOrderPaymentContext = HandlePaymentContext;

export type HandlePaymentResult =
  | { type: "redirect"; url: string; reused?: boolean }
  | { type: "error"; message: string; action?: "resume_payment" };

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
  const requestId = ctx.requestId;
  const postId = await resolvePostId(ctx.order);
  if (postId == null) {
    console.error("[payment] handlePayment: missing order id", { requestId });
    return { type: "error", message: "Order was created but has no ID." };
  }

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

  let latest: unknown = ctx.order;
  try {
    latest = await getWooOrder(String(postId));
  } catch (e) {
    console.warn("[payment] getWooOrder before eWAY failed; using ctx.order", {
      requestId,
      postId,
      message: e instanceof Error ? e.message : String(e),
    });
  }

  const existingPayUrl = readStoredPaymentUrl(latest);
  if (shouldReuseEwayPayment(latest) && existingPayUrl) {
    console.log({
      tag: "[payment] eWAY reuse existing payment_url from Woo meta",
      requestId,
      postId,
      reused: true,
    });
    return { type: "redirect", url: existingPayUrl, reused: true };
  }

  if (existingPayUrl) {
    console.log({
      tag: "[payment] eWAY not reusing stored payment_url (new AccessCodesShared)",
      requestId,
      postId,
      canonical_total: readCanonicalCheckoutPaymentTotalString(latest),
      woo_total: readCurrentWooOrderTotalString(latest),
      stored_session_total: readStoredEwayPaymentOrderTotal(latest),
    });
  }

  const lo = latest as Record<string, unknown>;
  const fromValidated =
    typeof ctx.validatedCheckoutTotalStr === "string" && ctx.validatedCheckoutTotalStr.trim()
      ? ctx.validatedCheckoutTotalStr.trim()
      : null;
  const total =
    fromValidated ??
    (readCanonicalCheckoutPaymentTotalString(latest) ||
      (typeof lo.total === "string" ? lo.total : typeof lo.total === "number" ? String(lo.total) : "0"));
  const currency =
    typeof lo.currency === "string" && lo.currency.trim() ? lo.currency.trim() : "AUD";

  const orderKey = extractWooOrderKey(latest);
  if (!orderKey) {
    return {
      type: "error",
      message: "WooCommerce order is missing order_key; cannot build payment return URL.",
    };
  }

  const wooParsed = Number.parseFloat(total);
  const ewayAmountCents = Math.round(wooParsed * 100);
  console.log({
    tag: "[payment] eway amounts (validated checkout total)",
    requestId,
    postId,
    payment_total: total,
    used_validated_param: Boolean(fromValidated),
    eway_amount_cents: ewayAmountCents,
  });

  console.log("[payment] eway: creating hosted payment", { requestId, postId });
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
    console.error("[payment] eWAY hosted payment failed", { requestId, error: eway.error });
    return { type: "error", message: eway.error, action: "resume_payment" };
  }

  try {
    const fresh = await getWooOrder(String(postId));
    await updateWooOrder(postId, {
      meta_data: mergeEwayPaymentSessionMeta(fresh, eway.sharedPaymentUrl, total),
    });
  } catch (e) {
    console.error("[payment] failed to store payment_url / payment_initiated on order", {
      requestId,
      postId,
      e,
    });
  }

  console.log("[payment] eway: SharedPaymentUrl issued", { requestId, postId });
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
  /** From eWAY verify transaction when present (decline descriptions, etc.). */
  responseMessage?: string | null;
}> {
  const v = await verifyEwayPayment(opts.accessCode);
  if (v.ok === false) {
    return { ok: false, paid: false, orderPostId: null, error: v.error, responseMessage: null };
  }

  const gwMsg = v.responseMessage ?? null;

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
      responseMessage: gwMsg,
    };
  }

  if (!hint) {
    return {
      ok: true,
      paid: false,
      orderPostId: null,
      transactionId: v.transactionId ?? null,
      responseCode: v.responseCode ?? null,
      responseMessage: gwMsg,
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
      responseMessage: gwMsg,
    };
  }

  try {
    const existing = (await getWooOrder(String(postId))) as {
      status?: string;
      date_paid?: string | null;
      transaction_id?: string;
    };
    const st = String(existing?.status || "").toLowerCase();
    const alreadyPaid =
      Boolean(existing?.date_paid) && (st === "processing" || st === "completed");
    if (alreadyPaid) {
      console.log("[payment] Woo order already marked paid (idempotent skip)", { postId });
      return {
        ok: true,
        paid: true,
        orderPostId: postId,
        transactionId: existing.transaction_id ?? v.transactionId ?? null,
        responseCode: v.responseCode ?? null,
        responseMessage: gwMsg,
      };
    }
  } catch (e) {
    console.warn("[payment] pre-update order read failed; continuing with verify", { postId, e });
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
      responseMessage: gwMsg,
    };
  }

  return {
    ok: true,
    paid: true,
    orderPostId: postId,
    transactionId: v.transactionId ?? null,
    responseCode: v.responseCode ?? null,
    responseMessage: gwMsg,
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
    const allowInvoiceOnly = process.env.EWAY_WEBHOOK_ALLOW_INVOICE_STATUS_ONLY === "true";
    if (allowInvoiceOnly) {
      const postId = await resolveOrderPostId(invoiceRef);
      if (postId) {
        await updateWooOrder(postId, { status: "processing", set_paid: true });
        console.warn(
          "[payment-webhook] paid via TransactionStatus without AccessCode — insecure; prefer AccessCode + verify API",
        );
        return { handled: true, message: "Order marked paid (webhook fields only)." };
      }
    }
  }

  if (txOk === false && invoiceRef) {
    await markOrderPaymentFailed(invoiceRef);
    return { handled: true, message: "Order marked failed." };
  }

  return { handled: false, message: "No actionable eWAY fields." };
}
