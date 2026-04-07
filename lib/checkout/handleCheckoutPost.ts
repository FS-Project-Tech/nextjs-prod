/**
 * Headless checkout POST: validates cart + shipping server-side, creates a Woo REST order in two
 * phases (minimal POST + extension PUT), then COD complete or eWAY redirect.
 * COD defers the extension PUT via Next `after()` so the JSON response is not blocked on meta/shipping/fees.
 */
import { Buffer } from "node:buffer";
import { after, NextRequest, NextResponse } from "next/server";
import { parseCheckoutPayload } from "@/lib/checkout/initiatePayload";
import { resolveCheckoutActor } from "@/utils/checkout-auth";
import { validateAndRecalculateCheckout } from "@/utils/checkout-pricing";
import { readJsonBody, zodFail } from "@/utils/api-parse";
import { executeWooCheckoutOrder } from "@/lib/checkout/executeWooCheckoutOrder";
import { isTimeoutError } from "@/lib/utils/errors";
import { syncCheckoutUserMeta } from "@/lib/checkout/syncCheckoutUserMeta";

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

function jsonCodOrderPlaced(orderIdRaw: string | number | bigint, orderKey: string): NextResponse {
  const oid = serializeOrderId(orderIdRaw);
  const data = {
    success: true as const,
    type: "order_placed" as const,
    payment_method: "cod" as const,
    orderId: oid,
    order_ref: String(orderIdRaw),
    order_key: orderKey,
  };
  return checkoutJsonResponse(
    {
      success: true,
      data,
      order_id: oid,
      order_key: orderKey,
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
): NextResponse {
  const oid = serializeOrderId(orderIdRaw);
  const body = {
    success: true,
    type: "redirect",
    orderId: oid,
    order_ref: String(orderIdRaw),
    order_key: orderKey,
    url,
  };
  return checkoutJsonResponse(
    {
      success: true,
      data: body,
      order_id: oid,
      order_key: orderKey,
      redirect_url: url,
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
  /** Validate + minimal create + (eWAY only) extension PUT + eWAY; raise if your Woo host is slow. */
  return Number.isFinite(n) && n > 0 ? n : 25_000;
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

export async function handleCheckoutPost(req: NextRequest): Promise<NextResponse> {
  const started = Date.now();
  let rawPayload: unknown;
  try {
    rawPayload = await readJsonBody(req);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  let payload;
  try {
    payload = parseCheckoutPayload(rawPayload);
  } catch (error: unknown) {
    const zod = zodFail(error);
    if (zod) return NextResponse.json(zod, { status: 400 });
    throw error;
  }

  console.log("[checkout] start", {
    payment_method: payload.payment_method,
    lines: payload.line_items?.length,
    shipping_method_id: payload.shipping_method_id,
    ms_since_start: Date.now() - started,
  });

  if (payload.payment_method !== "eway" && payload.payment_method !== "cod") {
    return NextResponse.json({ success: false, error: "Invalid payment method." }, { status: 400 });
  }

  try {
    const actor = await resolveCheckoutActor({ skipNdisCustomerLookup: true });
    const actorRoles = Array.isArray(actor.roles)
      ? actor.roles.map((r) => String(r || "").trim().toLowerCase())
      : [];
    const canUseOnAccount = actorRoles.includes("administrator") || Boolean(actor.ndisApproved);
    if (payload.payment_method === "cod" && !canUseOnAccount) {
      return NextResponse.json(
        {
          success: false,
          error: "On account payment is only available for administrator and NDIS-approved users.",
        },
        { status: 403 },
      );
    }
    after(async () => {
      try {
        await syncCheckoutUserMeta(actor, payload);
      } catch (e) {
        console.warn("[checkout] user meta sync failed", {
          userId: actor.userId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    });
    const { validatedLineItems, shippingLine } = await validateAndRecalculateCheckout(payload);

    const orderExtensionTiming =
      payload.payment_method === "cod"
        ? ({
            mode: "after_response" as const,
            schedule: (task: () => Promise<void>) => {
              after(task);
            },
          })
        : ({ mode: "inline" as const });

    const result = await withPromiseTimeout(
      restCheckoutTimeoutMs(),
      executeWooCheckoutOrder({
        payload,
        validatedLineItems,
        shippingLine,
        actor,
        customerIp: clientIpFromRequest(req) || undefined,
        orderExtensionTiming,
      }),
    );

    console.log("[checkout] ok", {
      kind: result.kind,
      totalMs: Date.now() - started,
    });

    if (result.kind === "cod") {
      return jsonCodOrderPlaced(result.orderIdRaw, result.orderKey);
    }
    return jsonEwayRedirect(result.redirectUrl, result.orderIdRaw, result.orderKey);
  } catch (error: unknown) {
    const timeoutBody = {
      success: false as const,
      code: "TIMEOUT" as const,
      message: "Checkout temporarily slow. Please retry.",
    };

    if (error instanceof CheckoutTimeoutError) {
      console.error("[checkout] timeout (envelope)", {
        ms: Date.now() - started,
        error,
      });
      return NextResponse.json(timeoutBody, { status: 504 });
    }

    if (isTimeoutError(error) || isAbortLikeCheckout(error)) {
      console.error("[checkout] timeout (Woo/network)", {
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

    console.error("[checkout] error", error);
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
