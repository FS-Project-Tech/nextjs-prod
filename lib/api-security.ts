/**
 * API Security Utilities
 * JWT middleware, rate limiting, and response sanitization
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthToken, validateToken, getUserData } from "./auth-server";
import { getToken } from "next-auth/jwt";

/**
 * Rate Limiting Store
 * In production, use Redis or a database
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Rate Limiting Configuration
 */
interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  identifier?: (req: NextRequest) => string; // Custom identifier function
}

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60, // 60 requests per minute
};

/**
 * Rate Limiting Middleware
 */
export function rateLimit(config: Partial<RateLimitConfig> = {}) {
  const { windowMs, maxRequests, identifier } = { ...DEFAULT_RATE_LIMIT, ...config };

  return async (req: NextRequest): Promise<NextResponse | null> => {
    // Get identifier (IP address or custom)
    const id = identifier
      ? identifier(req)
      : req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        "unknown";

    const now = Date.now();
    const entry = rateLimitStore.get(id);

    // Clean up expired entries
    if (entry && entry.resetTime < now) {
      rateLimitStore.delete(id);
    }

    const currentEntry = rateLimitStore.get(id);

    if (!currentEntry) {
      // First request
      rateLimitStore.set(id, {
        count: 1,
        resetTime: now + windowMs,
      });
      return null; // Allow request
    }

    if (currentEntry.count >= maxRequests) {
      // Rate limit exceeded
      const retryAfter = Math.ceil((currentEntry.resetTime - now) / 1000);
      return NextResponse.json(
        {
          error: "Too many requests",
          message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
          retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": retryAfter.toString(),
            "X-RateLimit-Limit": maxRequests.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": new Date(currentEntry.resetTime).toISOString(),
          },
        }
      );
    }

    // Increment count
    currentEntry.count++;
    return null; // Allow request
  };
}

/**
 * JWT Authentication Middleware
 */
// export async function requireAuth(
//   req: NextRequest
// ): Promise<{ user: any; token: string } | NextResponse> {
//   try {
//     const token = await getAuthToken();

//     if (!token) {
//       return NextResponse.json(
//         { error: 'Authentication required', message: 'Please login to access this resource' },
//         { status: 401 }
//       );
//     }

//     // Validate token
//     const isValid = await validateToken(token);
//     if (!isValid) {
//       return NextResponse.json(
//         { error: 'Invalid token', message: 'Your session has expired. Please login again.' },
//         { status: 401 }
//       );
//     }

//     // Get user data
//     const user = await getUserData(token);
//     if (!user) {
//       return NextResponse.json(
//         { error: 'User not found', message: 'Unable to fetch user data. Please login again.' },
//         { status: 401 }
//       );
//     }

//     return { user, token };
//   } catch (error) {
//     console.error('Auth middleware error:', error);
//     return NextResponse.json(
//       { error: 'Authentication failed', message: 'An error occurred during authentication' },
//       { status: 500 }
//     );
//   }
// }
export async function requireAuth(
  req: NextRequest
): Promise<{ user: any; token: string } | NextResponse> {
  try {
    // Read the NextAuth JWT from the request
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

    const token = wpToken; // this is the WordPress JWT

    // Validate token with WordPress
    const isValid = await validateToken(token);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid token", message: "Your session has expired. Please login again." },
        { status: 401 }
      );
    }

    // Get user data from WordPress
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

/**
 * Optional JWT Authentication Middleware
 * Returns user if authenticated, null if not (doesn't block request)
 */
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

/**
 * Role-based Authorization Middleware
 */
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

    return null; // Allow request
  };
}

/**
 * API Timeout Configuration
 */
export const API_TIMEOUT = {
  DEFAULT: 30000, // 30 seconds
  PRODUCTS: 20000, // 20 seconds
  CATEGORIES: 15000, // 15 seconds
  CHECKOUT: 45000, // 45 seconds (longer for payment processing)
  SEARCH: 10000, // 10 seconds
};

/**
 * Create timeout promise with cleanup
 */
export function createTimeout(timeoutMs: number, operationName?: string): Promise<never> {
  return new Promise((_, reject) => {
    const timeoutId = setTimeout(() => {
      const errorMessage = operationName
        ? `Request timeout after ${timeoutMs}ms for operation: ${operationName}`
        : `Request timeout after ${timeoutMs}ms`;
      reject(new Error(errorMessage));
    }, timeoutMs);

    // Store timeout ID for potential cleanup (though we can't access it after Promise.race)
    // This is mainly for future enhancement with AbortController
  });
}

/**
 * Execute with timeout
 * Note: The original promise will continue running even after timeout.
 * For proper cancellation, use AbortController in the underlying fetch/axios calls.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = API_TIMEOUT.DEFAULT,
  operationName?: string
): Promise<T> {
  const timeoutPromise = createTimeout(timeoutMs, operationName);

  try {
    return await Promise.race([promise, timeoutPromise]);
  } catch (error: unknown) {
    // If it's a timeout error, log additional context
    if (
      error instanceof Error &&
      (error instanceof Error ? error.message : "An error occurred").includes("timeout")
    ) {
      console.warn(`[Timeout] Operation "${operationName || "unknown"}" exceeded ${timeoutMs}ms`);
    }
    throw error;
  }
}
