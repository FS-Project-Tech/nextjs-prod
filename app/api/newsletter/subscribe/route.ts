import { NextRequest } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/api-security";
import { sanitizeEmail } from "@/lib/sanitize";
import { secureResponse } from "@/lib/security-headers";
import { parseJsonBody } from "@/lib/api-validation";
import { createApiErrorResponse, getRequestId, withRequestId } from "@/lib/utils/api-safe";

const newsletterSchema = z.object({
  email: z.string().trim().email().max(254),
});

/**
 * Newsletter subscription — Zod-validated body; IP rate limit (1h window) in addition to middleware.
 */
export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const rateLimitCheck = await rateLimit({
    windowMs: 60 * 60 * 1000,
    maxRequests: 5,
    routeKey: "newsletter-subscribe",
  })(req);

  if (rateLimitCheck) return withRequestId(rateLimitCheck, requestId);

  try {
    const parsed = await parseJsonBody(req, newsletterSchema);
    if (parsed.ok === false) return parsed.response;

    const email = sanitizeEmail(parsed.data.email);

    if (!email) {
      return withRequestId(
        secureResponse({ error: "Email is required", code: "VALIDATION_ERROR" }, { status: 400 }),
        requestId
      );
    }

    if (process.env.NODE_ENV === "development") {
      console.log(`Newsletter subscription: ${email}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    return withRequestId(
      secureResponse({
        success: true,
        message: "Successfully subscribed to newsletter",
      }),
      requestId
    );
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Newsletter subscription error:", { requestId, error });
    }
    return createApiErrorResponse(error, {
      requestId,
      defaultMessage: "Failed to subscribe to newsletter. Please try again later.",
      fallbackBody: { code: "INTERNAL_ERROR" },
      logPrefix: "api/newsletter/subscribe",
    });
  }
}
