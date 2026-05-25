/**
 * Headless checkout POST: validates cart + shipping server-side, creates a Woo REST order in two
 * phases (minimal POST + extension PUT), then COD complete or eWAY redirect.
 * COD defers the extension PUT (shipping/coupon/meta) via setImmediate so the JSON response can
 * return sooner; executeWooCheckoutOrder briefly polls until the order is payable or caps out.
 */
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { parseCheckoutPayload } from "@/lib/checkout/initiatePayload";
import { resolveCheckoutActor } from "@/utils/checkout-auth";
import { readJsonBody, zodFail } from "@/utils/api-parse";
import {
  executeWooCheckoutOrder,
  type CheckoutRoutePerf,
} from "@/lib/checkout/executeWooCheckoutOrder";
import type { OrderExtensionTiming } from "@/lib/services/wooService";
import { pricingWithEwayCartGate } from "@/lib/checkout/pricingWithEwayCartGate";
import { deriveCustomerPricingKey, wooStoreCurrency } from "@/lib/checkout/pricingOptions";
import {
  assertPayloadMatchesQuoteSnapshot,
  isQuoteSnapshotFresh,
  quoteSigningConstants,
  verifyQuoteSignature,
} from "@/lib/checkout/quoteSigning";
import {
  countNdisDigitsInCheckoutPayload,
  stripEmptyNdisHcpFromInitiatePayload,
} from "@/lib/checkout/ndisHcpPayload";
import { isTimeoutError } from "@/lib/utils/errors";
import {
  getCheckoutWpToken,
  syncCheckoutCustomerAfterOrder,
} from "@/lib/checkout/syncCheckoutCustomerAfterOrder";
import type { CheckoutActor } from "@/types/checkout";
import { CheckoutSessionOrderExistsError } from "@/lib/checkout/checkoutSessionDuplicateError";

function clientIpFromRequest(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  return (
    forwarded?.split(",")[0]?.trim() ||
    realIp?.trim() ||
    req.headers.get("cf-connecting-ip")?.trim() ||
    ""
  );
}

type CheckoutResultHint = "cod" | "redirect";
type PricingSuccess = Extract<Awaited<ReturnType<typeof pricingWithEwayCartGate>>, { ok: true }>["pricing"];

function orderResponseHeaders(
  orderIdRaw: string | number | bigint,
  orderKey: string,
  resultHint?: CheckoutResultHint,
): Record<string, string> {
  const orderHeader = encodeURIComponent(String(orderIdRaw));
  const orderIdPlain = String(orderIdRaw);
  const keyHeader = encodeURIComponent(orderKey);
  const exposed =
    "X-Create-Order-Id, X-Order-Id, X-Checkout-Order-Id, X-Order-Key, X-Checkout-Complete, ETag, X-Checkout-Body";
  const hint = resultHint || "ok";
  const etagId = encodeURIComponent(orderIdPlain);
  const base: Record<string, string> = {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "X-Create-Order-Id": orderHeader,
    "X-Order-Id": orderIdPlain,
    "X-Checkout-Order-Id": orderIdPlain,
    "X-Order-Key": keyHeader,
    ETag: `W/"wc-checkout-${hint}-${etagId}"`,
    "Access-Control-Expose-Headers": exposed,
  };
  if (resultHint) {
    base["X-Checkout-Complete"] = resultHint;
  }
  return base;
}

function encodeCheckoutBodyMirror(payload: Record<string, unknown>): string | null {
  try {
    const json = JSON.stringify(payload);
    if (json.length > 3500) return null;
    return Buffer.from(json, "utf8").toString("base64url");
  } catch {
    return null;
  }
}

function checkoutJsonResponse(
  payload: Record<string, unknown>,
  orderIdRaw: string | number | bigint,
  orderKey: string,
  resultHint?: CheckoutResultHint,
): NextResponse {
  const headers = new Headers();
  for (const [key, value] of Object.entries(orderResponseHeaders(orderIdRaw, orderKey, resultHint))) {
    headers.set(key, value);
  }
  const json = JSON.stringify(payload);
  const mirror = encodeCheckoutBodyMirror(payload);
  if (mirror) headers.set("X-Checkout-Body", mirror);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Content-Length", String(Buffer.byteLength(json, "utf8")));
  return new NextResponse(json, { status: 200, headers });
}

