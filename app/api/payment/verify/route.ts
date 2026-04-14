import { NextRequest } from "next/server";
import { handleVerifyPaymentPost } from "@/lib/payment/verifyPost";
import { createApiErrorResponse, getRequestId, withRequestId } from "@/lib/utils/api-safe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  try {
    const res = await handleVerifyPaymentPost(req);
    return withRequestId(res, requestId);
  } catch (error) {
    return createApiErrorResponse(error, {
      requestId,
      defaultMessage: "Payment verification failed",
      logPrefix: "api/payment/verify",
    });
  }
}
