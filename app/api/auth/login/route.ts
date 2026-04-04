import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, setAuthToken, validateCSRFToken } from "@/lib/auth-server";
import { validateRedirect, ALLOWED_REDIRECT_PATHS } from "@/lib/redirectUtils";
import { rateLimit } from "@/lib/api-security";
import { sanitizeString, sanitizeEmail } from "@/lib/sanitize";

/**
 * POST /api/auth/login
 * Secure login endpoint with rate limiting, CSRF protection, and input sanitization
 */
export async function POST(request: NextRequest) {
  // Apply rate limiting (stricter for login endpoint)
  // Use IP-based rate limiting (username-based would require parsing body first)
  const rateLimitConfig =
    process.env.NODE_ENV === "production"
      ? { windowMs: 15 * 60 * 1000, maxRequests: 5 }
      : { windowMs: 5 * 60 * 1000, maxRequests: 20 }; // relaxed for local/dev

  const rateLimitCheck = await rateLimit(rateLimitConfig)(request);

  if (rateLimitCheck) {
    return rateLimitCheck;
  }

  try {
    const body = await request.json();
    let { username, password } = body;
    const { csrfToken } = body;

    // Sanitize input
    username = typeof username === "string" ? sanitizeString(username.trim()) : "";
    password = typeof password === "string" ? password : ""; // Don't sanitize password (it's hashed)

    // Validate required fields
    if (!username || !password) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_BODY", message: "Username and password are required." },
        },
        {
          status: 400,
          headers: {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
          },
        }
      );
    }

    // Additional validation: username length
    if (username.length < 3 || username.length > 255) {
      return NextResponse.json(
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
      );
    }

    // Password length validation
    if (password.length < 8 || password.length > 128) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_PASSWORD",
            message: "Password must be between 8 and 128 characters.",
          },
        },
        {
          status: 400,
          headers: {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
          },
        }
      );
    }

    // Validate CSRF token if provided (optional for initial login, required for subsequent requests)
    if (csrfToken) {
      const isValidCSRF = await validateCSRFToken(csrfToken);
      if (!isValidCSRF) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "INVALID_CSRF", message: "Invalid CSRF token." },
          },
          { status: 403 }
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
    const requestedRedirect = body.redirectTo || body.next;
    const safeRedirect = validateRedirect(requestedRedirect, ALLOWED_REDIRECT_PATHS, "/dashboard");

    // Return user data and CSRF token for client-side use
    return NextResponse.json(
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
    );
  } catch (error) {
    console.error("[auth/login] error", error);
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
    const status =
      message.toLowerCase().includes("credential") || message.toLowerCase().includes("invalid")
        ? 401
        : 500;

    return NextResponse.json(
      {
        success: false,
        error: { code: "LOGIN_FAILED", message },
      },
      {
        status,
        headers: {
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "DENY",
        },
      }
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
