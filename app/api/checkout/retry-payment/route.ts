import { NextRequest, NextResponse } from "next/server";
import wcAPI from "@/lib/woocommerce";
import { readJsonBody } from "@/utils/api-parse";
import { createEwayHostedPayment, isEwayConfigured } from "@/lib/services/ewayService";
import { resolveOrderPostId } from "@/lib/services/wooService";

export const dynamic = "force-dynamic";

/**
 * Issue a new eWAY Shared Page URL for a pending card order.
 * TODO: tighten auth (order key / logged-in customer match) before production hardening.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await readJsonBody(req)) as {
      orderId?: string | number;
      order_id?: string | number;
    };
    const ref = String(body.orderId ?? body.order_id ?? "").trim();
    if (!ref) {
      return NextResponse.json(
        { success: false, error: "orderId is required." },
        { status: 400 }
      );
    }

    const postId = await resolveOrderPostId(ref);
    if (!postId) {
      return NextResponse.json(
        { success: false, error: "Order not found." },
        { status: 404 }
      );
    }

    const { data: order } = await wcAPI.get(`/orders/${postId}`);
    const pm = String((order as { payment_method?: string }).payment_method || "").toLowerCase();
    const st = String((order as { status?: string }).status || "").toLowerCase();
    if (pm !== "eway" || st !== "pending") {
      return NextResponse.json(
        {
          success: false,
          error: "Only pending eWAY orders can retry payment.",
        },
        { status: 409 }
      );
    }

    if (!isEwayConfigured()) {
      return NextResponse.json(
        { success: false, error: "eWAY is not configured." },
        { status: 502 }
      );
    }

    const billing = (order as { billing?: Record<string, string> }).billing || {};
    const shipping = (order as { shipping?: Record<string, string> }).shipping || {};

    const eway = await createEwayHostedPayment({
      wooOrderId: postId,
      orderTotal: String((order as { total?: string }).total ?? "0"),
      currencyCode: String((order as { currency?: string }).currency || "AUD"),
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
        address_1: String(shipping.address_1 || ""),
        city: String(shipping.city || ""),
        state: shipping.state,
        postcode: String(shipping.postcode || ""),
        country: shipping.country,
      },
    });

    if (eway.ok === false) {
      return NextResponse.json(
        { success: false, error: eway.error },
        { status: 502 }
      );
    }

    console.log("[retry-payment] issued new eWAY URL", { postId });

    return NextResponse.json({
      success: true,
      type: "redirect" as const,
      url: eway.sharedPaymentUrl,
      orderId: postId,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Retry failed.";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
