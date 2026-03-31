/**
 * Quote Expiry Management
 * Handles checking, updating, and managing quote expiration
 */

import { getWpBaseUrl } from './auth';
import { getAuthToken } from './auth-server';
import { fetchUserQuotes, updateQuoteStatus, getQuoteById } from './quote-storage';
import { sendQuoteExpiredEmail } from './quote-email';
import type { Quote } from './types/quote';

/**
 * Check if a quote has expired
 */
export function isQuoteExpired(quote: Quote): boolean {
  if (!quote.expires_at) {
    return false;
  }
  return new Date(quote.expires_at) < new Date();
}

/**
 * Get days until quote expires
 */
export function getDaysUntilExpiry(quote: Quote): number | null {
  if (!quote.expires_at) {
    return null;
  }
  const expiryDate = new Date(quote.expires_at);
  const now = new Date();
  const diffTime = expiryDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Check if quote is expiring soon (within specified days)
 */
export function isExpiringSoon(quote: Quote, days: number = 7): boolean {
  const daysUntil = getDaysUntilExpiry(quote);
  if (daysUntil === null) {
    return false;
  }
  return daysUntil > 0 && daysUntil <= days;
}

/**
 * Get expiry status for a quote
 */
export function getExpiryStatus(quote: Quote): {
  status: 'valid' | 'expiring_soon' | 'expired';
  daysUntil: number | null;
  message: string;
} {
  if (isQuoteExpired(quote)) {
    return {
      status: 'expired',
      daysUntil: 0,
      message: 'This quote has expired',
    };
  }

  const daysUntil = getDaysUntilExpiry(quote);
  if (daysUntil === null) {
    return {
      status: 'valid',
      daysUntil: null,
      message: 'No expiry date set',
    };
  }

  if (isExpiringSoon(quote, 7)) {
    return {
      status: 'expiring_soon',
      daysUntil,
      message: `Expires in ${daysUntil} ${daysUntil === 1 ? 'day' : 'days'}`,
    };
  }

  return {
    status: 'valid',
    daysUntil,
    message: `Valid for ${daysUntil} more ${daysUntil === 1 ? 'day' : 'days'}`,
  };
}

/**
 * Check and update expired quotes for a specific user
 */
export async function checkAndUpdateExpiredQuotes(userEmail: string): Promise<{
  checked: number;
  expired: number;
  updated: number;
  errors: number;
}> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    throw new Error('WordPress URL not configured');
  }

  const token = await getAuthToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  let checked = 0;
  let expired = 0;
  let updated = 0;
  let errors = 0;

  try {
    // Fetch all quotes for the user
    const quotes = await fetchUserQuotes(userEmail);

    for (const quote of quotes) {
      checked++;

      // Skip if already expired
      if (quote.status === 'expired') {
        continue;
      }

      // Check if quote has expired
      if (isQuoteExpired(quote)) {
        expired++;

        try {
          // Update quote status to expired
          const updatedQuote = await updateQuoteStatus(
            quote.id,
            'expired',
            'System',
            undefined,
            'Quote expired automatically'
          );

          if (updatedQuote) {
            updated++;

            // Send expiry email notification
            try {
              await sendQuoteExpiredEmail(updatedQuote);
            } catch (emailError) {
              console.error(`Failed to send expiry email for quote ${quote.id}:`, emailError);
              // Don't count email failures as errors
            }
          }
        } catch (updateError) {
          console.error(`Failed to update expired quote ${quote.id}:`, updateError);
          errors++;
        }
      }
    }
  } catch (error) {
    console.error('Error checking expired quotes:', error);
    throw error;
  }

  return { checked, expired, updated, errors };
}

/**
 * Check and update all expired quotes (for admin/cron use)
 */
export async function checkAllExpiredQuotes(): Promise<{
  checked: number;
  expired: number;
  updated: number;
  errors: number;
  userEmails: string[];
}> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    throw new Error('WordPress URL not configured');
  }

  const token = await getAuthToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  let totalChecked = 0;
  let totalExpired = 0;
  let totalUpdated = 0;
  let totalErrors = 0;
  const userEmails: string[] = [];

  try {
    // Fetch all quotes from WordPress
    // Note: This requires a custom endpoint or we need to fetch by user emails
    // For now, we'll use a simplified approach that checks quotes by fetching from known users
    // In production, you might want to create a WordPress endpoint that returns all quotes

    // This is a placeholder - in production, implement a proper endpoint
    // that returns all quotes or all user emails with quotes
    console.warn('checkAllExpiredQuotes: Full quote checking requires a custom WordPress endpoint');

    // For now, return empty results
    // The individual user checking can be done via checkAndUpdateExpiredQuotes
    return {
      checked: totalChecked,
      expired: totalExpired,
      updated: totalUpdated,
      errors: totalErrors,
      userEmails: [],
    };
  } catch (error) {
    console.error('Error checking all expired quotes:', error);
    throw error;
  }
}

/**
 * Renew/extend a quote expiry date
 */
export async function renewQuote(
  quoteId: string,
  additionalDays: number = 30
): Promise<Quote | null> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    throw new Error('WordPress URL not configured');
  }

  const token = await getAuthToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  // Get current quote
  const quote = await getQuoteById(quoteId);
  if (!quote) {
    throw new Error('Quote not found');
  }

  // Calculate new expiry date
  const currentExpiry = quote.expires_at ? new Date(quote.expires_at) : new Date();
  const newExpiry = new Date(currentExpiry);
  newExpiry.setDate(newExpiry.getDate() + additionalDays);

  // Update quote with new expiry date
  try {
    const response = await fetch(`${wpBase}/wp-json/wp/v2/quotes/${quoteId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        meta: {
          quote_expires_at: newExpiry.toISOString(),
          quote_data: JSON.stringify({
            ...quote,
            expires_at: newExpiry.toISOString(),
            updated_at: new Date().toISOString(),
          }),
        },
      }),
    });

    if (response.ok) {
      const updatedQuote: Quote = {
        ...quote,
        expires_at: newExpiry.toISOString(),
        updated_at: new Date().toISOString(),
      };
      return updatedQuote;
    }

    return null;
  } catch (error) {
    console.error('Error renewing quote:', error);
    throw error;
  }
}

