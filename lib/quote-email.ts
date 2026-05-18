/**
 * Quote Email Notifications
 * Handles sending emails for various quote events
 *
 * Staff copy (same HTML/details) â€” set `QUOTE_STAFF_NOTIFY_EMAIL` to a comma-separated list, or leave
 * unset to default to info@joyamedicalsupplies.com.au. Set to empty string `QUOTE_STAFF_NOTIFY_EMAIL=`
 * or `false` / `0` to disable.
 */

import { sendHtmlEmailViaBrevo, sendPlainEmailViaBrevo } from "@/lib/email/sendViaBrevo";
import { getWpBaseUrl } from "./auth";
import type { Quote, QuoteAddressSnapshot } from "./types/quote";
import { formatPrice } from "./format-utils";

export type QuoteEmailEvent =
  | "quote_created"
  | "quote_sent"
  | "quote_accepted"
  | "quote_rejected"
  | "quote_expired"
  | "quote_converted";

interface EmailOptions {
  to: string;
  subject: string;
  body: string;
  html?: string;
  type: QuoteEmailEvent;
}

const DEFAULT_STAFF_NOTIFY = "info@joyamedicalsupplies.com.au";

function escapeHtmlForEmail(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function quoteAddressHasContent(addr: QuoteAddressSnapshot | null | undefined): boolean {
  if (!addr || typeof addr !== "object") return false;
  return Object.values(addr).some((v) => typeof v === "string" && v.trim().length > 0);
}

function quoteAddressInnerLines(addr: QuoteAddressSnapshot): string[] {
  const lines: string[] = [];
  const name = [addr.first_name, addr.last_name].filter((x) => x?.trim()).join(" ").trim();
  if (name) lines.push(name);
  if (addr.company?.trim()) lines.push(addr.company.trim());
  const street = [addr.address_1, addr.address_2].filter((x) => x?.trim()).join(", ");
  if (street) lines.push(street);
  const cityLine = [addr.city, addr.state, addr.postcode].filter((x) => x?.trim()).join(" ").trim();
  if (cityLine) lines.push(cityLine);
  if (addr.country?.trim()) lines.push(addr.country.trim());
  if (addr.phone?.trim()) lines.push(`Phone: ${addr.phone.trim()}`);
  if (addr.email?.trim()) lines.push(`Email: ${addr.email.trim()}`);
  return lines;
}

function quoteAddressHtmlBlock(title: string, addr: QuoteAddressSnapshot | null | undefined): string {
  if (!quoteAddressHasContent(addr)) return "";
  const lines = quoteAddressInnerLines(addr!);
  if (!lines.length) return "";
  const inner = lines
    .map(
      (l) =>
        `<span style="display:block;margin-top:4px;color:#374151;">${escapeHtmlForEmail(l)}</span>`
    )
    .join("");
  return `
    <div style="margin-bottom: 16px; padding: 14px; background-color: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb;">
      <strong style="display: block; margin-bottom: 4px; color: #111827; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em;">${escapeHtmlForEmail(title)}</strong>
      ${inner}
    </div>`;
}

function formatNdisInfoForEmail(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const lines: string[] = [];
    const labels: Record<string, string> = {
      participant_name: "Participant name",
      number: "NDIS number",
      dob: "Date of birth",
      plan_start: "Plan start",
      plan_end: "Plan end",
      claim_who: "Who will claim",
      funding_type: "Funding type",
    };
    for (const [key, label] of Object.entries(labels)) {
      const v = o[key];
      if (v == null || v === "") continue;
      lines.push(
        `<p style="margin: 0 0 6px 0;"><strong>${escapeHtmlForEmail(label)}:</strong> ${escapeHtmlForEmail(String(v))}</p>`,
      );
    }
    return lines.join("");
  } catch {
    return "";
  }
}

