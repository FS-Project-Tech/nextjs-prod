import { NextRequest } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/api-security";
import { sanitizeEmail } from "@/lib/sanitize";
import { secureResponse } from "@/lib/security-headers";
import { parseJsonBody } from "@/lib/api-validation";

const newsletterSchema = z.object({
  email: z.string().trim().email().max(254),
});

/**
 * Newsletter subscription — Zod-validated body; IP rate limit (1h window) in addition to middleware.
 */
export async function POST(req: NextRequest) {
  const rateLimitCheck = await rateLimit({
    windowMs: 60 * 60 * 1000,
    maxRequests: 5,
    routeKey: "newsletter-subscribe",
  })(req);

  if (rateLimitCheck) {
    return rateLimitCheck;
  }

  try {
    const parsed = await parseJsonBody(req, newsletterSchema);
    if (parsed.ok === false) return parsed.response;

    const email = sanitizeEmail(parsed.data.email);

    if (!email) {
      return secureResponse(
        { error: "Email is required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (process.env.NODE_ENV === "development") {
      console.log(`Newsletter subscription: ${email}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    return secureResponse({
      success: true,
      message: "Successfully subscribed to newsletter",
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Newsletter subscription error:", error);
    }
    return secureResponse(
      {
        error: "Failed to subscribe to newsletter. Please try again later.",
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
