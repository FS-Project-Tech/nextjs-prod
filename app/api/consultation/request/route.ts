import { NextRequest, NextResponse } from "next/server";
import { getWpBaseUrl } from "@/lib/auth";
import { rateLimit } from '@/lib/api-security';
import { sanitizeString, sanitizeEmail } from '@/lib/sanitize';
import { secureResponse } from '@/lib/security-headers';

/**
 * POST /api/consultation/request
 * Send consultation request email to info@joyamedicalsupplies.com.au
 * and thank you email to customer
 * Protected with rate limiting to prevent abuse
 */
export async function POST(req: NextRequest) {
  // Apply rate limiting
  const rateLimitCheck = await rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10, // 10 consultation requests per hour per IP
  })(req);

  if (rateLimitCheck) {
    return rateLimitCheck;
  }

  try {
    const body = await req.json();
    let { email, name, productName, comment } = body;

    // Sanitize inputs
    email = sanitizeEmail(email);
    name = typeof name === 'string' ? sanitizeString(name) : '';
    productName = typeof productName === 'string' ? sanitizeString(productName) : '';
    comment = typeof comment === 'string' ? sanitizeString(comment) : '';

    // Validation
    if (!email || !comment || !productName) {
      return secureResponse(
        { error: "Email, product name, and comment are required" },
        { status: 400 }
      );
    }

    const wpBase = getWpBaseUrl();
    if (!wpBase) {
      return secureResponse(
        { error: "WordPress URL not configured" },
        { status: 500 }
      );
    }

    // Email to info@joyamedicalsupplies.com.au
    const adminEmailSubject = `Consultation Request - ${productName}`;
    const adminEmailBody = `
New Consultation Request

Product: ${productName}
Customer Name: ${name || "Not provided"}
Customer Email: ${email}

Comment:
${comment}

---
This is an automated message from ${process.env.NEXT_PUBLIC_SITE_NAME || "Joya Medical Supplies"}.
    `.trim();

    // Thank you email to customer
    const customerEmailSubject = `Thank you for your consultation request - ${productName}`;
    const customerEmailBody = `
Hello ${name || "Customer"},

Thank you for your consultation request regarding "${productName}".

We have received your request and one of our team members will contact you shortly to assist you.

Your Request Details:
- Product: ${productName}
- Comment: ${comment}

If you have any urgent questions, please don't hesitate to contact us directly.

Best regards,
${process.env.NEXT_PUBLIC_SITE_NAME || "Joya Medical Supplies"}
    `.trim();

    // Try to send emails via WordPress
    try {
      // Send to admin
      const adminResponse = await fetch(`${wpBase}/wp-json/wp/v2/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: "info@joyamedicalsupplies.com.au",
          subject: adminEmailSubject,
          message: adminEmailBody,
          headers: {
            "Content-Type": "text/plain; charset=UTF-8",
          },
        }),
        cache: "no-store",
      });

      // Send to customer
      const customerResponse = await fetch(`${wpBase}/wp-json/wp/v2/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: email,
          subject: customerEmailSubject,
          message: customerEmailBody,
          headers: {
            "Content-Type": "text/plain; charset=UTF-8",
          },
        }),
        cache: "no-store",
      });

      if (adminResponse.ok && customerResponse.ok) {
        return secureResponse({
          success: true,
          message: "Consultation request submitted successfully",
        });
      }
    } catch (wpError) {
      if (process.env.NODE_ENV === 'development') {
        console.log("WordPress email endpoint not available, using alternative method");
      }
    }

    // Fallback: Log emails (for development/testing only)
    // In production, integrate with your email service (SendGrid, Mailgun, etc.)
    if (process.env.NODE_ENV === 'development') {
      console.log("Consultation Request Email (Admin):", {
        to: "info@joyamedicalsupplies.com.au",
        subject: adminEmailSubject,
        body: adminEmailBody,
      });

      console.log("Consultation Request Email (Customer):", {
        to: email,
        subject: customerEmailSubject,
        body: customerEmailBody,
      });
    }

    // If you have an email webhook or service, call it here
    const emailWebhook = process.env.CONSULTATION_EMAIL_WEBHOOK_URL;
    if (emailWebhook) {
      try {
        await fetch(emailWebhook, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "consultation_request",
            adminEmail: {
              to: "info@joyamedicalsupplies.com.au",
              subject: adminEmailSubject,
              body: adminEmailBody,
            },
            customerEmail: {
              to: email,
              subject: customerEmailSubject,
              body: customerEmailBody,
            },
          }),
        });
      } catch (webhookError) {
        if (process.env.NODE_ENV === 'development') {
          console.error("Email webhook error:", webhookError);
        }
      }
    }

    return secureResponse({
      success: true,
      message: "Consultation request submitted successfully",
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error("Consultation request error:", error);
    }
    return secureResponse(
      { error: "Failed to submit consultation request. Please try again later." },
      { status: 500 }
    );
  }
}


