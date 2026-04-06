import { NextRequest } from "next/server";
import { handleCheckoutPost } from "@/lib/checkout/handleCheckoutPost";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  return handleCheckoutPost(req);
}
