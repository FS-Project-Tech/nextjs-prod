import { NextRequest } from "next/server";
import { handleVerifyPaymentPost } from "@/lib/payment/verifyPost";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handleVerifyPaymentPost(req);
}