function quoteCreatedContactSectionHtml(quote: Quote): string {
  const emailHtml = quote.user_email
    ? `<p style="margin: 0 0 8px 0;"><strong>Email:</strong> ${escapeHtmlForEmail(quote.user_email)}</p>`
    : "";
  const nameHtml = quote.user_name
    ? `<p style="margin: 0 0 16px 0;"><strong>Name:</strong> ${escapeHtmlForEmail(quote.user_name)}</p>`
    : "";
  const billingHtml = quoteAddressHtmlBlock("Billing address", quote.billing_address ?? undefined);
  const shippingHtml = quoteAddressHtmlBlock("Shipping address", quote.shipping_address ?? undefined);
  const ndisHtml = formatNdisInfoForEmail(quote.ndis_info);
  const ndisBlock = ndisHtml
    ? `<div style="margin-top: 12px; padding: 12px; background: #f5f3ff; border-radius: 6px;"><strong style="display:block;margin-bottom:8px;">NDIS details</strong>${ndisHtml}</div>`
    : "";
  if (!emailHtml && !nameHtml && !billingHtml && !shippingHtml && !ndisBlock) return "";
  return `
    <div style="margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb;">
      <h3 style="color: #1f2937; margin: 0 0 12px 0; font-size: 16px;">Your details</h3>
      ${emailHtml}
      ${nameHtml}
      ${billingHtml}
      ${shippingHtml}
      ${ndisBlock}
    </div>`;
}

function quoteAddressPlainBlock(title: string, addr: QuoteAddressSnapshot | null | undefined): string {
  if (!quoteAddressHasContent(addr)) return "";
  const lines = quoteAddressInnerLines(addr!);
  if (!lines.length) return "";
  return `${title}:\n${lines.map((l) => `  ${l}`).join("\n")}\n`;
}

function quoteCreatedPlainBody(quote: Quote, quoteUrl: string): string {
  const parts: string[] = [];
  parts.push(`Your quote request ${quote.quote_number} has been received.`);
  parts.push("");
  parts.push("Your details");
  if (quote.user_email) parts.push(`Email: ${quote.user_email}`);
  if (quote.user_name) parts.push(`Name: ${quote.user_name}`);
  const bill = quoteAddressPlainBlock("Billing address", quote.billing_address ?? undefined);
  if (bill) parts.push(bill.trimEnd());
  const ship = quoteAddressPlainBlock("Shipping address", quote.shipping_address ?? undefined);
  if (ship) parts.push(ship.trimEnd());
  parts.push("");
  parts.push(`View in dashboard: ${quoteUrl}`);
  return parts.join("\n");
}

/**
 * Inboxes that receive an internal copy of every quote email (customer email unchanged).
 */
export function getQuoteStaffNotifyEmails(): string[] {
  const rawEnv = process.env.QUOTE_STAFF_NOTIFY_EMAIL;
  if (rawEnv === "false" || rawEnv === "0") {
    return [];
  }
  if (rawEnv === undefined || rawEnv === null) {
    return [DEFAULT_STAFF_NOTIFY];
  }
  const trimmed = String(rawEnv).trim();
  if (trimmed === "") {
    return [];
  }
  return Array.from(
    new Set(
      trimmed
        .split(/[,;]+/)
        .map((a) => a.trim())
        .filter(Boolean)
    )
  );
}

function prependStaffCopyBannerHtml(html: string, customerEmail: string): string {
  const safe = escapeHtmlForEmail(customerEmail);
  const banner = `<div style="background:#fef3c7;padding:12px 16px;margin:0 0 16px;border-radius:8px;border:1px solid #f59e0b;font-size:14px;line-height:1.5;color:#78350f;"><strong>Staff copy</strong> â€” original recipient: ${safe}</div>`;
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body[^>]*>/i, (open) => `${open}${banner}`);
  }
  return `${banner}${html}`;
}

/**
 * One delivery attempt: Brevo (same as contact form), then WordPress send-email, then
 * QUOTE_EMAIL_WEBHOOK_URL.
 */
