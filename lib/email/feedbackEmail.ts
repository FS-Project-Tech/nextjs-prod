//D:\stage-joya\nextjs-prod-main\lib\email\feedbackEmail.ts

/**
 * Feedback / customer-experience survey delivery.
 * Recipient defaults to jr.web@joyamedicalsupplies.com.au; override with FEEDBACK_FORM_EMAIL.
 *
 * Send order: Brevo (if BREVO_API_KEY) → SMTP via nodemailer (if SMTP_* set) → WordPress send-email.
 */

import { getWpBaseUrl } from "@/lib/auth";
import { sendPlainEmailViaBrevo } from "@/lib/email/sendViaBrevo";
import { isSmtpConfigured, sendPlainEmailViaSmtp } from "@/lib/email/sendViaSmtp";

export const DEFAULT_FEEDBACK_RECIPIENT = "web@joyamedicalsupplies.com.au";

export function getFeedbackRecipientEmail(): string {
  return (process.env.FEEDBACK_FORM_EMAIL?.trim() || DEFAULT_FEEDBACK_RECIPIENT).trim();
}

export type SendFeedbackEmailInput = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  senderName?: string;
};

/**
 * Sends feedback mail using the same providers as other site forms (Brevo / SMTP / WP).
 */
export async function sendFeedbackEmail(
  opts: SendFeedbackEmailInput
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const { to, subject, text, replyTo, senderName } = opts;
  let lastError = "";

  if (process.env.BREVO_API_KEY?.trim()) {
    const br = await sendPlainEmailViaBrevo({
      to,
      subject,
      text,
      replyTo,
      senderName,
    });
    if (br.ok === true) {
      return { ok: true };
    }
    lastError = `Brevo: ${br.detail}`;
    console.warn("[feedbackEmail]", lastError);
  }

  if (isSmtpConfigured()) {
    const sm = await sendPlainEmailViaSmtp({
      to,
      subject,
      text,
      replyTo,
      senderName,
    });
    if (sm.ok === true) {
      return { ok: true };
    }
    lastError = lastError ? `${lastError}; SMTP: ${sm.detail}` : `SMTP: ${sm.detail}`;
    console.warn("[feedbackEmail]", sm.detail);
  }

  const wpBase = getWpBaseUrl();
  if (wpBase) {
    try {
      const wpCtrl = new AbortController();
      const wpT = setTimeout(() => wpCtrl.abort(), 20_000);
      let res: Response;
      try {
        res = await fetch(`${wpBase}/wp-json/wp/v2/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to,
            subject,
            message: text,
            headers: { "Content-Type": "text/plain; charset=UTF-8" },
          }),
          cache: "no-store",
          signal: wpCtrl.signal,
        });
      } finally {
        clearTimeout(wpT);
      }
      if (res.ok) {
        return { ok: true };
      }
      const hint = `WordPress send-email HTTP ${res.status}`;
      lastError = lastError ? `${lastError}; ${hint}` : hint;
      console.warn("[feedbackEmail]", hint);
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.name === "AbortError"
            ? "WordPress send-email timed out"
            : e.message
          : "WP fetch failed";
      lastError = lastError ? `${lastError}; ${msg}` : msg;
      console.warn("[feedbackEmail] WP", msg);
    }
  }

  return { ok: false, detail: lastError || "No email provider available." };
}

export function isFeedbackEmailConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY?.trim() || isSmtpConfigured() || getWpBaseUrl());
}
