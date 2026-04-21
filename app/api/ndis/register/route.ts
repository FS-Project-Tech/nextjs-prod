// import { NextRequest } from "next/server";
// import { getWpBaseUrl } from "@/lib/auth";
// import { rateLimit } from "@/lib/api-security";
// import { sanitizeEmail, sanitizeString } from "@/lib/sanitize";
// import { secureResponse } from "@/lib/security-headers";
// import { sendPlainEmailViaBrevo, sendPlainEmailWithAttachmentsViaBrevo } from "@/lib/email/sendViaBrevo";
// import { isSmtpConfigured, sendPlainEmailViaSmtp } from "@/lib/email/sendViaSmtp";

// const NDIS_ADMIN_EMAIL = "NDIS@joyamedicalsupplies.com.au";
// const NDIS_SENDER_EMAIL = process.env.NDIS_BREVO_SENDER_EMAIL?.trim() || NDIS_ADMIN_EMAIL;
// const NDIS_SENDER_NAME = process.env.NDIS_BREVO_SENDER_NAME?.trim() || NDIS_SENDER_EMAIL;

// /**
//  * POST /api/ndis/register
//  * Sends NDIS registration details to admin and acknowledgement to customer.
//  */
// export async function POST(req: NextRequest) {
//   const rateLimitCheck = await rateLimit({
//     windowMs: 60 * 60 * 1000,
//     maxRequests: 10,
//   })(req);

//   if (rateLimitCheck) return rateLimitCheck;

//   try {
//     const formData = await req.formData();
//     const name = sanitizeString(String(formData.get("name") || ""));
//     const email = sanitizeEmail(String(formData.get("email") || ""));
//     const uploadedFile = formData.get("file");
//     const file = uploadedFile instanceof File ? uploadedFile : null;
//     const fileName = sanitizeString(file?.name || "");

//     if (!name || !email) {
//       return secureResponse(
//         { error: "Name and email are required." },
//         { status: 400 }
//       );
//     }

//     if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
//       return secureResponse({ error: "Invalid email address." }, { status: 400 });
//     }

//     if (file && file.size > 15 * 1024 * 1024) {
//       return secureResponse(
//         { error: "Uploaded file is too large. Please upload a file under 15MB." },
//         { status: 400 }
//       );
//     }

//     const adminSubject = `NDIS form submission - ${name}`;
//     const adminBody = `
// New NDIS form submission

// Name: ${name}
// Email: ${email}
// Uploaded file: ${fileName || "Not provided"}

// ---
// ${process.env.NEXT_PUBLIC_SITE_NAME || "Joya Medical Supplies"}
// `.trim();

//     const customerSubject = "We received your NDIS form submission";
//     const customerBody = `
// Hello ${name},

// Thank you for submitting your NDIS details to ${process.env.NEXT_PUBLIC_SITE_NAME || "Joya Medical Supplies"}.
// Our team will review your information and get back to you shortly.

// If you need help, contact us at ${NDIS_ADMIN_EMAIL}.

// Kind regards,
// ${process.env.NEXT_PUBLIC_SITE_NAME || "Joya Medical Supplies"}
// `.trim();

//     let sent = false;
//     let lastError = "";
//     let fileBuffer: Buffer | null = null;
//     let attachment:
//       | {
//           name: string;
//           contentBase64: string;
//         }
//       | undefined;

//     if (file) {
//       const bytes = await file.arrayBuffer();
//       fileBuffer = Buffer.from(bytes);
//       attachment = {
//         name: fileName || "uploaded-file",
//         contentBase64: fileBuffer.toString("base64"),
//       };
//     }

//     if (isSmtpConfigured()) {
//       const smtpAttachment =
//         fileBuffer && fileName
//           ? [{ filename: fileName, content: fileBuffer }]
//           : undefined;
//       const [adminSmtp, customerSmtp] = await Promise.all([
//         sendPlainEmailViaSmtp({
//           to: NDIS_ADMIN_EMAIL,
//           subject: adminSubject,
//           text: adminBody,
//           replyTo: email,
//           senderName: NDIS_SENDER_NAME,
//           senderEmail: NDIS_SENDER_EMAIL,
//           attachments: smtpAttachment,
//         }),
//         sendPlainEmailViaSmtp({
//           to: email,
//           subject: customerSubject,
//           text: customerBody,
//           senderName: NDIS_SENDER_NAME,
//           senderEmail: NDIS_SENDER_EMAIL,
//         }),
//       ]);

