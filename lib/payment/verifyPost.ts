import { NextRequest, NextResponse } from "next/server";
import { verifyEwayAndMarkWooPaid } from "@/lib/services/paymentService";
import { checkRateLimitSafe } from "@/lib/rate-limit";
import { assertVerifyPaymentAuthorized } from "@/lib/verify-payment-auth";
import { getVerifyPaymentClientIp } from "@/lib/request-ip";

export async function handleVerifyPaymentPost(req: NextRequest): Promise<NextResponse> {
  try {
    const ip = getVerifyPaymentClientIp(req);

    const burst = await checkRateLimitSafe(`verify-payment:burst:${ip}`, {
      windowMs: 5000,
      maxRequests: 8,
    });
    if (!burst.ok) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Please wait a few seconds." },
        {
          status: 429,
          headers: { "Retry-After": String(burst.resetSeconds) },
        }
      );
    }

    const rl = await checkRateLimitSafe(`verify-payment:${ip}`, {
      windowMs: 15 * 60 * 1000,
      maxRequests: 20,
    });
    if (!rl.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many verification attempts. Try again later.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(rl.resetSeconds) },
        }
      );
    }

    const body = (await req.json()) as {
      AccessCode?: string;
      accessCode?: string;
      orderId?: string | number;
      order_id?: string | number;
      paymentSig?: string;
      vp_sig?: string;
    };

    const accessCode = String(body?.AccessCode ?? body?.accessCode ?? "").trim();
    const orderRefRaw = body?.orderId ?? body?.order_id ?? "";
    const orderRef = orderRefRaw === "" || orderRefRaw == null ? null : String(orderRefRaw).trim();
    const paymentSig = String(body?.paymentSig ?? body?.vp_sig ?? "").trim() || null;

    if (!accessCode) {
      return NextResponse.json(
        { success: false, error: "AccessCode is required." },
        { status: 400 }
      );
    }

    const auth = await assertVerifyPaymentAuthorized(req, { orderRef, paymentSig });
    if (auth.ok === false) {
      return NextResponse.json(
        { success: false, error: auth.message },
        { status: auth.status }
      );
    }

    const verificationResult = await verifyEwayAndMarkWooPaid({
      accessCode,
      orderRef,
    });

    if (!verificationResult.ok) {
      return NextResponse.json(
        {
          success: false,
          error: verificationResult.error ?? "Verification failed.",
          orderId: null,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: verificationResult.paid,
      paid: verificationResult.paid,
      transactionId: verificationResult.transactionId ?? null,
      orderId: verificationResult.orderPostId ?? orderRef,
      responseCode: verificationResult.responseCode ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to verify payment.";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
