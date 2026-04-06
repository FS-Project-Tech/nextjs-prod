import { NextRequest, NextResponse } from "next/server";
import {
  buildPurchasePayloadFromWooOrder,
  trackPurchaseServerSide,
} from "@/lib/analytics/server-track-purchase";
import wcAPI from "@/lib/woocommerce";
import { readJsonBody } from "@/utils/api-parse";

export const dynamic = "force-dynamic";

type CartLineInput = {
  product_id?: unknown;
  quantity?: unknown;
  variation_id?: unknown;
};

type AddressInput = Record<string, unknown>;

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return (
    first ||
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("cf-connecting-ip")?.trim() ||
    ""
  );
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function requireBilling(body: Record<string, unknown>): AddressInput | NextResponse {
  const billing = body.billing;
  if (!billing || typeof billing !== "object" || Array.isArray(billing)) {
    return NextResponse.json({ error: "billing is required and must be an object" }, { status: 400 });
  }
  const b = billing as AddressInput;
  const required = ["first_name", "last_name", "email", "address_1", "city", "postcode", "country"];
  for (const key of required) {
    if (!isNonEmptyString(b[key])) {
      return NextResponse.json({ error: `billing.${key} is required` }, { status: 400 });
    }
  }
  return b;
}

function mapLineItems(raw: unknown): { ok: true; items: object[] } | { ok: false; response: NextResponse } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      ok: false,
      response: NextResponse.json({ error: "line_items must be a non-empty array" }, { status: 400 }),
    };
  }

  const items: object[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Each line item must be an object" }, { status: 400 }),
      };
    }
    const line = row as CartLineInput;
    const productId = Number(line.product_id);
    const qty = Number(line.quantity);
    if (!Number.isFinite(productId) || productId <= 0) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Each line item needs a valid product_id" }, { status: 400 }),
      };
    }
    if (!Number.isFinite(qty) || qty < 1 || !Number.isInteger(qty)) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Each line item needs quantity >= 1" }, { status: 400 }),
      };
    }

    const mapped: Record<string, number> = { product_id: productId, quantity: qty };
    const vid = line.variation_id != null ? Number(line.variation_id) : NaN;
    if (Number.isFinite(vid) && vid > 0) {
      mapped.variation_id = vid;
    }
    items.push(mapped);
  }

  return { ok: true, items };
}

/**
 * Creates a WooCommerce COD order (`payment_method: cod`, processing, unpaid). Customer-facing label: On Account.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await readJsonBody(req)) as Record<string, unknown>;

    const billingResult = requireBilling(body);
    if (billingResult instanceof NextResponse) return billingResult;
    const billing = billingResult;

    const shippingRaw = body.shipping;
    const shipping =
      shippingRaw && typeof shippingRaw === "object" && !Array.isArray(shippingRaw)
        ? (shippingRaw as AddressInput)
        : billing;

    const lineResult = mapLineItems(body.line_items);
    if (lineResult.ok === false) return lineResult.response;

    const shippingLines = Array.isArray(body.shipping_lines) ? body.shipping_lines : [];
    const couponLines = Array.isArray(body.coupon_lines) ? body.coupon_lines : [];

    const paymentTitle = isNonEmptyString(body.payment_method_title)
      ? body.payment_method_title.trim()
      : "On Account";

    const customerNote = isNonEmptyString(body.customer_note) ? body.customer_note.trim() : undefined;

    const customerIdRaw = body.customer_id;
    const customerId =
      customerIdRaw != null
        ? Number(customerIdRaw)
        : NaN;
    const wooCustomerId =
      Number.isFinite(customerId) && customerId > 0 ? Math.floor(customerId) : undefined;

    const orderPayload: Record<string, unknown> = {
      payment_method: "cod",
      payment_method_title: paymentTitle,
      set_paid: false,
      status: "processing",
      billing,
      shipping,
      line_items: lineResult.items,
      shipping_lines: shippingLines,
      coupon_lines: couponLines,
    };

    const ip = clientIp(req);
    if (ip) {
      orderPayload.customer_ip_address = ip;
    }

    if (wooCustomerId != null) {
      orderPayload.customer_id = wooCustomerId;
    }
    if (customerNote) {
      orderPayload.customer_note = customerNote;
    }

    const { data } = await wcAPI.post("/orders", orderPayload);

    const billingEmail =
      typeof billing.email === "string" ? billing.email : undefined;
    const purchasePayload = buildPurchasePayloadFromWooOrder(data, billingEmail);
    if (purchasePayload) {
      void trackPurchaseServerSide(purchasePayload);
    }

    return NextResponse.json({
      success: true,
      id: data.id,
      order_key: data.order_key,
      status: data.status,
      order: data,
    });
  } catch (err: unknown) {
    const ax = err as { response?: { status?: number; data?: unknown } };
    const status = ax.response?.status ?? 500;
    const wooData = ax.response?.data;
    const message =
      wooData && typeof wooData === "object" && wooData !== null && "message" in wooData
        ? String((wooData as { message: unknown }).message)
        : "Failed to create order";
    console.error("[create-order]", message, err);
    return NextResponse.json({ success: false, error: message }, { status: status >= 400 && status < 600 ? status : 502 });
  }
}