//       if (adminSmtp.ok && customerSmtp.ok) {
//         sent = true;
//       } else {
//         const adminError =
//           adminSmtp.ok === true ? "" : `Admin(SMTP): ${adminSmtp.detail}`;
//         const customerError =
//           customerSmtp.ok === true ? "" : `Customer(SMTP): ${customerSmtp.detail}`;
//         lastError = [adminError, customerError].filter(Boolean).join("; ");
//       }
//     }

//     if (!sent && process.env.BREVO_API_KEY?.trim()) {
//       const [adminBrevo, customerBrevo] = await Promise.all([
//         attachment
//           ? sendPlainEmailWithAttachmentsViaBrevo({
//               to: NDIS_ADMIN_EMAIL,
//               subject: adminSubject,
//               text: adminBody,
//               replyTo: email,
//               senderName: NDIS_SENDER_NAME,
//               senderEmail: NDIS_SENDER_EMAIL,
//               attachments: [attachment],
//             })
//           : sendPlainEmailViaBrevo({
//               to: NDIS_ADMIN_EMAIL,
//               subject: adminSubject,
//               text: adminBody,
//               replyTo: email,
//               senderName: NDIS_SENDER_NAME,
//               senderEmail: NDIS_SENDER_EMAIL,
//             }),
//         sendPlainEmailViaBrevo({
//           to: email,
//           subject: customerSubject,
//           text: customerBody,
//           senderName: NDIS_SENDER_NAME,
//           senderEmail: NDIS_SENDER_EMAIL,
//         }),
//       ]);

//       if (adminBrevo.ok && customerBrevo.ok) {
//         sent = true;
//       } else {
//         const adminError =
//           adminBrevo.ok === true ? "" : `Admin(Brevo): ${adminBrevo.detail}`;
//         const customerError =
//           customerBrevo.ok === true ? "" : `Customer(Brevo): ${customerBrevo.detail}`;
//         lastError = [adminError, customerError].filter(Boolean).join("; ");
//       }
//     }

//     const wpBase = getWpBaseUrl();

//     if (!sent && wpBase) {
//       try {
//         const [adminRes, customerRes] = await Promise.all([
//           fetch(`${wpBase}/wp-json/wp/v2/send-email`, {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({
//               to: NDIS_ADMIN_EMAIL,
//               subject: adminSubject,
//               message: adminBody,
//               headers: { "Content-Type": "text/plain; charset=UTF-8" },
//             }),
//             cache: "no-store",
//           }),
//           fetch(`${wpBase}/wp-json/wp/v2/send-email`, {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({
//               to: email,
//               subject: customerSubject,
//               message: customerBody,
//               headers: { "Content-Type": "text/plain; charset=UTF-8" },
//             }),
//             cache: "no-store",
//           }),
//         ]);

//         if (adminRes.ok && customerRes.ok) {
//           sent = true;
//         } else {
//           const adminDetail = await adminRes.text().catch(() => "");
//           const customerDetail = await customerRes.text().catch(() => "");
//           const wpError = `Admin(WP ${adminRes.status}): ${adminDetail}; Customer(WP ${customerRes.status}): ${customerDetail}`;
//           lastError = lastError ? `${lastError}; ${wpError}` : wpError;
//         }
//       } catch (e) {
//         const msg = e instanceof Error ? e.message : "WordPress email request failed";
//         lastError = lastError ? `${lastError}; ${msg}` : msg;
//       }
//     }

//     if (sent) {
//       return secureResponse({
//         success: true,
//         message: "NDIS form submitted successfully.",
//       });
//     }

