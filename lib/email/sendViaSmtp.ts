// import nodemailer from "nodemailer";

// type SmtpAttachment = {
//   filename: string;
//   content: Buffer;
// };

// type SendSmtpOptions = {
//   to: string;
//   subject: string;
//   text: string;
//   replyTo?: string;
//   senderName?: string;
//   senderEmail?: string;
//   attachments?: SmtpAttachment[];
// };

// function getSmtpConfig() {
//   const host = process.env.SMTP_HOST?.trim();
//   const port = Number(process.env.SMTP_PORT || "587");
//   const user = process.env.SMTP_USER?.trim();
//   const pass = process.env.SMTP_PASS?.trim();
//   const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";

//   if (!host || !user || !pass) {
//     return null;
//   }

//   return { host, port, user, pass, secure };
// }

// export function isSmtpConfigured(): boolean {
//   return getSmtpConfig() !== null;
// }

// export async function sendPlainEmailViaSmtp(
//   opts: SendSmtpOptions
// ): Promise<{ ok: true } | { ok: false; detail: string }> {
//   const config = getSmtpConfig();
//   if (!config) {
//     return { ok: false, detail: "SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing)" };
//   }

//   try {
//     const transporter = nodemailer.createTransport({
//       host: config.host,
//       port: config.port,
//       secure: config.secure,
//       auth: {
//         user: config.user,
//         pass: config.pass,
//       },
//     });

//     const senderEmail = (opts.senderEmail || process.env.SMTP_FROM_EMAIL || config.user).trim();
//     const senderName = opts.senderName?.trim() || process.env.SMTP_FROM_NAME?.trim() || "";
//     const from = senderName ? `"${senderName}" <${senderEmail}>` : senderEmail;

//     await transporter.sendMail({
//       from,
//       to: opts.to,
//       subject: opts.subject,
//       text: opts.text,
//       replyTo: opts.replyTo,
//       attachments: opts.attachments?.map((a) => ({
//         filename: a.filename,
//         content: a.content,
//       })),
//     });

//     return { ok: true };
//   } catch (error) {
//     const detail = error instanceof Error ? error.message : "SMTP send failed";
//     return { ok: false, detail };
//   }
// }

//D:\stage-joya\nextjs-stage\lib\email\sendViaSmtp.ts

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
