import { NextRequest } from "next/server";
import { getWpBaseUrl } from "@/lib/auth";
import { rateLimit } from "@/lib/api-security";
import { sanitizeString, sanitizeEmail } from "@/lib/sanitize";
import { secureResponse } from "@/lib/security-headers";
import { getSiteContact } from "@/lib/site-contact";
import { sendPlainEmailViaBrevo } from "@/lib/email/sendViaBrevo";
 
export const dynamic = "force-dynamic";
 
/**
 * POST /api/contact
 * Sends to CONTACT_FORM_ADMIN_EMAIL / NEXT_PUBLIC_CONTACT_EMAIL / site default (info@…).
 *
 * Delivery order:
 * 1. Brevo transactional API if BREVO_API_KEY is set (recommended for headless).
 * 2. WordPress /wp-json/wp/v2/send-email if available.
 *
 * Brevo: verify the sender in Brevo (Senders & IP). Optional CONTACT_FORM_BREVO_SENDER_EMAIL;
 * if omitted, the "from" address defaults to the same as the admin inbox (must be verified).
 */
export async function POST(req: NextRequest) {
  const rateLimitCheck = await rateLimit({
    windowMs: 60 * 60 * 1000,
    maxRequests: 8,
  })(req);
  if (rateLimitCheck) return rateLimitCheck;
 
  try {
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return secureResponse({ error: "Expected JSON body." }, { status: 400 });
    }
    const firstName = sanitizeString(String(body.firstName ?? ""));
    const lastName = sanitizeString(String(body.lastName ?? ""));
    const phone = sanitizeString(String(body.phone ?? ""));
    const email = sanitizeEmail(String(body.email ?? ""));
    const topic = sanitizeString(String(body.topic ?? ""));
    const message = sanitizeString(String(body.message ?? ""));
 
    if (!firstName || !lastName || !email || !message) {
      return secureResponse(
        { error: "First name, last name, email, and message are required." },
        { status: 400 }
      );
    }
 
    if (!topic) {
      return secureResponse({ error: "Please choose a topic." }, { status: 400 });
    }
 
    const adminTo =
      process.env.CONTACT_FORM_ADMIN_EMAIL?.trim() ||
      process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ||
      getSiteContact().email;
 
    if (!adminTo) {
      return secureResponse({ error: "Contact form is not configured." }, { status: 503 });
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
      return secureResponse({ success: true });
    }
 
    if (!process.env.BREVO_API_KEY?.trim() && !wpBase) {
      return secureResponse(
        {
          error:
            "Email is not configured. Add BREVO_API_KEY or a WordPress URL with send-email support.",
        },
        { status: 503 }
      );
    }
 
    return secureResponse(
      {
        error: "Could not send your message. Try again later or reach us by phone or email.",
        ...(process.env.NODE_ENV === "development" && lastError
          ? { _debug: lastError }
          : {}),
      },
      { status: 502 }
    );
  } catch (e) {
    console.error("[contact] unhandled", e);
    return secureResponse(
      {
        error: "Something went wrong. Please try again.",
        ...(process.env.NODE_ENV === "development" && e instanceof Error
          ? { _debug: e.message }
          : {}),
      },
      { status: 500 }
    );
  }
}