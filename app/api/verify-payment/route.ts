import { NextRequest, NextResponse } from "next/server";
import { verifyEwayAccessCode } from "@/lib/eway-responsive-shared";
import wcAPI from "@/lib/woocommerce";

export const dynamic = "force-dynamic";

async function resolveOrderPostId(orderRef: string): Promise<number | null> {
  // 1) Try direct order fetch first (post ID path)
  try {
    const { data } = await wcAPI.get(`/orders/${orderRef}`);
    const id = Number((data as { id?: unknown })?.id);
    if (Number.isFinite(id) && id > 0) return id;
  } catch (err: any) {
    if (Number(err?.response?.status || 0) !== 404) throw err;
  }

  // 2) Fallback by order number/search
  const { data: orders } = await wcAPI.get("/orders", {
    params: { search: orderRef, per_page: 20 },
  });
  const match = Array.isArray(orders)
    ? orders.find(
        (o: { id?: number; number?: string; order_number?: string }) =>
          String(o.number ?? o.order_number ?? o.id) === orderRef
      )
    : null;
  const id = Number(match?.id || 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      AccessCode?: string;
      accessCode?: string;
      orderId?: string | number;
      order_id?: string | number;
    };

    const accessCode = String(
      body?.AccessCode ?? body?.accessCode ?? ""
    ).trim();
    const orderIdRaw = body?.orderId ?? body?.order_id ?? "";
    const orderId = String(orderIdRaw || "").trim() || undefined;

    if (!accessCode) {
      return NextResponse.json(
        { success: false, error: "AccessCode is required." },
        { status: 400 }
      );
    }

    const verification = await verifyEwayAccessCode(accessCode);
    if (verification.ok === false) {
      return NextResponse.json(
        { success: false, error: verification.error, orderId: orderId ?? null },
        { status: 502 }
      );
    }

    let updatedOrderId: string | number | null = orderId ?? null;
    if (verification.success && orderId) {
      try {
        const postId = await resolveOrderPostId(orderId);
        if (postId) {
          const patch: Record<string, unknown> = {
            status: "processing",
            set_paid: true,
          };
          if (verification.transactionId) {
            patch.transaction_id = verification.transactionId;
          }
          await wcAPI.put(`/orders/${postId}`, patch);
          updatedOrderId = postId;
        }
      } catch (updateErr) {
        console.warn("[verify-payment] order status update failed", updateErr);
      }
    }

    return NextResponse.json({
      success: verification.success,
      transactionId: verification.transactionId ?? null,
      orderId: updatedOrderId,
      responseCode: verification.responseCode ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to verify payment.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    );
  }
}

