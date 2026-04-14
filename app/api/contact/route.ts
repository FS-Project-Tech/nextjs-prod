import { NextRequest } from "next/server";
import { z } from "zod";
import { getWpBaseUrl } from "@/lib/auth";
import { sanitizeString, sanitizeEmail } from "@/lib/sanitize";
import { secureResponse } from "@/lib/security-headers";
import { getSiteContact } from "@/lib/site-contact";
import { sendPlainEmailViaBrevo } from "@/lib/email/sendViaBrevo";
import { parseJsonBody } from "@/lib/api-validation";
import { createApiErrorResponse, getRequestId, isUpstreamTransientError, withRequestId } from "@/lib/utils/api-safe";

export const dynamic = "force-dynamic";

const contactSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional().default(""),
  email: z.string().trim().email().max(254),
  topic: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(10_000),
});

/**
 * POST /api/contact
 * Rate limits: middleware (5/min per IP). Body validated with Zod.
 */
export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  try {
    const parsed = await parseJsonBody(req, contactSchema);
    if (parsed.ok === false) return withRequestId(parsed.response, requestId);

    const raw = parsed.data;
    const firstName = sanitizeString(raw.firstName);
    const lastName = sanitizeString(raw.lastName);
    const phone = sanitizeString(raw.phone);
    const email = sanitizeEmail(raw.email);
    const topic = sanitizeString(raw.topic);
    const message = sanitizeString(raw.message);

    if (!firstName || !lastName || !email || !message) {
      return withRequestId(
        secureResponse(
          {
            error: "First name, last name, email, and message are required.",
            code: "VALIDATION_ERROR",
          },
          { status: 400 }
        ),
        requestId
      );
    }

    if (!topic) {
      return withRequestId(
        secureResponse({ error: "Please choose a topic.", code: "VALIDATION_ERROR" }, { status: 400 }),
        requestId
      );
    }

    const adminTo =
      process.env.CONTACT_FORM_ADMIN_EMAIL?.trim() ||
      process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ||
      getSiteContact().email;

    if (!adminTo) {
      return withRequestId(
        secureResponse({ error: "Contact form is not configured.", code: "NOT_CONFIGURED" }, { status: 503 }),
        requestId
      );
    }

    const siteName = process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "Website";
    const subject = `Contact form: ${topic} — ${firstName} ${lastName}`;
    const plain = `
New message from ${siteName} contact form

Name: ${firstName} ${lastName}
Email: ${email}
Phone: ${phone || "—"}
Topic: ${topic}

Message:
${message}
`.trim();

    let sent = false;
    let lastError = "";

    if (process.env.BREVO_API_KEY?.trim()) {
      const br = await sendPlainEmailViaBrevo({
        to: adminTo,
        subject,
        text: plain,
        replyTo: email,
        senderName: siteName,
      });
      if (br.ok === true) {
        sent = true;
      } else {
        lastError = `Brevo: ${br.detail}`;
        console.warn("[contact]", lastError);
      }
    }

    const wpBase = getWpBaseUrl();
    if (!sent && wpBase) {
      try {
        const wpCtrl = new AbortController();
        const wpT = setTimeout(() => wpCtrl.abort(), 20_000);
        let res: Response;
        try {
          res = await fetch(`${wpBase}/wp-json/wp/v2/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: adminTo,
              subject,
              message: plain,
              headers: { "Content-Type": "text/plain; charset=UTF-8" },
            }),
            cache: "no-store",
            signal: wpCtrl.signal,
          });
        } finally {
          clearTimeout(wpT);
        }
        if (res.ok) {
          sent = true;
        } else {
          const hint = `WordPress send-email HTTP ${res.status}`;
          lastError = lastError ? `${lastError}; ${hint}` : hint;
          console.warn("[contact]", hint);
        }
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.name === "AbortError"
              ? "WordPress send-email timed out"
              : e.message
            : "WP fetch failed";
        lastError = lastError ? `${lastError}; ${msg}` : msg;
        console.warn("[contact] WP", msg);
      }
    }

    if (sent) {
      return withRequestId(secureResponse({ success: true }), requestId);
    }

    if (!process.env.BREVO_API_KEY?.trim() && !wpBase) {
      return withRequestId(
        secureResponse(
          {
            error:
              "Email is not configured. Add BREVO_API_KEY or a WordPress URL with send-email support.",
            code: "NOT_CONFIGURED",
          },
          { status: 503 }
        ),
        requestId
      );
    }

    const upstreamStatus = isUpstreamTransientError(lastError) ? 503 : 502;
    return withRequestId(
      secureResponse(
        {
          error: "Could not send your message. Try again later or reach us by phone or email.",
          code: "UPSTREAM_ERROR",
          ...(process.env.NODE_ENV === "development" && lastError ? { _debug: lastError } : {}),
        },
        {
          status: upstreamStatus,
          headers: upstreamStatus === 503 ? { "Retry-After": "5", "Cache-Control": "no-store" } : undefined,
        }
      ),
      requestId
    );
  } catch (e) {
    return createApiErrorResponse(e, {
      requestId,
      defaultMessage: "Something went wrong. Please try again.",
      fallbackBody: {
        code: "INTERNAL_ERROR",
        ...(process.env.NODE_ENV === "development" && e instanceof Error ? { _debug: e.message } : {}),
      },
      logPrefix: "api/contact",
    });
  }
}
