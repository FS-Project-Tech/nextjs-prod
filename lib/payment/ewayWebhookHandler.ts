import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { processEwayWebhookPayload } from "@/lib/services/paymentService";
import { timingSafeEqualHex } from "@/lib/timing-safe";

/** HMAC-SHA256(rawBody, secret), compared to x-eway-signature (hex, optional sha256= prefix). */
function isValidEwaySignature(
  rawBody: string,
  secret: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader?.trim()) return false;
  let provided = signatureHeader.trim();
  if (provided.toLowerCase().startsWith("sha256=")) {
    provided = provided.slice(7).trim();
  }
  const expectedHex = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  if (timingSafeEqualHex(provided, expectedHex)) return true;
  const expectedB64 = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  try {
    const a = Buffer.from(provided, "utf8");
    const b = Buffer.from(expectedB64, "utf8");
    if (a.length !== b.length || a.length === 0) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function parseBodyRecordFromRaw(raw: string, contentType: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  const ct = contentType.toLowerCase();
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

export function ewayWebhookGet(): NextResponse {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    data: {
      message: "eWAY webhook endpoint — POST JSON or form with AccessCode (recommended).",
    },
  });
}

export async function ewayWebhookPost(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.EWAY_WEBHOOK_SECRET?.trim();
  const rawBody = await req.text();

  const sig =
    req.headers.get("x-eway-signature")?.trim() ||
    req.headers.get("X-Eway-Signature")?.trim() ||
    null;

  if (process.env.NODE_ENV === "production") {
    if (!secret) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!isValidEwaySignature(rawBody, secret, sig)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
  } else if (secret) {
    if (!isValidEwaySignature(rawBody, secret, sig)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const ct = req.headers.get("content-type") || "";
  let body: Record<string, unknown> = {};
  try {
    body = parseBodyRecordFromRaw(rawBody, ct);
  } catch (e) {
    console.error("[eway webhook] body parse failed", e);
    return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
  }

  const result = await processEwayWebhookPayload(body);

  if (!result.handled) {
    return NextResponse.json({ success: false, error: result.message });
  }
  return NextResponse.json({
    success: true,
    data: { message: result.message },
  });
}
