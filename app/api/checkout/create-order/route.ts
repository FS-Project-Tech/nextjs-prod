import { NextRequest, NextResponse } from "next/server";
import { parseCheckoutPayload } from "@/utils/checkout-validation";
import { canUseOnAccount, resolveCheckoutActor } from "@/utils/checkout-auth";
import { validateAndRecalculateCheckout } from "@/utils/checkout-pricing";
import { createWooOrder } from "@/services/woocommerce";
import { readJsonBody, zodFail } from "@/utils/api-parse";
import { INSURANCE_OPTION_META_KEY } from "@/lib/checkout-parcel-protection";

export const dynamic = "force-dynamic";

function normalizeCountry(country: string | undefined): string {
  const c = String(country || "").trim().toUpperCase();
  if (!c) return "AU";
  if (c === "AUSTRALIA") return "AU";
  return c;
}

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveCheckoutActor();
    const payload = parseCheckoutPayload(await readJsonBody(req));

    if (payload.payment_method === "on_account" && !actor.authenticated) {
      return NextResponse.json(
        { success: false, error: "Authentication required for On Account." },
        { status: 401 }
      );
    }
    if (payload.payment_method === "on_account" && !canUseOnAccount(actor)) {
      return NextResponse.json(
        {
          success: false,
          error: "On Account is only available for approved administrator accounts.",
        },
        { status: 403 }
      );
    }

    const { validatedLineItems, shippingLine } = await validateAndRecalculateCheckout(
      payload
    );

    const order = await createWooOrder({
      payment_method: payload.payment_method,
      payment_method_title:
        payload.payment_method === "eway"
          ? "Credit Card (eWAY)"
          : "On Account",
      set_paid: false,
      status: "pending",
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
        { key: "ndis_type", value: payload.ndis_type || "" },
        {
          key: INSURANCE_OPTION_META_KEY,
          value: payload.insurance_option === "yes" ? "yes" : "no",
        },
      ],
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
      paymentUrl: typeof order.payment_url === "string" ? order.payment_url : null,
    });
  } catch (error) {
    const zod = zodFail(error);
    if (zod) {
      return NextResponse.json(zod, { status: 400 });
    }
    const message =
      error instanceof Error ? error.message : "Failed to create checkout order.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    );
  }
}

