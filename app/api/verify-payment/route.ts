import { NextRequest, NextResponse } from "next/server";
import { verifyEwayAndMarkWooPaid } from "@/lib/services/paymentService";

export const dynamic = "force-dynamic";

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
    const orderRefRaw = body?.orderId ?? body?.order_id ?? "";
    const orderRef =
      orderRefRaw === "" || orderRefRaw == null
        ? null
        : String(orderRefRaw).trim();

    console.log("[verify-payment] request", {
      hasAccessCode: Boolean(accessCode),
      hasOrderRef: Boolean(orderRef),
    });

    if (!accessCode) {
      return NextResponse.json(
        { success: false, error: "AccessCode is required." },
        { status: 400 }
      );
    }

    const r = await verifyEwayAndMarkWooPaid({
      accessCode,
      orderRef,
    });

    if (!r.ok) {
      return NextResponse.json(
        {
          success: false,
          error: r.error ?? "Verification failed.",
          orderId: null,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: r.paid,
      paid: r.paid,
      transactionId: r.transactionId ?? null,
      orderId: r.orderPostId ?? orderRef,
      responseCode: r.responseCode ?? null,
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
