/**
 * Quote Email Notifications
 * Handles sending emails for various quote events
 */

import { getWpBaseUrl } from './auth';
import type { Quote } from './types/quote';
import { formatPrice } from './format-utils';

export type QuoteEmailEvent = 
  | 'quote_created'
  | 'quote_sent'
  | 'quote_accepted'
  | 'quote_rejected'
  | 'quote_expired'
  | 'quote_converted';

interface EmailOptions {
  to: string;
  subject: string;
  body: string;
  html?: string;
  type: QuoteEmailEvent;
}

/**
 * Send email via WordPress or webhook
 * Exported for use in other modules
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const wpBase = getWpBaseUrl();
  
  // Try WordPress email endpoint first
  if (wpBase) {
    try {
      const wpResponse = await fetch(`${wpBase}/wp-json/wp/v2/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: options.to,
          subject: options.subject,
          message: options.html || options.body,
          headers: {
            'Content-Type': options.html ? 'text/html; charset=UTF-8' : 'text/plain; charset=UTF-8',
          },
        }),
        cache: 'no-store',
      });

      if (wpResponse.ok) {
        return true;
      }
    } catch (wpError) {
      console.log('WordPress email endpoint not available, trying webhook');
    }
  }

  // Try email webhook if available
  const emailWebhook = process.env.QUOTE_EMAIL_WEBHOOK_URL;
  if (emailWebhook) {
    try {
      const webhookResponse = await fetch(emailWebhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: options.to,
          subject: options.subject,
          body: options.body,
          html: options.html,
          type: options.type,
        }),
      });

      if (webhookResponse.ok) {
        return true;
      }
    } catch (webhookError) {
      console.error('Email webhook error:', webhookError);
    }
  }

  // Log email in development
  if (process.env.NODE_ENV === 'development') {
    console.log('Quote Email:', {
      to: options.to,
      subject: options.subject,
      type: options.type,
    });
  }

  return false;
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
  const siteName = process.env.NEXT_PUBLIC_SITE_NAME || 'Joya Medical Supplies';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #14b8a6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 24px;">${siteName}</h1>
  </div>
  
  <div style="background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px;">
    <h2 style="color: #1f2937; margin-top: 0;">${title}</h2>
    
    <p>${greeting}</p>
    
    <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
      ${content}
    </div>
    
    ${actionButton ? `
      <div style="text-align: center; margin: 30px 0;">
        <a href="${actionButton.url}" 
           style="display: inline-block; background-color: #14b8a6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
          ${actionButton.text}
        </a>
      </div>
    ` : ''}
    
    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      If you have any questions, please don't hesitate to contact us.
    </p>
    
    <p style="color: #6b7280; font-size: 14px;">
      Best regards,<br>
      ${siteName}
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
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';
  const quoteUrl = `${siteUrl}/dashboard/quotes/${quote.id}`;

  const itemsList = quote.items.map((item) => {
    const qty = item.qty || 1;
    const price = Number(item.price) || 0;
    return `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${item.name}${item.sku ? ` (SKU: ${item.sku})` : ''}</td>
        <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e5e7eb;">${qty}</td>
        <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e5e7eb;">${formatPrice(price)}</td>
        <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e5e7eb;">${formatPrice(price * qty)}</td>
      </tr>
    `;
  }).join('');

  const content = `
    <p>Your quote request <strong>${quote.quote_number}</strong> has been received.</p>
    
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
      ${quote.shipping > 0 ? `
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span>Shipping:</span>
          <strong>${formatPrice(quote.shipping)}</strong>
        </div>
      ` : ''}
      ${quote.discount > 0 ? `
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #10b981;">
          <span>Discount:</span>
          <strong>-${formatPrice(quote.discount)}</strong>
        </div>
      ` : ''}
      <div style="display: flex; justify-content: space-between; margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb; font-size: 18px; font-weight: 600;">
        <span>Total:</span>
        <span style="color: #14b8a6;">${formatPrice(quote.total)}</span>
      </div>
    </div>
    
    ${quote.notes ? `
      <div style="margin-top: 20px; padding: 15px; background-color: #f9fafb; border-radius: 6px;">
        <strong>Your Notes:</strong>
        <p style="margin: 8px 0 0 0; font-style: italic; color: #6b7280;">${quote.notes}</p>
      </div>
    ` : ''}
    
    <p style="margin-top: 20px;">Our team will review your request and get back to you within 2-3 business days.</p>
  `;

  const html = generateHTMLEmail(
    `Quote Request ${quote.quote_number} Received`,
    `Hello ${quote.user_name || 'Customer'},`,
    content,
    { text: 'View Quote in Dashboard', url: quoteUrl }
  );

  const subject = `Quote Request ${quote.quote_number} - ${quote.items.length} ${quote.items.length === 1 ? 'Item' : 'Items'}`;

  return sendEmail({
    to: quote.user_email,
    subject,
    body: `Your quote request ${quote.quote_number} has been received. View it at: ${quoteUrl}`,
    html,
    type: 'quote_created',
  });
}

/**
 * Send quote sent notification (when admin sends quote to customer)
 */
