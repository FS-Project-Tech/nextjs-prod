import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUser, setAuthToken, validateCSRFToken } from "@/lib/auth-server";
import { validateRedirect, ALLOWED_REDIRECT_PATHS } from "@/lib/redirectUtils";
import { rateLimit } from "@/lib/api-security";
import { sanitizeString } from "@/lib/sanitize";
import { parseJsonBody } from "@/lib/api-validation";
import { getRequestId, isUpstreamTransientError, withRequestId } from "@/lib/utils/api-safe";

const loginBodySchema = z.object({
  username: z.string().min(1).max(255),
  password: z.string().min(8).max(128),
  csrfToken: z.string().optional(),
  redirectTo: z.string().max(500).optional(),
  next: z.string().max(500).optional(),
});

/**
 * POST /api/auth/login
 * Secure login endpoint with rate limiting, CSRF protection, and input sanitization
 */
export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  // Apply rate limiting (stricter for login endpoint)
  // Use IP-based rate limiting (username-based would require parsing body first)
  const rateLimitConfig =
    process.env.NODE_ENV === "production"
      ? { windowMs: 15 * 60 * 1000, maxRequests: 5 }
      : { windowMs: 5 * 60 * 1000, maxRequests: 20 }; // relaxed for local/dev

  const rateLimitCheck = await rateLimit({
    ...rateLimitConfig,
    routeKey: "auth-login",
  })(request);

  if (rateLimitCheck) {
    return withRequestId(rateLimitCheck, requestId);
  }

  try {
    const parsed = await parseJsonBody(request, loginBodySchema);
    if (parsed.ok === false) return parsed.response;

    let username = sanitizeString(parsed.data.username.trim());
    const password = parsed.data.password;
    const { csrfToken } = parsed.data;

    if (username.length < 3) {
      return withRequestId(
        NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_USERNAME", message: "Invalid username format." },
        },
        {
          status: 400,
          headers: {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
          },
        }
      ),
      requestId
      );
    }

    // Validate CSRF token if provided (optional for initial login, required for subsequent requests)
    if (csrfToken) {
      const isValidCSRF = await validateCSRFToken(csrfToken);
      if (!isValidCSRF) {
        return withRequestId(
          NextResponse.json(
          {
            success: false,
            error: { code: "INVALID_CSRF", message: "Invalid CSRF token." },
          },
          { status: 403 }
          ),
          requestId
        );
      }
    }

    // Authenticate user with WordPress
    const session = await authenticateUser(username, password);

    // Set secure session cookie with CSRF token
    const csrf = await setAuthToken(session.token);

    // Create WooCommerce session for cart persistence after login
    try {
      const { syncWCSessionAfterLogin } = await import("@/lib/woocommerce-session");
      const customerId = session.customer?.id || session.user?.id;
      await syncWCSessionAfterLogin(customerId);
    } catch (wcSessionError) {
      // Don't fail login if WC session creation fails
      // Session will be created automatically on first cart operation
      if (process.env.NODE_ENV === "development") {
        console.warn("Failed to create WooCommerce session:", wcSessionError);
      }
    }

    // Validate and sanitize redirect URL from request
    const requestedRedirect = parsed.data.redirectTo || parsed.data.next;
    const safeRedirect = validateRedirect(requestedRedirect, ALLOWED_REDIRECT_PATHS, "/dashboard");

    // Return user data and CSRF token for client-side use
    return withRequestId(
      NextResponse.json(
      {
        success: true,
        redirectTo: safeRedirect,
        user: session.user,
        customer: session.customer ?? null,
        csrfToken: csrf, // Return CSRF token for client-side validation
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "DENY",
          "X-XSS-Protection": "1; mode=block",
          "Referrer-Policy": "strict-origin-when-cross-origin",
        },
      }
    ),
    requestId
    );
  } catch (error) {
    console.error("[auth/login] error", { requestId, error });
    let message = error instanceof Error ? error.message : "Unable to sign in right now.";
    if (typeof message !== "string") message = "An error occurred";
    if (
      message.includes("No route was found matching the URL and request method") ||
      message.includes("rest_no_route")
    ) {
      message =
        "Login service is not available. Please ensure the WordPress JWT Authentication plugin is installed and the REST API is enabled.";
    }
    if (
      message.toLowerCase().includes("jwt is not configured properly") ||
      message.toLowerCase().includes("jwt_auth_secret_key")
    ) {
      message =
        "Login is not configured on the server. Please contact the site admin to set up JWT (JWT_AUTH_SECRET_KEY in wp-config.php).";
    }
    const status = isUpstreamTransientError(error)
      ? 503
      : (
      message.toLowerCase().includes("credential") || message.toLowerCase().includes("invalid")
        ? 401
        : 500
      );

    return withRequestId(
      NextResponse.json(
      {
        success: false,
        error: { code: "LOGIN_FAILED", message },
        requestId,
      },
      {
        status,
        headers: {
          ...(status === 503 ? { "Retry-After": "5", "Cache-Control": "no-store" } : {}),
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "DENY",
        },
      }
    ),
    requestId
    );
  }
}

/**
 * GET /api/auth/refresh
 * Deprecated in favor of short-lived tokens.
 */
export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "NOT_SUPPORTED",
        message: "Token refresh is not supported. Please sign in again.",
      },
    },
    { status: 410 }
  );
}