//     return secureResponse(
//       {
//         error: "Email delivery failed. Please contact support.",
//         ...(process.env.NODE_ENV === "development" && lastError ? { detail: lastError } : {}),
//       },
//       { status: 502 }
//     );
//   } catch (error) {
//     if (process.env.NODE_ENV === "development") {
//       console.error("ndis register error:", error);
//     }
//     return secureResponse(
//       { error: "Failed to submit NDIS form. Please try again later." },
//       { status: 500 }
//     );
//   }
// }


import { NextRequest } from "next/server";
import { getWpBaseUrl } from "@/lib/auth";
import { rateLimit } from "@/lib/api-security";
import { sanitizeEmail, sanitizeString } from "@/lib/sanitize";
import { secureResponse } from "@/lib/security-headers";
import {
  sendPlainEmailViaBrevo,
  sendPlainEmailWithAttachmentsViaBrevo,
  isBrevoUnauthorizedIpError,
} from "@/lib/email/sendViaBrevo";

const NDIS_ADMIN_EMAIL = "NDIS@joyamedicalsupplies.com.au";
const NDIS_SENDER_EMAIL = process.env.NDIS_BREVO_SENDER_EMAIL?.trim() || NDIS_ADMIN_EMAIL;
const NDIS_SENDER_NAME = process.env.NDIS_BREVO_SENDER_NAME?.trim() || NDIS_SENDER_EMAIL;

function logNdisMailDelivery(
  channel: "brevo" | "wp",
  meta?: Record<string, unknown>
) {
  if (process.env.NODE_ENV !== "development") return;
  const labels = {
    brevo: "[NDIS mail] Brevo work — admin + customer emails sent via Brevo API",
    wp: "[NDIS mail] WP work — admin + customer emails sent via WordPress send-email endpoint",
  };
  console.log(labels[channel], meta && Object.keys(meta).length ? meta : "");
}

/**
 * POST /api/ndis/register
 * Sends NDIS registration details to admin and acknowledgement to customer.
 */
