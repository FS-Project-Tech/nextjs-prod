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
async function syncToWordPress(email: string): Promise<boolean> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) return false;
  try {
    const res = await fetch(`${wpBase}/wp-json/empower/v1/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return res.ok;
  } catch {
    return false;
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

    const { success, alreadyJoined } = await addEmpowerEmail(email);

    await syncToWordPress(email);

    if (!success) {
      return NextResponse.json({ error: "Failed to join campaign" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      alreadyJoined,
      couponCode: "EMPOWER",
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
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

    const joined = await hasJoinedEmpower(email);

    return NextResponse.json({ joined });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Empower] Check error:", error);
    }
    return NextResponse.json({ error: "Failed to check status" }, { status: 500 });
  }
}
