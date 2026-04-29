/**
 * API Security Utilities
 * Re-exports Edge-safe guards from api-public-guards; JWT auth for route handlers (Node).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthToken, validateToken, getUserData } from "./auth-server";
import { getToken } from "next-auth/jwt";

export {
  API_RATE_LIMITS,
  validateOrigin,
  isTrustedApiOrigin,
  validateTrustedBrowserOrigin,
  corsResponse,
  rateLimit,
  rateLimitMemory,
} from "./api-public-guards";

export async function requireAuth(
  req: NextRequest
): Promise<{ user: any; token: string } | NextResponse> {
  try {
    const nextAuthToken = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });

    const wpToken = (nextAuthToken as any)?.wpToken;

    if (!wpToken) {
      return NextResponse.json(
        { error: "Authentication required", message: "Please login to access this resource" },
        { status: 401 }
      );
    }

    const token = wpToken;

    const isValid = await validateToken(token);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid token", message: "Your session has expired. Please login again." },
        { status: 401 }
      );
    }

    const user = await getUserData(token);
    if (!user) {
      return NextResponse.json(
        { error: "User not found", message: "Unable to fetch user data. Please login again." },
        { status: 401 }
      );
    }

    return { user, token };
  } catch (error) {
    console.error("Auth middleware error:", error);
    return NextResponse.json(
      { error: "Authentication failed", message: "An error occurred during authentication" },
      { status: 500 }
    );
  }
}

export async function optionalAuth(req: NextRequest): Promise<{ user: any; token: string } | null> {
  try {
    const token = await getAuthToken();
    if (!token) return null;

    const isValid = await validateToken(token);
    if (!isValid) return null;

    const user = await getUserData(token);
    return user ? { user, token } : null;
  } catch {
    return null;
  }
}

export function requireRole(allowedRoles: string[]) {
  return async (req: NextRequest, user: any): Promise<NextResponse | null> => {
    if (!user || !user.roles || !Array.isArray(user.roles)) {
      return NextResponse.json(
        { error: "Forbidden", message: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const hasRole = user.roles.some((role: string) => allowedRoles.includes(role));
    if (!hasRole) {
      return NextResponse.json(
        { error: "Forbidden", message: "You do not have permission to access this resource" },
        { status: 403 }
      );
    }

    return null;
  };
}

export const API_TIMEOUT = {
  DEFAULT: 30000,
  PRODUCTS: 20000,
  CATEGORIES: 15000,
  CHECKOUT: 45000,
  SEARCH: 10000,
};

export function createTimeout(timeoutMs: number, operationName?: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      const errorMessage = operationName
        ? `Request timeout after ${timeoutMs}ms for operation: ${operationName}`
        : `Request timeout after ${timeoutMs}ms`;
      reject(new Error(errorMessage));
    }, timeoutMs);
  });
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = API_TIMEOUT.DEFAULT,
  operationName?: string
): Promise<T> {
  const timeoutPromise = createTimeout(timeoutMs, operationName);

  try {
    return await Promise.race([promise, timeoutPromise]);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error instanceof Error ? error.message : "An error occurred").includes("timeout")
    ) {
      console.warn(`[Timeout] Operation "${operationName || "unknown"}" exceeded ${timeoutMs}ms`);
    }
    throw error;
  }
}