export async function sendQuoteSentEmail(quote: Quote): Promise<boolean> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';
  const quoteUrl = `${siteUrl}/dashboard/quotes/${quote.id}`;

  const content = `
    <p>A quote has been prepared for you: <strong>${quote.quote_number}</strong></p>
    
    <p style="margin-top: 15px;">Please review the quote details and let us know if you'd like to proceed.</p>
    
    ${quote.expires_at ? `
      <div style="margin-top: 15px; padding: 12px; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
        <strong>⚠️ Important:</strong> This quote expires on ${new Date(quote.expires_at).toLocaleDateString()}
      </div>
    ` : ''}
    
    <p style="margin-top: 20px;">You can accept or reject this quote from your dashboard.</p>
  `;

  const html = generateHTMLEmail(
    `Quote ${quote.quote_number} Ready for Review`,
    `Hello ${quote.user_name || 'Customer'},`,
    content,
    { text: 'Review Quote', url: quoteUrl }
  );

  const subject = `Quote ${quote.quote_number} Ready for Review`;

  return sendEmail({
    to: quote.user_email,
    subject,
    body: `A quote has been prepared for you: ${quote.quote_number}. Review it at: ${quoteUrl}`,
    html,
    type: 'quote_sent',
  });
}

/**
 * Send quote accepted notification
 */
export async function sendQuoteAcceptedEmail(quote: Quote): Promise<boolean> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';
  const quoteUrl = `${siteUrl}/dashboard/quotes/${quote.id}`;

  const content = `
    <p>Great news! You have accepted quote <strong>${quote.quote_number}</strong>.</p>
    
    <p style="margin-top: 15px;">You can now convert this quote to an order when you're ready to proceed with the purchase.</p>
  `;

  const html = generateHTMLEmail(
    `Quote ${quote.quote_number} Accepted`,
    `Hello ${quote.user_name || 'Customer'},`,
    content,
    { text: 'Convert to Order', url: quoteUrl }
  );

  const subject = `Quote ${quote.quote_number} Accepted`;

  return sendEmail({
    to: quote.user_email,
    subject,
    body: `You have accepted quote ${quote.quote_number}. Convert it to an order at: ${quoteUrl}`,
    html,
    type: 'quote_accepted',
  });
}

/**
 * Send quote rejected notification
 */
export async function sendQuoteRejectedEmail(quote: Quote, reason?: string): Promise<boolean> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';
  const quoteUrl = `${siteUrl}/dashboard/quotes/${quote.id}`;

  const content = `
    <p>You have rejected quote <strong>${quote.quote_number}</strong>.</p>
    
    ${reason ? `
      <div style="margin-top: 15px; padding: 12px; background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 4px;">
        <strong>Reason:</strong> ${reason}
      </div>
    ` : ''}
    
    <p style="margin-top: 20px;">If you have any questions or would like to discuss alternatives, please don't hesitate to contact us.</p>
  `;

  const html = generateHTMLEmail(
    `Quote ${quote.quote_number} Rejected`,
    `Hello ${quote.user_name || 'Customer'},`,
    content,
    { text: 'View Quote', url: quoteUrl }
  );

  const subject = `Quote ${quote.quote_number} Rejected`;

  return sendEmail({
    to: quote.user_email,
    subject,
    body: `You have rejected quote ${quote.quote_number}.${reason ? ` Reason: ${reason}` : ''}`,
    html,
    type: 'quote_rejected',
  });
}

/**
 * Send quote converted to order notification
 */
export async function sendQuoteConvertedEmail(quote: Quote, orderId: number, orderNumber?: string): Promise<boolean> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';
  const orderUrl = `${siteUrl}/dashboard/orders/${orderId}`;

  const content = `
    <p>Your quote <strong>${quote.quote_number}</strong> has been successfully converted to an order.</p>
    
    <div style="margin-top: 20px; padding: 15px; background-color: #f0fdf4; border-left: 4px solid #10b981; border-radius: 4px;">
      <strong>Order Details:</strong><br>
      Order #${orderNumber || orderId}<br>
      Total: ${formatPrice(quote.total)}
    </div>
    
    <p style="margin-top: 20px;">You can track your order status in your dashboard.</p>
  `;

  const html = generateHTMLEmail(
    `Quote ${quote.quote_number} Converted to Order`,
    `Hello ${quote.user_name || 'Customer'},`,
    content,
    { text: 'View Order', url: orderUrl }
  );

  const subject = `Quote ${quote.quote_number} Converted to Order #${orderNumber || orderId}`;

  return sendEmail({
    to: quote.user_email,
    subject,
    body: `Your quote ${quote.quote_number} has been converted to order #${orderNumber || orderId}. View it at: ${orderUrl}`,
    html,
    type: 'quote_converted',
  });
}

/**
 * Send quote expired notification
 */
export async function sendQuoteExpiredEmail(quote: Quote): Promise<boolean> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';
  const quoteUrl = `${siteUrl}/dashboard/quotes/${quote.id}`;

  const content = `
    <p>This is to inform you that quote <strong>${quote.quote_number}</strong> has expired.</p>
    
    <p style="margin-top: 15px;">If you're still interested in these items, please request a new quote or contact us directly.</p>
  `;

  const html = generateHTMLEmail(
    `Quote ${quote.quote_number} Expired`,
    `Hello ${quote.user_name || 'Customer'},`,
    content,
    { text: 'Request New Quote', url: `${siteUrl}/shop` }
  );

  const subject = `Quote ${quote.quote_number} Has Expired`;

  return sendEmail({
    to: quote.user_email,
    subject,
    body: `Quote ${quote.quote_number} has expired. Request a new quote at: ${siteUrl}/shop`,
    html,
    type: 'quote_expired',
  });
}

