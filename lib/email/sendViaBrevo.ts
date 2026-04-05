//D:\nextjs\lib\email\sendViaBrevo.ts

/**
 * Send a plain-text email via Brevo (Sendinblue) transactional API.
 * https://developers.brevo.com/reference/sendtransacemail
 *
 * Set BREVO_API_KEY. The **sender** must be a verified sender/domain in Brevo.
 *
 * Sender resolution (first match wins):
 * CONTACT_FORM_BREVO_SENDER_EMAIL → BREVO_SENDER_EMAIL → NEXT_PUBLIC_CONTACT_EMAIL →
 * {@link getSiteContact}().email (default info@…) → opts.to (last resort; must be verified too).
 */
import { getSiteContact } from "@/lib/site-contact";

async function brevoFailureDetail(res: Response): Promise<string> {
  const prefix = `HTTP ${res.status}`;
  try {
    const raw = await res.text();
    if (!raw) return prefix;
    try {
      const j = JSON.parse(raw) as {
        code?: string;
        message?: string | string[];
        error?: { message?: string };
      };
      const parts: string[] = [];
      if (j.code) parts.push(String(j.code));
      if (typeof j.message === "string") parts.push(j.message);
      if (Array.isArray(j.message))
        parts.push(...j.message.map((m) => String(m)));
      if (j.error?.message) parts.push(String(j.error.message));
      if (parts.length) return `${prefix}: ${parts.join(" — ")}`;
      return `${prefix}: ${raw.slice(0, 400)}`;
    } catch {
      return `${prefix}: ${raw.slice(0, 400)}`;
    }
  } catch {
    return prefix;
  }
}

function resolveBrevoSenderEmail(to: string): string {
  return ([
    process.env.CONTACT_FORM_BREVO_SENDER_EMAIL,
    process.env.BREVO_SENDER_EMAIL,
    process.env.NEXT_PUBLIC_CONTACT_EMAIL,
    getSiteContact().email,
    to,
  ].find((s) => typeof s === "string" && s.trim().length > 0) || to).trim();
}

/** Brevo accepts text + HTML; including HTML avoids edge cases where text-only is rejected. */
function plainTextToHtmlEmailBody(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html><html><body><pre style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.5;white-space:pre-wrap;margin:0;">${escaped}</pre></body></html>`;
}

/** Brevo returns 401 when the API key has "Authorised IPs" enabled and the request egress IP is not listed. */
export function isBrevoUnauthorizedIpError(status: number, detail: string): boolean {
  if (status !== 401) return false;
  const d = detail.toLowerCase();
  return (
    d.includes("unrecognised ip") ||
    d.includes("unrecognized ip") ||
    d.includes("authorised_ips") ||
    d.includes("authorized_ips") ||
    d.includes("authorised ip") ||
    d.includes("authorized ip")
  );
}
export async function sendPlainEmailViaBrevo(opts: {
    to: string;
    subject: string;
    text: string;
    replyTo?: string;
    senderName?: string;
  }): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
    const apiKey = process.env.BREVO_API_KEY?.trim();
    if (!apiKey) {
      return { ok: false, status: 500, detail: "BREVO_API_KEY not set" };
    }
   
    const senderEmail = resolveBrevoSenderEmail(opts.to);

    const senderName =
      opts.senderName ||
      process.env.CONTACT_FORM_BREVO_SENDER_NAME?.trim() ||
      process.env.NEXT_PUBLIC_SITE_NAME?.trim() ||
      "Website";
   
    const body: Record<string, unknown> = {
      sender: { name: senderName, email: senderEmail },
      to: [{ email: opts.to }],
      subject: opts.subject,
      textContent: opts.text,
      htmlContent: plainTextToHtmlEmailBody(opts.text),
    };

    if (opts.replyTo) {
      body.replyTo = { email: opts.replyTo };
    }

    let res: Response;
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 25_000);
      try {
        res = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "api-key": apiKey,
          },
          body: JSON.stringify(body),
          cache: "no-store",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(t);
      }
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.name === "AbortError"
            ? "Brevo request timed out"
            : e.message
          : "network error";
      return { ok: false, status: 502, detail: msg };
    }
   
    if (res.ok) {
      return { ok: true };
    }

    const detail = await brevoFailureDetail(res);
    if (process.env.NODE_ENV !== "production") {
      console.error("[Brevo] sendPlainEmailViaBrevo failed", {
        senderEmail,
        to: opts.to,
        status: res.status,
        detail,
      });
    }
    return { ok: false, status: res.status, detail };
  }

export type BrevoAttachment = { name: string; contentBase64: string };

/**
 * Same as {@link sendPlainEmailViaBrevo} but supports file attachments (base64 content per Brevo API).
 */
export async function sendPlainEmailWithAttachmentsViaBrevo(opts: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  senderName?: string;
  attachments?: BrevoAttachment[];
}): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, status: 500, detail: "BREVO_API_KEY not set" };
  }

  const senderEmail = resolveBrevoSenderEmail(opts.to);

  const senderName =
    opts.senderName ||
    process.env.CONTACT_FORM_BREVO_SENDER_NAME?.trim() ||
    process.env.NEXT_PUBLIC_SITE_NAME?.trim() ||
    "Website";

  const body: Record<string, unknown> = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: opts.to }],
    subject: opts.subject,
    textContent: opts.text,
    htmlContent: plainTextToHtmlEmailBody(opts.text),
  };

  if (opts.replyTo) {
    body.replyTo = { email: opts.replyTo };
  }

  if (opts.attachments?.length) {
    body.attachment = opts.attachments.map((a) => ({
      name: a.name.slice(0, 200),
      content: a.contentBase64,
    }));
  }

  let res: Response;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 45_000);
    try {
      res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "api-key": apiKey,
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(t);
    }
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.name === "AbortError"
          ? "Brevo request timed out"
          : e.message
        : "network error";
    return { ok: false, status: 502, detail: msg };
  }

  if (res.ok) {
    return { ok: true };
  }

  const detail = await brevoFailureDetail(res);
  if (process.env.NODE_ENV !== "production") {
    console.error("[Brevo] sendPlainEmailWithAttachmentsViaBrevo failed", {
      senderEmail,
      to: opts.to,
      status: res.status,
      detail,
      attachmentCount: opts.attachments?.length ?? 0,
    });
  }
  return { ok: false, status: res.status, detail };
}