export async function POST(req: NextRequest) {
  const rateLimitCheck = await rateLimit({
    windowMs: 60 * 60 * 1000,
    maxRequests: 10,
  })(req);

  if (rateLimitCheck) return rateLimitCheck;

  try {
    const formData = await req.formData();
    const name = sanitizeString(String(formData.get("name") || ""));
    const email = sanitizeEmail(String(formData.get("email") || ""));
    const uploadedFile = formData.get("file");
    const file = uploadedFile instanceof File ? uploadedFile : null;
    const fileName = sanitizeString(file?.name || "");

    if (!name || !email) {
      return secureResponse(
        { error: "Name and email are required." },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return secureResponse({ error: "Invalid email address." }, { status: 400 });
    }

    if (file && file.size > 15 * 1024 * 1024) {
      return secureResponse(
        { error: "Uploaded file is too large. Please upload a file under 15MB." },
        { status: 400 }
      );
    }

    const adminSubject = `NDIS form submission - ${name}`;
    const adminBody = `
New NDIS form submission

Name: ${name}
Email: ${email}
Uploaded file: ${fileName || "Not provided"}

---
${process.env.NEXT_PUBLIC_SITE_NAME || "Joya Medical Supplies"}
`.trim();

    const customerSubject = "We received your NDIS form submission";
    const customerBody = `
Hello ${name},

Thank you for submitting your NDIS details to ${process.env.NEXT_PUBLIC_SITE_NAME || "Joya Medical Supplies"}.
Our team will review your information and get back to you shortly.

If you need help, contact us at ${NDIS_ADMIN_EMAIL}.

Kind regards,
${process.env.NEXT_PUBLIC_SITE_NAME || "Joya Medical Supplies"}
`.trim();

    let sent = false;
    let lastError = "";
    let attachment:
      | {
          name: string;
          contentBase64: string;
        }
      | undefined;

    if (file) {
      const bytes = await file.arrayBuffer();
      const buf = Buffer.from(bytes);
      attachment = {
        name: fileName || "uploaded-file",
        contentBase64: buf.toString("base64"),
      };
    }

    if (!sent && process.env.BREVO_API_KEY?.trim()) {
      const [adminBrevo, customerBrevo] = await Promise.all([
        attachment
          ? sendPlainEmailWithAttachmentsViaBrevo({
              to: NDIS_ADMIN_EMAIL,
              subject: adminSubject,
              text: adminBody,
              replyTo: email,
              senderName: NDIS_SENDER_NAME,
              senderEmail: NDIS_SENDER_EMAIL,
              attachments: [attachment],
            })
          : sendPlainEmailViaBrevo({
              to: NDIS_ADMIN_EMAIL,
              subject: adminSubject,
              text: adminBody,
              replyTo: email,
              senderName: NDIS_SENDER_NAME,
              senderEmail: NDIS_SENDER_EMAIL,
            }),
        sendPlainEmailViaBrevo({
          to: email,
          subject: customerSubject,
          text: customerBody,
          senderName: NDIS_SENDER_NAME,
          senderEmail: NDIS_SENDER_EMAIL,
        }),
      ]);

      if (adminBrevo.ok && customerBrevo.ok) {
        sent = true;
        logNdisMailDelivery("brevo", {
          adminTo: NDIS_ADMIN_EMAIL,
          customerTo: email,
          hasAttachment: Boolean(attachment),
        });
      } else {
        const adminIpBlocked =
          adminBrevo.ok === false &&
          isBrevoUnauthorizedIpError(adminBrevo.status, adminBrevo.detail);
        const customerIpBlocked =
          customerBrevo.ok === false &&
          isBrevoUnauthorizedIpError(customerBrevo.status, customerBrevo.detail);

        if (adminIpBlocked && customerIpBlocked) {
          if (process.env.NODE_ENV === "development") {
            console.warn(
              "[NDIS] Brevo skipped (authorised IP restriction). Trying WordPress mail fallback."
            );
          }
        } else {
          const adminError =
            adminBrevo.ok === true ? "" : `Admin(Brevo): ${adminBrevo.detail}`;
          const customerError =
            customerBrevo.ok === true ? "" : `Customer(Brevo): ${customerBrevo.detail}`;
          lastError = [adminError, customerError].filter(Boolean).join("; ");
        }
      }
    }

    const wpBase = getWpBaseUrl();

    if (!sent && wpBase) {
      try {
        const [adminRes, customerRes] = await Promise.all([
          fetch(`${wpBase}/wp-json/wp/v2/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: NDIS_ADMIN_EMAIL,
              subject: adminSubject,
              message: adminBody,
              headers: { "Content-Type": "text/plain; charset=UTF-8" },
            }),
            cache: "no-store",
          }),
          fetch(`${wpBase}/wp-json/wp/v2/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: email,
              subject: customerSubject,
              message: customerBody,
              headers: { "Content-Type": "text/plain; charset=UTF-8" },
            }),
            cache: "no-store",
          }),
        ]);

        if (adminRes.ok && customerRes.ok) {
          sent = true;
          logNdisMailDelivery("wp", {
            wpBase,
            adminTo: NDIS_ADMIN_EMAIL,
            customerTo: email,
          });
        } else {
          const adminDetail = await adminRes.text().catch(() => "");
          const customerDetail = await customerRes.text().catch(() => "");
          const wpError = `Admin(WP ${adminRes.status}): ${adminDetail}; Customer(WP ${customerRes.status}): ${customerDetail}`;
          lastError = lastError ? `${lastError}; ${wpError}` : wpError;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "WordPress email request failed";
        lastError = lastError ? `${lastError}; ${msg}` : msg;
      }
    }

    if (sent) {
      return secureResponse({
        success: true,
        message: "NDIS form submitted successfully.",
      });
    }

    return secureResponse(
      {
        error: "Email delivery failed. Please contact support.",
        ...(process.env.NODE_ENV === "development" && lastError ? { detail: lastError } : {}),
      },
      { status: 502 }
    );
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("ndis register error:", error);
    }
    return secureResponse(
      { error: "Failed to submit NDIS form. Please try again later." },
      { status: 500 }
    );
  }
}
