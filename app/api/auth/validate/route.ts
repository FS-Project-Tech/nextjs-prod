import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getAuthToken, validateToken, getUserData, clearAuthToken } from "@/lib/auth-server";
import { secureResponse } from "@/lib/security-headers";
import { sanitizeUser } from "@/lib/sanitize";

const LOG_VALIDATE = process.env.NODE_ENV === "development";

export async function GET(req: NextRequest) {
  try {
    // ================================
    // 1. NEXTAUTH SESSION
    // ================================
    const nextAuthToken = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });

    const wpToken = (nextAuthToken as any)?.wpToken;

    if (LOG_VALIDATE) {
      console.log("[auth/validate] NextAuth:", !!nextAuthToken, "wpToken:", !!wpToken);
    }

    if (wpToken) {
      try {
        const user = await getUserData(wpToken);

        if (user) {
          return secureResponse(
            { valid: true, user: sanitizeUser(user) },
            { headers: { "Cache-Control": "no-store" } }
          );
        }
      } catch (error: any) {
        if (LOG_VALIDATE) {
          console.log("[auth/validate] NextAuth user fetch failed");
        }
      }

      return secureResponse({ valid: false, error: "User fetch failed" }, { status: 401 });
    }

    // ================================
    // 2. LEGACY COOKIE SESSION
    // ================================
    const token = await getAuthToken();

    if (!token) {
      if (LOG_VALIDATE) {
        console.log("[auth/validate] No session");
      }

      return secureResponse({ valid: false, error: "No session" }, { status: 401 });
    }

    let isValid = false;

    try {
      isValid = await validateToken(token);
    } catch {
      isValid = false;
    }

    if (!isValid) {
      await clearAuthToken();

      return secureResponse({ valid: false, error: "Invalid session" }, { status: 401 });
    }

    try {
      const user = await getUserData(token);

      if (!user) {
        await clearAuthToken();

        return secureResponse({ valid: false, error: "User fetch failed" }, { status: 401 });
      }

      return secureResponse(
        { valid: true, user: sanitizeUser(user) },
        { headers: { "Cache-Control": "no-store" } }
      );
    } catch {
      await clearAuthToken();

      return secureResponse({ valid: false, error: "User fetch failed" }, { status: 401 });
    }
  } catch (error) {
    if (LOG_VALIDATE) {
      console.error("[auth/validate] error:", error);
    }

    return secureResponse({ valid: false, error: "Server error" }, { status: 500 });
  }
}
