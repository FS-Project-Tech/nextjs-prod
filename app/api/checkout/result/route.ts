import { NextRequest, NextResponse } from "next/server";
import { getStoredIdempotencyResult } from "@/lib/checkout-security";

/**
 * GET /api/checkout/result?key=<idempotency_key>
 * Recover order summary when POST /api/checkout returned 200 but body/headers were stripped
 * (proxy, SW, or cross-origin quirks). Key must match the idempotency_key sent with checkout.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || key.length > 512) {
    return NextResponse.json({ error: "Missing or invalid key" }, { status: 400 });
  }

  const result = getStoredIdempotencyResult(key);
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const redirectUrl = `/checkout/order-review?orderId=${result.number ?? result.order_number ?? result.id ?? ""}`;

  return NextResponse.json(
    {
      success: true,
      order: {
        id: result.id,
        number: result.number,
        order_number: result.order_number,
        order_key: result.order_key,
        status: result.status,
        total: result.total,
      },
      redirect_url: redirectUrl,
      recovered: true,
    },
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
