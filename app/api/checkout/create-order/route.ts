/**
 * @deprecated Prefer POST `/api/checkout` (same handler). Kept for backward compatibility.
 */
import { NextRequest, NextResponse } from "next/server";
import { handleCheckoutPost } from "@/lib/checkout/handleCheckoutPost";
import {
  API_RATE_LIMITS,
  rateLimit,
  requireAuth,
  validateTrustedBrowserOrigin,
} from "@/lib/api-security";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!validateTrustedBrowserOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limit = await rateLimit(API_RATE_LIMITS.CHECKOUT_WRITE)(req);
  if (limit) return limit;

  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  return handleCheckoutPost(req);
}
