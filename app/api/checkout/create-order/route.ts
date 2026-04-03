import { NextRequest, NextResponse } from "next/server";
import { parseCheckoutPayload } from "@/utils/checkout-validation";
import { canUseOnAccount, resolveCheckoutActor } from "@/utils/checkout-auth";
import { validateAndRecalculateCheckout } from "@/utils/checkout-pricing";
import { createWooOrderWithDebug } from "@/lib/woo/createOrder";
import { readJsonBody, zodFail } from "@/utils/api-parse";
import {
  INSURANCE_OPTION_META_KEY,
  PARCEL_PROTECTION_FEE_AUD,
} from "@/lib/checkout-parcel-protection";
import { placeOnAccountOrderViaStoreApi } from "@/lib/store-api-place-order";
import wcAPI from "@/lib/woocommerce";
import {
  createEwaySharedPaymentUrl,
  isEwayRapidConfigured,
} from "@/lib/eway-responsive-shared";

export const dynamic = "force-dynamic";

function normalizeCountry(country: string | undefined): string {
  const c = String(country || "").trim().toUpperCase();
  if (!c) return "AU";
  if (c === "AUSTRALIA") return "AU";
  return c;
}

/**
 * WooCommerce usually returns `id` (post ID). Some proxies/plugins nest under `data`,
 * or only expose human-readable `number` / `order_number` (sequential plugins).
 */
function pickIdCandidates(o: Record<string, unknown>): unknown[] {
  return [
    o.id,
    o.ID,
    o.order_id,
    o.number,
    o.order_number,
    /** Some gateways/plugins nest Woo order id here */
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
      /* Non-numeric order ref (e.g. sequential plugins) — order-review can resolve by search */
      return t;
    }
  }
  return null;
}

function extractOrderIdFromWooResponse(order: unknown): number | string | null {
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
      : root.order != null &&
          typeof root.order === "object" &&
          !Array.isArray(root.order)
        ? (root.order as Record<string, unknown>)
        : null;
  if (orderObj) {
    const fromNestedOrder = firstResolvedId(pickIdCandidates(orderObj));
    if (fromNestedOrder != null) return fromNestedOrder;
  }

  return null;
}

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

