import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readJsonBody, zodFail } from "@/utils/api-parse";
import { extractWooOrderKey, getWooOrder, resolveOrderPostId } from "@/lib/services/wooService";
import { createEwayHostedPayment, isEwayConfigured } from "@/lib/services/ewayService";
import { updateWooOrder } from "@/services/woocommerce";
import { API_RATE_LIMITS, rateLimit, validateTrustedBrowserOrigin } from "@/lib/api-security";
import {
  mergeEwayPaymentSessionMeta,
  readStoredPaymentUrl,
  shouldReuseEwayPayment,
} from "@/lib/woo/orderPaymentLock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  order_id: z.union([z.number().int().positive(), z.string().trim().min(1)]),
  order_key: z.string().trim().min(1),
});

export async function POST(req: NextRequest) {
  if (!validateTrustedBrowserOrigin(req)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const limit = await rateLimit(API_RATE_LIMITS.EWAY_PAYMENT_INIT)(req);
  if (limit) return limit;

  if (!isEwayConfigured()) {
    return NextResponse.json({ success: false, error: "eWAY is not configured." }, { status: 503 });
  }

  let raw: unknown;
  try {
    raw = await readJsonBody(req);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(raw);
  } catch (e) {
    const zf = zodFail(e);
    return NextResponse.json(zf ?? { success: false, error: "Invalid request" }, { status: 400 });
  }

  const orderIdStr = String(parsed.order_id);
  const postIdNum =
    typeof parsed.order_id === "number" && Number.isFinite(parsed.order_id) && parsed.order_id > 0
      ? parsed.order_id
      : ((await resolveOrderPostId(orderIdStr)) ?? 0);
  if (!Number.isFinite(postIdNum) || postIdNum <= 0) {
    return NextResponse.json({ success: false, error: "Invalid order id." }, { status: 400 });
  }

  let order: unknown;
  try {
    order = await getWooOrder(orderIdStr);
  } catch {
    return NextResponse.json({ success: false, error: "Order not found." }, { status: 404 });
  }

  const key = extractWooOrderKey(order);
  if (!key || key !== parsed.order_key.trim()) {
    return NextResponse.json({ success: false, error: "Invalid order key." }, { status: 403 });
  }

  const o = order as Record<string, unknown>;
  if (String(o.payment_method || "").toLowerCase() !== "eway") {
    return NextResponse.json(
      { success: false, error: "Order is not payable with eWAY." },
      { status: 400 },
    );
  }

  const existingUrl = readStoredPaymentUrl(order);
  if (shouldReuseEwayPayment(order) && existingUrl) {
    console.log({
      tag: "[api/eway] reuse payment_url from Woo meta",
      orderId: orderIdStr,
      reused: true,
    });
    return NextResponse.json({
      success: true,
      payment_reused: true,
      data: {
        redirect_url: existingUrl,
        access_code: "",
      },
      redirect_url: existingUrl,
    });
  }

  const billing = (o.billing as Record<string, string | undefined>) || {};
  const shipping = (o.shipping as Record<string, string | undefined>) || {};

  const totalStr =
    typeof o.total === "string" ? o.total : typeof o.total === "number" ? String(o.total) : "0";
  const wooParsed = Number.parseFloat(totalStr);
  const ewayAmountCents = Math.round(wooParsed * 100);
  console.log({
    tag: "[api/eway] amounts (Woo is source of truth)",
    orderId: orderIdStr,
    woo_total: totalStr,
    eway_amount: ewayAmountCents,
  });

  const eway = await createEwayHostedPayment({
    wooOrderId: orderIdStr,
    orderKey: key,
    orderTotal: totalStr,
    currencyCode: typeof o.currency === "string" ? o.currency : "AUD",
    billing: {
      first_name: String(billing.first_name || ""),
      last_name: String(billing.last_name || ""),
      email: billing.email,
      phone: billing.phone,
      company: billing.company,
      address_1: String(billing.address_1 || ""),
      address_2: billing.address_2,
      city: String(billing.city || ""),
      state: billing.state,
      postcode: String(billing.postcode || ""),
      country: billing.country,
    },
    shipping: {
      first_name: String(shipping.first_name || billing.first_name || ""),
      last_name: String(shipping.last_name || billing.last_name || ""),
      address_1: String(shipping.address_1 || billing.address_1 || ""),
      city: String(shipping.city || billing.city || ""),
      state: shipping.state || billing.state,
      postcode: String(shipping.postcode || billing.postcode || ""),
      country: shipping.country || billing.country,
    },
  });

  if (eway.ok === false) {
    return NextResponse.json(
      {
        success: false,
        error: eway.error,
        message: eway.error,
        action: "resume_payment" as const,
        order_id: orderIdStr,
        order_key: key,
      },
      { status: 400 },
    );
  }

  try {
    const fresh = await getWooOrder(orderIdStr);
    await updateWooOrder(postIdNum, {
      meta_data: mergeEwayPaymentSessionMeta(fresh, eway.sharedPaymentUrl),
    });
  } catch (e) {
    console.error("[api/eway] failed to store payment_url on order", { orderId: orderIdStr, e });
  }

  return NextResponse.json({
    success: true,
    data: {
      redirect_url: eway.sharedPaymentUrl,
      access_code: eway.accessCode,
    },
    redirect_url: eway.sharedPaymentUrl,
  });
}
