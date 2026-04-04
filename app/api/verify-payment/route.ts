import { NextRequest } from "next/server";
import { handleVerifyPaymentPost } from "@/lib/payment/verifyPost";

/** Burst + long-window rate limits and auth live in handleVerifyPaymentPost. */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handleVerifyPaymentPost(req);
}