export async function POST(req: NextRequest) {
  try {
    const payload = parseCheckoutPayload(await readJsonBody(req));
    const actor = await resolveCheckoutActor({
      skipNdisCustomerLookup: payload.payment_method !== "on_account",
    });

    // Only resolve checkout actor (roles, NDIS, etc.) when needed for On Account
    if (payload.payment_method === "on_account") {
      if (!actor.authenticated) {
        return NextResponse.json(
          { success: false, error: "Authentication required for On Account." },
          { status: 401 }
        );
      }
      if (!canUseOnAccount(actor)) {
        return NextResponse.json(
          {
            success: false,
            error:
              "On Account is only available for approved administrator accounts.",
          },
          { status: 403 }
        );
      }
    }

    const { validatedLineItems, shippingLine } =
      await validateAndRecalculateCheckout(payload);

    let order: unknown;
    try {
      if (payload.payment_method === "on_account") {
        const store = await placeOnAccountOrderViaStoreApi({
          cookieHeader: req.headers.get("cookie") ?? "",
          payload,
          validatedLineItems,
        });
        if (store.ok === false) {
          console.error("[create-order] Store API checkout failed", {
            status: store.status,
            message: store.message,
            raw:
              typeof store.raw === "string"
                ? store.raw.slice(0, 600)
                : undefined,
          });
          return NextResponse.json(
            { success: false, error: store.message },
            {
              status:
                store.status >= 400 && store.status < 600 ? store.status : 502,
            }
          );
        }
        try {
          console.info("[create-order] Store API checkout ok", {
            order_id: store.order_id,
            preview: JSON.stringify(store.raw).slice(0, 800),
          });
        } catch {
          /* ignore */
        }
        const postId = store.order_id;
        try {
          await wcAPI.put(`/orders/${postId}`, {
            payment_method: "on_account",
            payment_method_title: "On Account",
            status: "processing",
            set_paid: false,
          });
        } catch (pmErr) {
          console.warn(
            "[create-order] could not switch order from Store placeholder gateway to on_account",
            pmErr
          );
        }
        if (typeof actor.userId === "number" && actor.userId > 0) {
          try {
            await wcAPI.put(`/orders/${postId}`, { customer_id: actor.userId });
          } catch (attachErr) {
            console.warn("[create-order] could not set customer_id on order", attachErr);
          }
        }
        if (payload.insurance_option === "yes") {
          try {
            const { data } = await wcAPI.get(`/orders/${postId}`);
            const existing = Array.isArray((data as { fee_lines?: unknown }).fee_lines)
              ? (
                  (data as { fee_lines: Array<Record<string, unknown>> }).fee_lines
                ).map((f) => ({
                  id: f.id,
                  name: f.name,
                  total: f.total,
                  tax_status: f.tax_status,
                }))
              : [];
            await wcAPI.put(`/orders/${postId}`, {
              fee_lines: [
                ...existing,
                {
                  name: "Parcel Protection",
                  total: PARCEL_PROTECTION_FEE_AUD.toFixed(2),
                  tax_status: "taxable",
                },
              ],
            });
          } catch (feeErr) {
            console.warn("[create-order] parcel protection fee on Store order failed", feeErr);
          }
        }
        const metaPatch: Array<{ key: string; value: string }> = [
          ...(payload.ndis_type
            ? [{ key: "ndis_type", value: payload.ndis_type }]
            : []),
          {
            key: INSURANCE_OPTION_META_KEY,
            value: payload.insurance_option === "yes" ? "yes" : "no",
          },
        ];
        if (metaPatch.length) {
          try {
            const { data } = await wcAPI.get(`/orders/${postId}`);
            const existingMeta = Array.isArray(
              (data as { meta_data?: unknown }).meta_data
            )
              ? ((data as { meta_data: Array<{ id?: number; key: string; value: unknown }> })
                  .meta_data)
              : [];
            const merged = [...existingMeta];
            for (const row of metaPatch) {
              const i = merged.findIndex((m) => m.key === row.key);
              if (i >= 0)
                merged[i] = { ...merged[i], key: row.key, value: row.value };
              else merged.push({ key: row.key, value: row.value });
            }
            await wcAPI.put(`/orders/${postId}`, { meta_data: merged });
          } catch (metaErr) {
            console.warn("[create-order] order meta merge failed", metaErr);
          }
        }
        order = {
          id: postId,
          order_id: postId,
          order_key: store.order_key,
          total: store.raw.total,
          currency: store.raw.currency,
        };
      } else {
        order = await createWooOrderWithDebug({
          payment_method: payload.payment_method,
          payment_method_title: "Credit Card (eWAY)",
          set_paid: false,
          status: "pending",
          customer_id:
            typeof actor.userId === "number" && actor.userId > 0
              ? actor.userId
              : undefined,
          line_items: validatedLineItems,
          billing: {
            ...payload.billing,
            country: normalizeCountry(payload.billing.country),
          },
          shipping: {
            ...payload.shipping,
            country: normalizeCountry(payload.shipping.country),
          },
          shipping_line: shippingLine,
          meta_data: [
            ...(payload.ndis_type
              ? [{ key: "ndis_type", value: payload.ndis_type }]
              : []),
            {
              key: INSURANCE_OPTION_META_KEY,
              value: payload.insurance_option === "yes" ? "yes" : "no",
            },
          ],
        });

        try {
          console.info("[create-order] Woo response", {
            excerpt: JSON.stringify(order).slice(0, 800),
          });
        } catch {
          // ignore JSON stringify issues
        }
      }
    } catch (err: any) {
      // Handle cases where WooCommerce returns non-JSON or error HTML
      const axiosLike = err as {
        message?: string;
        response?: { status?: number; data?: unknown };
      };
      const status = axiosLike.response?.status;
      let rawData = axiosLike.response?.data;

      let rawText: string | undefined;
      if (typeof rawData === "string") {
        rawText = rawData;
      } else if (rawData != null) {
        try {
          rawText = JSON.stringify(rawData);
        } catch {
          rawText = "[unserializable response data]";
        }
      }

      console.error("[create-order] WooCommerce order creation failed", {
        status,
        message: axiosLike.message,
        responsePreview: rawText?.slice(0, 800),
      });

      const wooMessage =
        (typeof rawData === "object" &&
          rawData !== null &&
          (rawData as any).message &&
          String((rawData as any).message)) ||
        (typeof rawText === "string" && rawText.trim().slice(0, 300));

      const errorMessage =
        typeof wooMessage === "string" && wooMessage.trim()
          ? `WooCommerce error while creating order: ${wooMessage.trim()}`
          : "Failed to create order in WooCommerce. Please try again or contact support.";

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
        },
        { status: 502 }
      );
    }

    const orderId = extractOrderIdFromWooResponse(order);
    if (orderId == null) {
      let messageFromWoo: string | undefined;
      if (order && typeof order === "object") {
        const root = order as Record<string, unknown>;
        const nested =
          root.data != null && typeof root.data === "object"
            ? (root.data as Record<string, unknown>)
            : null;
        const src = nested ?? root;
        const msg = src.message;
        if (typeof msg === "string" && msg.trim()) {
          messageFromWoo = msg.trim();
        }
      }

      try {
        console.error("[create-order] WooCommerce order missing id", {
          keys: order && typeof order === "object" ? Object.keys(order as object) : [],
          preview:
            order && typeof order === "object"
              ? JSON.stringify(order).slice(0, 800)
              : String(order),
        });
      } catch {
        // ignore logging failures
      }

      const errorMessage =
        messageFromWoo && messageFromWoo.length > 0
          ? `Order was created but no order ID was returned from WooCommerce. Message: ${messageFromWoo}`
          : "Order was created but no order ID was returned from WooCommerce. Check API credentials and server logs.";

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
        },
        { status: 502 }
      );
    }

    const o = order as Record<string, unknown>;
    const orderNumber =
      typeof o.number === "string"
        ? o.number.trim()
        : typeof o.order_number === "string"
          ? o.order_number.trim()
          : undefined;

    const wooTotal =
      typeof o.total === "string"
        ? o.total
        : typeof o.total === "number"
          ? String(o.total)
          : "";
    const currency =
      typeof o.currency === "string" && o.currency.trim()
        ? o.currency.trim()
        : "AUD";

    let paymentUrl: string | null = null;

    if (payload.payment_method === "eway") {
      // eWAY call only after Woo order is created
      if (!paymentUrl && isEwayRapidConfigured()) {
        const eway = await createEwaySharedPaymentUrl({
          wooOrderId: orderId,
          orderTotal: wooTotal || "0",
          currencyCode: currency,
          billing: payload.billing,
          shipping: payload.shipping,
          customerIp: clientIpFromRequest(req) || undefined,
        });
        if (eway.ok === false) {
          console.error("[create-order] eWAY AccessCodesShared failed", eway.error);
          return NextResponse.json(
            {
              success: false,
              error:
                "Payment could not be started. Please try again or contact support.",
            },
            { status: 502 }
          );
        }
        paymentUrl = eway.sharedPaymentUrl;
      }
      if (!paymentUrl) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Payment URL could not be determined. Configure eWAY (EWAY_API_KEY, EWAY_PASSWORD) and redirect base URLs.",
          },
          { status: 502 }
        );
      }
    }

    const numericOrderId =
      typeof orderId === "number" && Number.isFinite(orderId) && orderId > 0
        ? orderId
        : Number.parseInt(String(orderId), 10);
    const orderIdAsNumber =
      Number.isFinite(numericOrderId) && numericOrderId > 0 ? numericOrderId : orderId;

    const idBody: Record<string, unknown> = {
      success: true as const,
      orderId: orderIdAsNumber,
      /** Redundant keys so proxies/clients never lose the ref after JSON transforms */
      order_id: orderId,
      id: orderId,
      wooOrderId: orderId,
      ...(orderNumber ? { orderNumber, number: orderNumber } : {}),
      paymentUrl: payload.payment_method === "eway" ? paymentUrl : null,
    };

    if (payload.payment_method === "on_account") {
      idBody.redirect = `/order-review?order_id=${encodeURIComponent(String(orderId))}`;
    }

    return NextResponse.json(idBody, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Create-Order-Id": encodeURIComponent(String(orderId)),
      },
    });
  } catch (error) {
    const zod = zodFail(error);
    if (zod) {
      return NextResponse.json(zod, { status: 400 });
    }

    const cartErrData = (error as any)?.data;
    if (cartErrData?.type === "cart_items_unavailable") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Some items in your cart are no longer available. Please review your cart.",
          code: "CART_ITEMS_UNAVAILABLE",
          missingItems: cartErrData.missing ?? [],
        },
        { status: 409 }
      );
    }
    if (cartErrData?.type === "woo_invalid_product_mapping") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid product mapping from WooCommerce. Likely product type or plugin issue.",
          code: "WOO_INVALID_PRODUCT_MAPPING",
        },
        { status: 502 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to create checkout order.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    );
  }
}