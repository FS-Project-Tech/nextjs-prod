import { NextRequest, NextResponse } from "next/server";
import { resolveCheckoutActor } from "@/utils/checkout-auth";
import { resolveLastCheckoutOrderForRecovery } from "@/lib/checkout/resolveLastCheckoutOrderForRecovery";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const requestId =
    req.headers.get("x-request-id")?.trim() ||
    req.headers.get("x-vercel-id")?.trim() ||
    undefined;

  try {
    const actor = await resolveCheckoutActor({ skipNdisCustomerLookup: true });
    const sessionId = req.nextUrl.searchParams.get("session_id")?.trim() ?? "";

    const result = await resolveLastCheckoutOrderForRecovery({
      actor,
      checkoutSessionId: sessionId,
    });

    return NextResponse.json(
      {
        hasRecentOrder: result.hasRecentOrder,
        ...(result.woo_order_id != null ? { woo_order_id: result.woo_order_id } : {}),
        ...(result.status ? { status: result.status } : {}),
        ...(result.order_key ? { order_key: result.order_key } : {}),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          ...(requestId ? { "x-request-id": requestId } : {}),
        },
      }
    );
  } catch (e) {
    console.error("[checkout][last-status]", e);
    return NextResponse.json(
      { hasRecentOrder: false },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}
