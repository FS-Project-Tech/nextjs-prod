import { NextRequest } from "next/server";
import { getWpBaseUrl } from "@/lib/auth";
import { rateLimit } from "@/lib/api-security";
import { sanitizeString } from "@/lib/sanitize";
import { secureResponse } from "@/lib/security-headers";

/**
 * POST /api/auth/reset
 * Reset password using token from email link
 */
export async function POST(req: NextRequest) {
  // Apply rate limiting
  const rateLimitCheck = await rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
  })(req);

  if (rateLimitCheck) {
    return rateLimitCheck;
  }

  try {
    const body = await req.json();
    const token = sanitizeString(body?.token || "");
    const password = String(body?.password || "");

    if (!token || !password) {
      return secureResponse({ error: "Token and password are required" }, { status: 400 });
    }

    if (password.length < 8) {
      return secureResponse({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const wpBase = getWpBaseUrl();
    if (!wpBase) {
      return secureResponse({ error: "WordPress URL not configured" }, { status: 500 });
    }

    const response = await fetch(`${wpBase}/wp-json/custom/v1/reset-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token,
        new_password: password,
      }),
      cache: "no-store",
    });

    const responseText = await response.text();
    let payload: any = {};
    try {
      payload = responseText ? JSON.parse(responseText) : {};
    } catch {
      payload = {};
    }

    if (!response.ok) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[auth] reset-password endpoint returned non-OK:",
          response.status,
          responseText ? `Body: ${responseText.slice(0, 200)}` : ""
        );
      }
      return secureResponse(
        { error: payload?.message || "Unable to reset password. Please request a new link." },
        { status: 400 }
      );
    }

    return secureResponse({
      message: payload?.message || "Password reset successful. You can now log in.",
      success: true,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Reset password error:", error);
    }
    return secureResponse({ error: "An error occurred. Please try again." }, { status: 500 });
  }
}
