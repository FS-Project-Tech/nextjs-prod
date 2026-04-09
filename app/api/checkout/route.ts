import { NextRequest, NextResponse } from "next/server";
import { handleCheckoutPost } from "@/lib/checkout/handleCheckoutPost";
import {
  API_RATE_LIMITS,
  corsResponse,
  validateTrustedBrowserOrigin,
  rateLimit,
} from "@/lib/api-security";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function OPTIONS(req: NextRequest) {
  if (!validateTrustedBrowserOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": req.headers.get("origin") || req.nextUrl.origin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      Vary: "Origin",
    },
  });
}

export async function POST(req: NextRequest) {
  // ✅ 1. Same-origin / trusted-origin validation
  if (!validateTrustedBrowserOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ✅ 2. Rate limiting (protects from spam / bot checkout)
  const limit = await rateLimit(API_RATE_LIMITS.CHECKOUT_WRITE)(req);
  if (limit) return limit;

  // ✅ 3. Business logic (guests allowed; COD/on-account gated inside handleCheckoutPost)
  const res = await handleCheckoutPost(req);

  // ✅ 4. Apply CORS headers
  return corsResponse(req, res);
}