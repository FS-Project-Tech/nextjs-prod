import { NextRequest, NextResponse } from "next/server";
import { processEwayWebhookPayload } from "@/lib/services/paymentService";

export const dynamic = "force-dynamic";

async function parseBodyRecord(req: NextRequest): Promise<Record<string, unknown>> {
  const raw = await req.text();
  if (!raw.trim()) return {};
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw);
    const o: Record<string, unknown> = {};
    params.forEach((v, k) => {
      o[k] = v;
    });
    return o;
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { _unparsed: raw.slice(0, 500) };
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      message: "eWAY webhook endpoint — POST JSON or form with AccessCode (recommended).",
    },
    error: null,
  });
}

export async function POST(req: NextRequest) {
  const secret = process.env.EWAY_WEBHOOK_SECRET?.trim();
  if (secret) {
    const h =
      req.headers.get("x-eway-webhook-secret") ||
      req.headers.get("X-Eway-Webhook-Secret") ||
      "";
    if (h !== secret) {
      return NextResponse.json(
        { success: false, data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }
  }

  let body: Record<string, unknown> = {};
  try {
    body = await parseBodyRecord(req);
  } catch (e) {
    console.error("[eway webhook] body read failed", e);
    return NextResponse.json(
      { success: false, data: null, error: "Invalid body" },
      { status: 400 }
    );
  }

  const result = await processEwayWebhookPayload(body);

  return NextResponse.json({
    success: result.handled,
    data: { message: result.message },
    error: result.handled ? null : result.message,
  });
}
