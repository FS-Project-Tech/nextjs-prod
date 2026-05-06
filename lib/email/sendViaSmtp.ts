/**
 * Plain SMTP via nodemailer.
 *
 * Env: SMTP_HOST, SMTP_USER, SMTP_PASS — required.
 *      SMTP_PORT (default 587), SMTP_SECURE (true/false for TLS),
 *      SMTP_FROM_EMAIL, SMTP_FROM_NAME — optional.
 *
 * Credit applications: set CREDIT_APPLICATION_EMAIL_PROVIDER=smtp (see app/api/credit-application/route.ts).
 */

import nodemailer from "nodemailer";

type SmtpAttachment = {
  filename: string;
  content: Buffer;
};

type SendSmtpOptions = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  senderName?: string;
  senderEmail?: string;
  attachments?: SmtpAttachment[];
};

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";

  if (!host || !user || !pass) {
    return null;
  }

  return { host, port, user, pass, secure };
}

export function isSmtpConfigured(): boolean {
  return getSmtpConfig() !== null;
}

export async function sendPlainEmailViaSmtp(
  opts: SendSmtpOptions
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const config = getSmtpConfig();
  if (!config) {
    return { ok: false, detail: "SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing)" };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });

    const senderEmail = (opts.senderEmail || process.env.SMTP_FROM_EMAIL || config.user).trim();
    const senderName = opts.senderName?.trim() || process.env.SMTP_FROM_NAME?.trim() || "";
    const from = senderName ? `"${senderName}" <${senderEmail}>` : senderEmail;

    await transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      replyTo: opts.replyTo,
      attachments: opts.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    });

    return { ok: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "SMTP send failed";
    return { ok: false, detail };
  }
}

/** Same fields as Brevo attachment shape — base64 bodies decoded for nodemailer. */
export async function sendPlainEmailWithAttachmentsViaSmtp(opts: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  senderName?: string;
  senderEmail?: string;
  attachments?: { name: string; contentBase64: string }[];
}): Promise<{ ok: true } | { ok: false; detail: string }> {
  const config = getSmtpConfig();
  if (!config) {
    return { ok: false, detail: "SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing)" };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });

    const senderEmail = (opts.senderEmail || process.env.SMTP_FROM_EMAIL || config.user).trim();
    const senderName = opts.senderName?.trim() || process.env.SMTP_FROM_NAME?.trim() || "";
    const from = senderName ? `"${senderName}" <${senderEmail}>` : senderEmail;

    const attachments = opts.attachments?.length
      ? opts.attachments.map((a) => ({
          filename: a.name.slice(0, 200),
          content: Buffer.from(a.contentBase64, "base64"),
        }))
      : undefined;

    await transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      replyTo: opts.replyTo,
      attachments,
    });

    return { ok: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "SMTP send failed";
    return { ok: false, detail };
  }
}
