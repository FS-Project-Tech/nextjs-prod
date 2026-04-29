import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/api-security";
import { sanitizeEmail } from "@/lib/sanitize";
import { addEmpowerEmail, hasJoinedEmpower } from "@/lib/empower-storage";
import { getWpBaseUrl } from "@/lib/wp-utils";

/**
 * POST /api/empower/join
 * Add email to Empower campaign. Stores in backend (data/empower-emails.json).
 * Returns coupon code "EMPOWER" on success.
 */
async function postJoinToWordPress(email: string): Promise<{
  ok: boolean;
  alreadyJoined: boolean;
}> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) return { ok: false, alreadyJoined: false };
  try {
    const res = await fetch(`${wpBase}/wp-json/empower/v1/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, alreadyJoined: false };

    let alreadyJoined = false;
    try {
      const payload = (await res.json()) as { alreadyJoined?: unknown; joined?: unknown };
      alreadyJoined = Boolean(payload?.alreadyJoined ?? payload?.joined);
    } catch {
      // Some WP handlers return empty/primitive payloads; treat as success anyway.
    }
    return { ok: true, alreadyJoined };
  } catch {
    return { ok: false, alreadyJoined: false };
  }
}

async function checkJoinedOnWordPress(email: string): Promise<{ ok: boolean; joined: boolean }> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) return { ok: false, joined: false };
  try {
    const url = new URL(`${wpBase}/wp-json/empower/v1/join`);
    url.searchParams.set("email", email);
    const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
    if (!res.ok) return { ok: false, joined: false };
    const payload = (await res.json()) as { joined?: unknown; alreadyJoined?: unknown };
    return { ok: true, joined: Boolean(payload?.joined ?? payload?.alreadyJoined) };
  } catch {
    return { ok: false, joined: false };
  }
}

export async function POST(req: NextRequest) {
  const rateLimitCheck = await rateLimit({
    windowMs: 60 * 60 * 1000,
    maxRequests: 20,
  })(req);

  if (rateLimitCheck) return rateLimitCheck;

  try {
    const body = await req.json();
    const email = sanitizeEmail(body?.email);

    if (!email) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const wpResult = await postJoinToWordPress(email);
    if (wpResult.ok) {
      return NextResponse.json({
        success: true,
        alreadyJoined: wpResult.alreadyJoined,
        couponCode: "EMPOWER",
      });
    }

    // Production-safe path: avoid local filesystem persistence in serverless.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Empower service is temporarily unavailable. Please try again." },
        { status: 502 }
      );
    }

    // Dev fallback only.
    const local = await addEmpowerEmail(email);
    if (!local.success) {
      return NextResponse.json({ error: "Failed to join campaign" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      alreadyJoined: local.alreadyJoined,
      couponCode: "EMPOWER",
    });
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      console.error("[Empower] Join error:", error);
    }
    return NextResponse.json(
      { error: "Failed to join campaign. Please try again." },
      { status: 500 }
    );
  }
}

/**
 * GET /api/empower/join?email=xxx
 * Check if email has joined the Empower campaign.
 */
export async function GET(req: NextRequest) {
  const rateLimitCheck = await rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 30,
  })(req);

  if (rateLimitCheck) return rateLimitCheck;

  try {
    const { searchParams } = new URL(req.url);
    const email = sanitizeEmail(searchParams.get("email") || "");

    if (!email) {
      return NextResponse.json({ error: "Email query parameter required" }, { status: 400 });
    }

    const wpResult = await checkJoinedOnWordPress(email);
    if (wpResult.ok) {
      return NextResponse.json({ joined: wpResult.joined });
    }

    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ joined: false });
    }

    const joined = await hasJoinedEmpower(email);

    return NextResponse.json({ joined });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Empower] Check error:", error);
    }
    return NextResponse.json({ error: "Failed to check status" }, { status: 500 });
  }
}