async function deliverQuoteEmailOnce(
  to: string,
  subject: string,
  body: string,
  html: string | undefined,
  type: QuoteEmailEvent
): Promise<boolean> {
  const siteName = process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "Joya Medical Supplies";

  if (process.env.BREVO_API_KEY?.trim()) {
    const br = html?.trim()
      ? await sendHtmlEmailViaBrevo({
          to,
          subject,
          text: body,
          html: html.trim(),
          senderName: siteName,
        })
      : await sendPlainEmailViaBrevo({
          to,
          subject,
          text: body,
          senderName: siteName,
        });
    if (br.ok === true) {
      return true;
    }
    console.warn("[quote-email] Brevo failed, trying WordPress / webhook", {
      type,
      to,
      detail: br.ok === false ? br.detail : "",
      status: br.ok === false ? br.status : undefined,
    });
  }

  const wpBase = getWpBaseUrl();

  if (wpBase) {
    try {
      const wpCtrl = new AbortController();
      const wpT = setTimeout(() => wpCtrl.abort(), 20_000);
      let wpResponse: Response;
      try {
        wpResponse = await fetch(`${wpBase}/wp-json/wp/v2/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to,
            subject,
            message: html || body,
            headers: {
              "Content-Type": html ? "text/html; charset=UTF-8" : "text/plain; charset=UTF-8",
            },
          }),
          cache: "no-store",
          signal: wpCtrl.signal,
        });
      } finally {
        clearTimeout(wpT);
      }

      if (wpResponse.ok) {
        return true;
      }
      const errText = await wpResponse.text().catch(() => "");
      console.warn("[quote-email] WordPress send-email not OK", {
        type,
        to,
        status: wpResponse.status,
        body: errText.slice(0, 300),
      });
    } catch (e) {
      const msg = e instanceof Error && e.name === "AbortError" ? "timeout" : String(e);
      console.warn("[quote-email] WordPress send-email failed", { type, to, msg });
    }
  }

  const emailWebhook = process.env.QUOTE_EMAIL_WEBHOOK_URL?.trim();
  if (emailWebhook) {
    try {
      const webhookResponse = await fetch(emailWebhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to,
          subject,
          body,
          html,
          type,
        }),
        cache: "no-store",
      });

      if (webhookResponse.ok) {
        return true;
      }
      const whText = await webhookResponse.text().catch(() => "");
      console.warn("[quote-email] Webhook not OK", {
        type,
        to,
        status: webhookResponse.status,
        body: whText.slice(0, 300),
      });
    } catch (webhookError) {
      console.error("[quote-email] Email webhook error:", webhookError);
    }
  }

  if (process.env.NODE_ENV === "development") {
    console.warn("[quote-email] No channel delivered email (set BREVO_API_KEY, fix WP send-email, or QUOTE_EMAIL_WEBHOOK_URL)", {
      to,
      subject,
      type,
      hasBrevo: Boolean(process.env.BREVO_API_KEY?.trim()),
      hasWp: Boolean(wpBase),
      hasWebhook: Boolean(process.env.QUOTE_EMAIL_WEBHOOK_URL?.trim()),
    });
  }

  return false;
}

/**
 * Send email via WordPress or webhook
 * Exported for use in other modules
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const primaryOk = await deliverQuoteEmailOnce(
    options.to,
    options.subject,
    options.body,
    options.html,
    options.type
  );

  const customer = options.to.trim().toLowerCase();
  const staffList = getQuoteStaffNotifyEmails();

  for (const staffRaw of staffList) {
    const staffTo = staffRaw.trim();
    if (!staffTo || staffTo.toLowerCase() === customer) {
      continue;
    }
    const staffSubject = `[Joya â€” Customer Service] ${options.subject}`;
    const staffBody = `${options.body}\n\n---\nInternal copy â€” original recipient: ${options.to}`;
    const staffHtml = options.html
      ? prependStaffCopyBannerHtml(options.html, options.to)
      : undefined;
    try {
      await deliverQuoteEmailOnce(staffTo, staffSubject, staffBody, staffHtml, options.type);
    } catch (e) {
      console.error("[quote-email] staff notify failed", { staffTo, error: e });
    }
  }

  return primaryOk;
}

/**
 * Generate HTML email template
 */
function generateHTMLEmail(
  title: string,
  greeting: string,
  content: string,
  actionButton?: { text: string; url: string }
): string {
  const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "Joya Medical Supplies";
  const safeTitle = escapeHtmlForEmail(title);
  const safeGreeting = escapeHtmlForEmail(greeting);
  const safeSiteName = escapeHtmlForEmail(siteName);
  const safeButton =
    actionButton != null
      ? {
          text: escapeHtmlForEmail(actionButton.text),
          url: escapeHtmlForEmail(actionButton.url),
        }
      : null;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #14b8a6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 24px;">${safeSiteName}</h1>
  </div>
  
  <div style="background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px;">
    <h2 style="color: #1f2937; margin-top: 0;">${safeTitle}</h2>
    
    <p>${safeGreeting}</p>
    
    <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
      ${content}
    </div>
    
    ${
      safeButton
        ? `
      <div style="text-align: center; margin: 30px 0;">
        <a href="${safeButton.url}" 
           style="display: inline-block; background-color: #14b8a6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
          ${safeButton.text}
        </a>
      </div>
    `
        : ""
    }
    
    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      If you have any questions, please don't hesitate to contact us.
    </p>
    
    <p style="color: #6b7280; font-size: 14px;">
      Best regards,<br>
      ${safeSiteName}
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
    <p>This is an automated email. Please do not reply to this message.</p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Send quote created notification
 */
export async function sendQuoteCreatedEmail(quote: Quote): Promise<boolean> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yoursite.com";
  const quoteUrl = `${siteUrl}/dashboard/quotes/${quote.id}`;

  const itemsList = quote.items
    .map((item) => {
      const qty = item.qty || 1;
      const price = Number(item.price) || 0;
      const nameEsc = escapeHtmlForEmail(String(item.name ?? ""));
      const skuPart =
        item.sku && String(item.sku).trim()
          ? ` (SKU: ${escapeHtmlForEmail(String(item.sku).trim())})`
          : "";
      return `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${nameEsc}${skuPart}</td>
        <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e5e7eb;">${qty}</td>
        <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e5e7eb;">${formatPrice(price)}</td>
        <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e5e7eb;">${formatPrice(price * qty)}</td>
      </tr>
    `;
    })
    .join("");

  const contactSection = quoteCreatedContactSectionHtml(quote);
  const qn = escapeHtmlForEmail(quote.quote_number);
  const notesEsc = quote.notes ? escapeHtmlForEmail(quote.notes) : "";

  const content = `
    <p>Your quote request <strong>${qn}</strong> has been received.</p>
    
    ${contactSection}
    
    <h3 style="color: #1f2937; margin-top: 20px;">Quote Details</h3>
    <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
      <thead>
        <tr style="background-color: #f3f4f6;">
          <th style="padding: 8px; text-align: left; border-bottom: 2px solid #e5e7eb;">Item</th>
          <th style="padding: 8px; text-align: right; border-bottom: 2px solid #e5e7eb;">Qty</th>
          <th style="padding: 8px; text-align: right; border-bottom: 2px solid #e5e7eb;">Price</th>
          <th style="padding: 8px; text-align: right; border-bottom: 2px solid #e5e7eb;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsList}
      </tbody>
    </table>
    
    <div style="margin-top: 20px; padding-top: 15px; border-top: 2px solid #e5e7eb;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span>Subtotal:</span>
        <strong>${formatPrice(quote.subtotal)}</strong>
      </div>
      ${
        quote.shipping > 0
          ? `
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span>Shipping:</span>
          <strong>${formatPrice(quote.shipping)}</strong>
        </div>
      `
          : ""
      }
      ${
        quote.discount > 0
          ? `
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #10b981;">
          <span>Discount:</span>
          <strong>-${formatPrice(quote.discount)}</strong>
        </div>
      `
          : ""
      }
      <div style="display: flex; justify-content: space-between; margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb; font-size: 18px; font-weight: 600;">
        <span>Total:</span>
        <span style="color: #14b8a6;">${formatPrice(quote.total)}</span>
      </div>
    </div>
    
    ${
      quote.notes
        ? `
      <div style="margin-top: 20px; padding: 15px; background-color: #f9fafb; border-radius: 6px;">
        <strong>Your Notes:</strong>
        <p style="margin: 8px 0 0 0; font-style: italic; color: #6b7280;">${notesEsc}</p>
      </div>
    `
        : ""
    }
    
    <p style="margin-top: 20px;">Our team will review your request and get back to you within 24-48 hours.</p>
  `;

  const html = generateHTMLEmail(
    `Quote Request ${quote.quote_number} Received`,
    `Hello ${quote.user_name || "Customer"},`,
    content
  );

  const subject = `Quote Request ${quote.quote_number} - ${quote.items.length} ${quote.items.length === 1 ? "Item" : "Items"}`;

  return sendEmail({
    to: quote.user_email,
    subject,
    body: quoteCreatedPlainBody(quote, quoteUrl),
    html,
    type: "quote_created",
  });
}

/**
 * Send quote sent notification (when admin sends quote to customer)
 */
export async function sendQuoteSentEmail(quote: Quote): Promise<boolean> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yoursite.com";
  const quoteUrl = `${siteUrl}/dashboard/quotes/${quote.id}`;
  const qn = escapeHtmlForEmail(quote.quote_number);

  const content = `
    <p>A quote has been prepared for you: <strong>${qn}</strong></p>
    
    <p style="margin-top: 15px;">Please review the quote details and let us know if you'd like to proceed.</p>
    
    ${
      quote.expires_at
        ? `
      <div style="margin-top: 15px; padding: 12px; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
        <strong>âš ï¸ Important:</strong> This quote expires on ${new Date(quote.expires_at).toLocaleDateString()}
      </div>
    `
        : ""
    }
    
    <p style="margin-top: 20px;">You can accept or reject this quote from your dashboard.</p>
  `;

  const html = generateHTMLEmail(
    `Quote ${quote.quote_number} Ready for Review`,
    `Hello ${quote.user_name || "Customer"},`,
    content,
    { text: "Review Quote", url: quoteUrl }
  );

  const subject = `Quote ${quote.quote_number} Ready for Review`;

  return sendEmail({
    to: quote.user_email,
    subject,
    body: `A quote has been prepared for you: ${quote.quote_number}. Review it at: ${quoteUrl}`,
    html,
    type: "quote_sent",
  });
}

/**
 * Send quote accepted notification
 */
export async function sendQuoteAcceptedEmail(quote: Quote): Promise<boolean> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yoursite.com";
  const quoteUrl = `${siteUrl}/dashboard/quotes/${quote.id}`;
  const qn = escapeHtmlForEmail(quote.quote_number);

  const content = `
    <p>Great news! You have accepted quote <strong>${qn}</strong>.</p>
    
    <p style="margin-top: 15px;">You can now convert this quote to an order when you're ready to proceed with the purchase.</p>
  `;

  const html = generateHTMLEmail(
    `Quote ${quote.quote_number} Accepted`,
    `Hello ${quote.user_name || "Customer"},`,
    content,
    { text: "Convert to Order", url: quoteUrl }
  );

  const subject = `Quote ${quote.quote_number} Accepted`;

  return sendEmail({
    to: quote.user_email,
    subject,
    body: `You have accepted quote ${quote.quote_number}. Convert it to an order at: ${quoteUrl}`,
    html,
    type: "quote_accepted",
  });
}

/**
 * Send quote rejected notification
 */
export async function sendQuoteRejectedEmail(quote: Quote, reason?: string): Promise<boolean> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yoursite.com";
  const quoteUrl = `${siteUrl}/dashboard/quotes/${quote.id}`;
  const qn = escapeHtmlForEmail(quote.quote_number);
  const reasonEsc = reason ? escapeHtmlForEmail(reason) : "";

  const content = `
    <p>You have rejected quote <strong>${qn}</strong>.</p>
    
    ${
      reason
        ? `
      <div style="margin-top: 15px; padding: 12px; background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 4px;">
        <strong>Reason:</strong> ${reasonEsc}
      </div>
    `
        : ""
    }
    
    <p style="margin-top: 20px;">If you have any questions or would like to discuss alternatives, please don't hesitate to contact us.</p>
  `;

  const html = generateHTMLEmail(
    `Quote ${quote.quote_number} Rejected`,
    `Hello ${quote.user_name || "Customer"},`,
    content,
    { text: "View Quote", url: quoteUrl }
  );

  const subject = `Quote ${quote.quote_number} Rejected`;

  return sendEmail({
    to: quote.user_email,
    subject,
    body: `You have rejected quote ${quote.quote_number}.${reason ? ` Reason: ${reason}` : ""}`,
    html,
    type: "quote_rejected",
  });
}

/**
 * Send quote converted to order notification
 */
export async function sendQuoteConvertedEmail(
  quote: Quote,
  orderId: number,
  orderNumber?: string
): Promise<boolean> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yoursite.com";
  const orderUrl = `${siteUrl}/dashboard/orders/${orderId}`;
  const qn = escapeHtmlForEmail(quote.quote_number);
  const orderLabelEsc = escapeHtmlForEmail(String(orderNumber ?? orderId));

  const content = `
    <p>Your quote <strong>${qn}</strong> has been successfully converted to an order.</p>
    
    <div style="margin-top: 20px; padding: 15px; background-color: #f0fdf4; border-left: 4px solid #10b981; border-radius: 4px;">
      <strong>Order Details:</strong><br>
      Order #${orderLabelEsc}<br>
      Total: ${formatPrice(quote.total)}
    </div>
    
    <p style="margin-top: 20px;">You can track your order status in your dashboard.</p>
  `;

  const html = generateHTMLEmail(
    `Quote ${quote.quote_number} Converted to Order`,
    `Hello ${quote.user_name || "Customer"},`,
    content,
    { text: "View Order", url: orderUrl }
  );

  const subject = `Quote ${quote.quote_number} Converted to Order #${orderNumber || orderId}`;

  return sendEmail({
    to: quote.user_email,
    subject,
    body: `Your quote ${quote.quote_number} has been converted to order #${orderNumber || orderId}. View it at: ${orderUrl}`,
    html,
    type: "quote_converted",
  });
}

/**
 * Send quote expired notification
 */
export async function sendQuoteExpiredEmail(quote: Quote): Promise<boolean> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yoursite.com";
  const quoteUrl = `${siteUrl}/dashboard/quotes/${quote.id}`;
  const qn = escapeHtmlForEmail(quote.quote_number);

  const content = `
    <p>This is to inform you that quote <strong>${qn}</strong> has expired.</p>
    
    <p style="margin-top: 15px;">If you're still interested in these items, please request a new quote or contact us directly.</p>
  `;

  const html = generateHTMLEmail(
    `Quote ${quote.quote_number} Expired`,
    `Hello ${quote.user_name || "Customer"},`,
    content,
    { text: "Request New Quote", url: `${siteUrl}/shop` }
  );

  const subject = `Quote ${quote.quote_number} Has Expired`;

  return sendEmail({
    to: quote.user_email,
    subject,
    body: `Quote ${quote.quote_number} has expired. Request a new quote at: ${siteUrl}/shop`,
    html,
    type: "quote_expired",
  });
}


