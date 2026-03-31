import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from '@/lib/api-security';
import { sanitizeEmail } from '@/lib/sanitize';
import { secureResponse } from '@/lib/security-headers';

/**
 * Newsletter Subscription API
 * Handles newsletter subscription requests
 * Protected with rate limiting to prevent abuse
 * 
 * In production, integrate with your email marketing service (Mailchimp, SendGrid, etc.)
 */
export async function POST(req: NextRequest) {
  // Apply rate limiting
  const rateLimitCheck = await rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 5, // 5 subscriptions per hour per IP
  })(req);

  if (rateLimitCheck) {
    return rateLimitCheck;
  }

  try {
    const body = await req.json();
    let { email } = body;

    // Sanitize email
    email = sanitizeEmail(email);

    // Validate email
    if (!email) {
      return secureResponse(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // TODO: Integrate with your email marketing service
    // Example integrations:
    // - Mailchimp API
    // - SendGrid API
    // - ConvertKit API
    // - WordPress plugin API
    
    // For now, just log the subscription (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.log(`Newsletter subscription: ${email}`);
    }

    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    return secureResponse({
      success: true,
      message: "Successfully subscribed to newsletter",
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error("Newsletter subscription error:", error);
    }
    return secureResponse(
      { error: "Failed to subscribe to newsletter. Please try again later." },
      { status: 500 }
    );
  }
}