function serializeOrderId(orderIdRaw: string | number | bigint): number | string {
  if (typeof orderIdRaw === "bigint") return String(orderIdRaw);
  if (typeof orderIdRaw === "number" && Number.isFinite(orderIdRaw)) return orderIdRaw;
  return String(orderIdRaw);
}

function jsonCodOrderPlaced(
  orderIdRaw: string | number | bigint,
  orderKey: string,
  checkoutSessionId: string,
  wooOrderTotal: string | null,
): NextResponse {
  const oid = serializeOrderId(orderIdRaw);
  const data = {
    success: true as const,
    type: "order_placed" as const,
    payment_method: "cod" as const,
    orderId: oid,
    order_ref: String(orderIdRaw),
    order_key: orderKey,
    checkout_session_id: checkoutSessionId,
    ...(wooOrderTotal != null ? { order_total: wooOrderTotal } : {}),
  };
  return checkoutJsonResponse(
    {
      success: true,
      data,
      order_id: oid,
      order_key: orderKey,
      checkout_session_id: checkoutSessionId,
      ...(wooOrderTotal != null ? { order_total: wooOrderTotal } : {}),
    },
    orderIdRaw,
    orderKey,
    "cod",
  );
}

function jsonEwayRedirect(
  url: string,
  orderIdRaw: string | number | bigint,
  orderKey: string,
  checkoutSessionId: string,
  options?: { paymentReused?: boolean; wooOrderTotal?: string | null },
): NextResponse {
  const oid = serializeOrderId(orderIdRaw);
  const wt = options?.wooOrderTotal;
  const body = {
    success: true,
    type: "redirect",
    orderId: oid,
    order_ref: String(orderIdRaw),
    order_key: orderKey,
    checkout_session_id: checkoutSessionId,
    url,
    ...(options?.paymentReused === true ? { payment_reused: true as const } : {}),
    ...(wt != null ? { order_total: wt } : {}),
  };
  return checkoutJsonResponse(
    {
      success: true,
      data: body,
      order_id: oid,
      order_key: orderKey,
      checkout_session_id: checkoutSessionId,
      redirect_url: url,
      ...(options?.paymentReused === true ? { payment_reused: true } : {}),
      ...(wt != null ? { order_total: wt } : {}),
    },
    orderIdRaw,
    orderKey,
    "redirect",
  );
}

class CheckoutTimeoutError extends Error {
  constructor(message = "Request timeout") {
    super(message);
    this.name = "CheckoutTimeoutError";
  }
}

function restCheckoutTimeoutMs(): number {
  const n = Number(process.env.CHECKOUT_REST_CHECKOUT_TIMEOUT_MS);
  /** Must exceed stacked Woo calls (each often `WOOCOMMERCE_API_TIMEOUT` ~45s). Default 60s avoids envelope 504 before inner axios completes. */
  return Number.isFinite(n) && n > 0 ? n : 60_000;
}

function isAbortLikeCheckout(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return e.name === "AbortError" || e.name === "CanceledError";
}

function withPromiseTimeout<T>(ms: number, promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tid = setTimeout(() => reject(new CheckoutTimeoutError()), ms);
    promise
      .then((v) => {
        clearTimeout(tid);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(tid);
        reject(e);
      });
  });
}

function logCheckoutPerfSummary(opts: {
  validateMs: number;
  perf: CheckoutRoutePerf;
  checkoutStarted: number;
}) {
  const total_time = Date.now() - opts.checkoutStarted;
  opts.perf.total_time = total_time;
  const rid = opts.perf.requestId;
  console.log("[checkout] perf_summary", {
    requestId: rid,
    validate_time: opts.validateMs,
    woo_create_time: opts.perf.wooCreateMs ?? 0,
    woo_patch_time: opts.perf.wooPatchMs ?? 0,
    payment_time: opts.perf.paymentMs ?? 0,
    total_time,
  });
  if (total_time > 1500) {
    console.warn("[checkout][slow]", rid, opts.perf);
  }
}

