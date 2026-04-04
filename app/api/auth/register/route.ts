import { NextRequest, NextResponse } from "next/server";
import { createWooUser } from "@/lib/auth-server";
import { rateLimit } from "@/lib/api-security";
import { sanitizeEmail } from "@/lib/sanitize";
import { secureResponse } from "@/lib/security-headers";

export async function POST(request: NextRequest) {
  // Apply rate limiting for registration
  const rateLimitCheck = await rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 3, // 3 registrations per hour per IP
  })(request);

  if (rateLimitCheck) {
    return rateLimitCheck;
  }

  try {
    const body = await request.json();
    let { email, password, firstName, lastName } = body;

    // Sanitize input
    email = typeof email === "string" ? sanitizeEmail(email) : null;
    password = typeof password === "string" ? password : ""; // Don't sanitize password
    firstName = typeof firstName === "string" ? firstName.trim() : "";
    lastName = typeof lastName === "string" ? lastName.trim() : "";

    if (!email || !password) {
      return secureResponse(
        {
          success: false,
          error: { code: "INVALID_BODY", message: "Email and password are required." },
        },
        { status: 400 }
      );
    }

    // Email validation (sanitizeEmail already validates format)
    if (!email) {
      return secureResponse(
        {
          success: false,
          error: { code: "INVALID_EMAIL", message: "Please enter a valid email address." },
        },
        { status: 400 }
      );
    }

    // Enhanced password validation
    if (password.length < 8) {
      return secureResponse(
        {
          success: false,
          error: { code: "WEAK_PASSWORD", message: "Password must be at least 8 characters." },
        },
        { status: 400 }
      );
    }

    if (password.length > 128) {
      return secureResponse(
        {
          success: false,
          error: {
            code: "INVALID_PASSWORD",
            message: "Password must be less than 128 characters.",
          },
        },
        { status: 400 }
      );
    }

    const customer = await createWooUser({
      email,
      password,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
    });

    return secureResponse({
      success: true,
      redirectTo: "/login",
      customer,
      message: "Registration successful. Please sign in.",
    });
  } catch (error) {
    console.error("[auth/register] error", error);
    const message =
      error instanceof Error
        ? error instanceof Error
          ? error.message
          : "An error occurred"
        : "Unable to register right now.";
    const lower = message.toLowerCase();
    const status = lower.includes("configure") || lower.includes("credential") ? 500 : 400;

    return secureResponse(
      {
        success: false,
        error: { code: "REGISTER_FAILED", message },
      },
      { status }
    );
  }
}
