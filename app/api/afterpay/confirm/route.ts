import { NextRequest, NextResponse } from "next/server";
import {
  API_RATE_LIMITS,
  corsResponse,
  rateLimitMemory,
  validateTrustedBrowserOrigin,
} from "@/lib/api-security";
import { createApiErrorResponse, getRequestId, withRequestId } from "@/lib/utils/api-safe";
import { readJsonBody } from "@/utils/api-parse";
import { confirmAfterpayOrder } from "@/lib/afterpay/confirmAfterpayOrder";
import { afterpayConfigured } from "@/lib/afterpay/env";

export const dynamic = "force-dynamic";

export async function OPTIONS(req: NextRequest) {
  const requestId = getRequestId(req);
  if (!validateTrustedBrowserOrigin(req)) {
    return withRequestId(NextResponse.json({ error: "Forbidden" }, { status: 403 }), requestId);
  }
  return withRequestId(
    new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": req.headers.get("origin") || req.nextUrl.origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        Vary: "Origin",
      },
    }),
    requestId,
  );
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  if (!validateTrustedBrowserOrigin(req)) {
    return withRequestId(NextResponse.json({ error: "Forbidden" }, { status: 403 }), requestId);
  }

  const limit = await rateLimitMemory(API_RATE_LIMITS.CHECKOUT_WRITE)(req);
  if (limit) return withRequestId(limit, requestId);

  if (!afterpayConfigured()) {
    return withRequestId(
      NextResponse.json({ success: false, error: "Afterpay is not configured." }, { status: 503 }),
      requestId,
    );
  }

  let raw: unknown;
  try {
    raw = await readJsonBody(req);
  } catch {
    return withRequestId(
      NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 }),
      requestId,
    );
  }

  const token =
    typeof raw === "object" && raw !== null && typeof (raw as { token?: unknown }).token === "string"
      ? ((raw as { token: string }).token).trim()
      : "";

  try {
    const result = await confirmAfterpayOrder({ req, token });
    if (result.success === false) {
      return withRequestId(
        corsResponse(
          req,
          NextResponse.json({ success: false, error: result.error }, { status: result.status ?? 400 }),
        ),
        requestId,
      );
    }

    return withRequestId(corsResponse(req, NextResponse.json(result)), requestId);
  } catch (error: unknown) {
    return withRequestId(
      corsResponse(
        req,
        createApiErrorResponse(error, {
          requestId,
          defaultMessage: "Afterpay confirmation failed.",
          logPrefix: "api/afterpay/confirm",
        }),
      ),
      requestId,
    );
  }
}