export async function handleCheckoutPost(
  req: NextRequest,
  checkoutRequestId?: string,
): Promise<NextResponse> {
  const started = Date.now();
  let validateMs = 0;
  const perf: CheckoutRoutePerf = {};
  const correlationId = checkoutRequestId ?? randomUUID();
  perf.requestId = correlationId;
  /** Runs in parallel with JSON parse — saves one round-trip vs sequential session + body. */
  const actorPromise = resolveCheckoutActor({ skipNdisCustomerLookup: true });
  let rawPayload: unknown;
  try {
    rawPayload = await readJsonBody(req);
  } catch {
    await actorPromise.catch(() => {});
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  let payload;
  try {
    payload = parseCheckoutPayload(rawPayload);
  } catch (error: unknown) {
    await actorPromise.catch(() => {});
    const zod = zodFail(error);
    if (zod) return NextResponse.json(zod, { status: 400 });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Invalid checkout payload",
      },
      { status: 400 },
    );
  }

  console.log("[checkout] start", {
    requestId: correlationId,
    payment_method: payload.payment_method,
    lines: payload.line_items?.length,
    shipping_method_id: payload.shipping_method_id,
    ms_since_start: Date.now() - started,
  });

  if (payload.payment_method !== "eway" && payload.payment_method !== "cod") {
    await actorPromise.catch(() => {});
    return NextResponse.json({ success: false, error: "Invalid payment method." }, { status: 400 });
  }

  const actor = await actorPromise;

  try {
    const actorRoles = Array.isArray(actor.roles)
      ? actor.roles.map((r) => String(r || "").trim().toLowerCase())
      : [];
    const isGuestShopper =
      !actor.authenticated || actor.userId == null || actor.userId <= 0;
    const roleCanOnAccount =
      actorRoles.includes("administrator") ||
      actorRoles.includes("b2b_user") ||
      actorRoles.includes("b2b30days") ||
      actorRoles.includes("support_co_ordinator") ||
      actorRoles.includes("ndis-approved") ||
      Boolean(actor.ndisApproved);
    const guestNdisQualifies =
      isGuestShopper && countNdisDigitsInCheckoutPayload(payload) >= 9;
    const canUseOnAccount = roleCanOnAccount || guestNdisQualifies;
    if (payload.payment_method === "cod" && !canUseOnAccount) {
      return NextResponse.json(
        {
          success: false,
          error: isGuestShopper
            ? 'On account is available for guests when the NDIS number has at least 9 digits, or sign in as a B2B / NDIS-approved customer.'
            : "On account payment is only available for administrators, B2B / B2B 30-day customers, and NDIS Approved Customers.",
        },
        { status: 403 },
      );
    }

    payload = stripEmptyNdisHcpFromInitiatePayload(payload);
    if (payload.empower_program_applied) {
      console.log("[checkout][empower_discount_applied]", {
        requestId: correlationId,
        discountTotal: Number(payload.empower_discount_total || 0),
        discountItems: Number(payload.empower_discount_items || 0),
      });
    }

    after(async () => {
      try {
        const wpToken = await getCheckoutWpToken(req);
        await syncCheckoutCustomerAfterOrder(actor, payload, wpToken);
      } catch (e) {
        console.warn("[checkout] customer profile / address book sync failed", {
          requestId: correlationId,
          userId: actor.userId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    });
    let wooLineItems: PricingSuccess["wooLineItems"] | null = null;
    let shippingLine: PricingSuccess["shippingLine"] | null = null;
    let totals: PricingSuccess["totals"] | null = null;
    let usedSignedQuoteFastPath = false;

    const tValidate0 = Date.now();
    if (
      (payload.payment_method === "eway" || payload.payment_method === "cod") &&
      payload.quote_signing
    ) {
      const { signature, snapshot } = payload.quote_signing;
      const signatureOk = verifyQuoteSignature(snapshot, signature);
      const fresh = signatureOk
        ? isQuoteSnapshotFresh(snapshot, Date.now(), quoteSigningConstants.DEFAULT_QUOTE_MAX_AGE_MS)
        : false;
      const match = signatureOk && fresh ? assertPayloadMatchesQuoteSnapshot(payload, snapshot) : null;
      if (signatureOk && fresh && match?.ok) {
        wooLineItems = snapshot.woo_line_items;
        shippingLine = snapshot.shipping_line;
        totals = snapshot.totals;
        usedSignedQuoteFastPath = true;
      } else {
        console.warn("[checkout] quote_signing_fast_path_skipped", {
          requestId: correlationId,
          payment_method: payload.payment_method,
          signatureOk,
          fresh,
          mismatch: match && !match.ok && "message" in match ? match.message : null,
        });
      }
    }

    if (!usedSignedQuoteFastPath) {
      const gate = await pricingWithEwayCartGate(payload, {
        requestId: correlationId,
        currency: wooStoreCurrency(),
        customerType: deriveCustomerPricingKey(actor),
      });

      if (gate.ok === false) {
        validateMs = Date.now() - tValidate0;
        const cartCheck = gate.cartCheck;
        logCheckoutPerfSummary({ validateMs, perf, checkoutStarted: started });
        return NextResponse.json(
          {
            success: false,
            error: cartCheck.errors[0]?.message ?? "Cart validation failed",
            valid: cartCheck.valid,
            errors: cartCheck.errors,
            code: cartCheck.code,
          },
          { status: cartCheck.code === "SUBTOTAL_MISMATCH" ? 409 : 400 },
        );
      }

      ({ wooLineItems, shippingLine, totals } = gate.pricing);
    }

    validateMs = Date.now() - tValidate0;
    console.log("[checkout] validate time:", {
      requestId: correlationId,
      ms: validateMs,
      source: usedSignedQuoteFastPath ? "signed_quote" : "woo_pricing_gate",
    });

    if (!wooLineItems || !shippingLine || !totals) {
      logCheckoutPerfSummary({ validateMs, perf, checkoutStarted: started });
      return NextResponse.json(
        { success: false, error: "Unable to resolve checkout pricing. Please refresh totals and try again." },
        { status: 400 },
      );
    }
    const checkoutSessionId =
      typeof payload.checkout_session_id === "string" && payload.checkout_session_id.trim()
        ? payload.checkout_session_id.trim()
        : randomUUID();

    const orderExtensionTiming: OrderExtensionTiming =
      payload.payment_method === "cod" || payload.payment_method === "eway"
        ? {
            mode: "after_response",
            schedule: (task) => {
              const run = () => void task();
              if (typeof globalThis.setImmediate === "function") {
                globalThis.setImmediate(run);
              } else {
                setTimeout(run, 0);
              }
            },
          }
        : { mode: "inline" };

    const result = await withPromiseTimeout(
      restCheckoutTimeoutMs(),
      executeWooCheckoutOrder({
        payload,
        wooLineItems,
        shippingLine,
        actor,
        customerIp: clientIpFromRequest(req) || undefined,
        orderExtensionTiming,
        checkoutSessionId,
        totals,
        perf,
      }),
    );

    if (result.kind === "eway_error") {
      logCheckoutPerfSummary({ validateMs, perf, checkoutStarted: started });
      console.warn("[checkout] eWAY payment error (structured response)", {
        requestId: correlationId,
        action: result.action,
        ms: Date.now() - started,
      });
      return NextResponse.json(
        {
          success: false,
          message: result.message,
          error: result.message,
          action: result.action ?? "resume_payment",
          order_id: serializeOrderId(result.orderIdRaw),
          order_key: result.orderKey,
        },
        { status: 400 },
      );
    }

    console.log("[checkout] ok", {
      requestId: correlationId,
      kind: result.kind,
      totalMs: Date.now() - started,
    });

    logCheckoutPerfSummary({ validateMs, perf, checkoutStarted: started });

    if (result.kind === "cod") {
      return jsonCodOrderPlaced(
        result.orderIdRaw,
        result.orderKey,
        checkoutSessionId,
        result.wooOrderTotal,
      );
    }
    if (result.kind === "eway") {
      return jsonEwayRedirect(
        result.redirectUrl,
        result.orderIdRaw,
        result.orderKey,
        checkoutSessionId,
        {
          paymentReused: result.paymentReused === true,
          wooOrderTotal: result.wooOrderTotal,
        },
      );
    }

    return NextResponse.json(
      { success: false, error: "Unsupported checkout payment result." },
      { status: 500 },
    );
  } catch (error: unknown) {
    logCheckoutPerfSummary({ validateMs, perf, checkoutStarted: started });

    if (error instanceof CheckoutSessionOrderExistsError) {
      const e = error;
      const checkoutSessionId =
        typeof payload.checkout_session_id === "string" && payload.checkout_session_id.trim()
          ? payload.checkout_session_id.trim()
          : randomUUID();
      console.warn("[checkout] duplicate_submit_same_session", {
        requestId: correlationId,
        orderId: e.orderIdRaw,
        payment_method: e.paymentMethod,
      });
      if (e.paymentMethod === "cod") {
        return jsonCodOrderPlaced(e.orderIdRaw, e.orderKey, checkoutSessionId, e.wooOrderTotal);
      }
      const oid = serializeOrderId(e.orderIdRaw);
      return checkoutJsonResponse(
        {
          success: true,
          data: {
            type: "order_already_exists" as const,
            orderId: oid,
            order_ref: String(e.orderIdRaw),
            order_key: e.orderKey,
            checkout_session_id: checkoutSessionId,
            duplicate_submission: true as const,
            ...(e.wooOrderTotal != null ? { order_total: e.wooOrderTotal } : {}),
          },
          order_id: oid,
          order_key: e.orderKey,
          checkout_session_id: checkoutSessionId,
          duplicate_submission: true,
          ...(e.wooOrderTotal != null ? { order_total: e.wooOrderTotal } : {}),
        },
        e.orderIdRaw,
        e.orderKey,
        undefined,
      );
    }

    const timeoutBody = {
      success: false as const,
      code: "TIMEOUT" as const,
      message: "Checkout temporarily slow. Please retry.",
    };

    if (error instanceof CheckoutTimeoutError) {
      console.error("[checkout] timeout (envelope)", {
        requestId: correlationId,
        ms: Date.now() - started,
        error,
      });
      return NextResponse.json(timeoutBody, { status: 504 });
    }

    if (isTimeoutError(error) || isAbortLikeCheckout(error)) {
      console.error("[checkout] timeout (Woo/network)", {
        requestId: correlationId,
        ms: Date.now() - started,
        error,
      });
      return NextResponse.json(timeoutBody, { status: 504 });
    }

    const zod = zodFail(error);
    if (zod) return NextResponse.json(zod, { status: 400 });

    const cartErrData = (error as { data?: { type?: string; missing?: unknown[] } })?.data;
    if (cartErrData?.type === "cart_items_unavailable") {
      return NextResponse.json(
        {
          success: false,
          error: "Some items in your cart are no longer available. Please review your cart.",
          code: "CART_ITEMS_UNAVAILABLE",
          missingItems: cartErrData.missing ?? [],
        },
        { status: 409 },
      );
    }
    if (cartErrData?.type === "insufficient_stock") {
      console.error("[checkout] insufficient_stock", { requestId: correlationId, cartErrData });
      return NextResponse.json(
        {
          success: false,
          error: "One or more products do not have enough stock.",
          code: "INSUFFICIENT_STOCK",
        },
        { status: 409 },
      );
    }
    if (cartErrData?.type === "woo_invalid_product_mapping") {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid product mapping from WooCommerce. Likely product type or plugin issue.",
          code: "WOO_INVALID_PRODUCT_MAPPING",
        },
        { status: 502 },
      );
    }

    const errCode = (error as { code?: string }).code;
    if (errCode === "EMPTY_LINE_ITEMS") {
      return NextResponse.json({ success: false, error: "Cart is empty" }, { status: 400 });
    }
    if (errCode === "INVALID_TOTAL") {
      return NextResponse.json({ success: false, error: "Invalid total" }, { status: 400 });
    }
    console.error("[checkout] error", { requestId: correlationId, error });
    const msg = error instanceof Error ? error.message : "Order creation failed";
    const status = hasAxiosStatus(error) ? Number((error as { response?: { status?: number } }).response?.status) : 0;
    const httpStatus =
      status === 400 || status === 404 ? status : status >= 500 && status < 600 ? 502 : 502;
    return NextResponse.json({ success: false, error: msg }, { status: httpStatus });
  }
}

function hasAxiosStatus(e: unknown): boolean {
  const s = (e as { response?: { status?: number } })?.response?.status;
  return typeof s === "number" && s > 0;
}