/**
 * Quote Storage Utilities
 * Handles storing and retrieving quotes from the database
 */

import { getWpBaseUrl } from '@/lib/auth';
import { getAuthToken } from '@/lib/auth-server';
import type { Quote, QuoteRequestPayload, QuoteStatusHistory } from '@/lib/types/quote';

/**
 * Generate unique quote number
 */
export function generateQuoteNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `QUOTE-${year}-${random}`;
}

/**
 * Calculate quote expiry date (default 30 days)
 */
export function calculateExpiryDate(days: number = 30): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

/**
 * Store quote in database
 * Using WordPress post meta or WooCommerce custom storage
 */
export async function storeQuote(
  payload: QuoteRequestPayload,
  quoteNumber: string
): Promise<Quote | null> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    console.error('WordPress URL not configured');
    return null;
  }

  const token = await getAuthToken();
  if (!token) {
    console.error('No auth token available for storing quote');
    return null;
  }

  const now = new Date().toISOString();
  const expiresAt = calculateExpiryDate(30);

  // Initialize status history with pending status
  const initialStatusHistory: QuoteStatusHistory = {
    status: 'pending',
    changed_at: now,
    changed_by: payload.userName || 'Customer',
    notes: 'Quote request created',
  };

  const quote: Quote = {
    id: quoteNumber,
    quote_number: quoteNumber,
    user_email: payload.email,
    user_name: payload.userName,
    items: payload.items,
    subtotal: payload.subtotal,
    shipping: payload.shipping,
    shipping_method: payload.shippingMethod,
    discount: payload.discount,
    total: payload.total,
    status: 'pending',
    notes: payload.notes,
    created_at: now,
    updated_at: now,
    expires_at: expiresAt,
    status_history: [initialStatusHistory],
  };

  try {
    // Try to store as WordPress custom post type first
    try {
      const response = await fetch(`${wpBase}/wp-json/wp/v2/quotes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: quoteNumber,
          status: 'publish',
          meta: {
            quote_data: JSON.stringify(quote),
            quote_number: quoteNumber,
            user_email: payload.email,
            quote_status: 'pending',
            quote_total: payload.total,
            quote_expires_at: expiresAt,
          },
        }),
      });

      if (response.ok) {
        const post = await response.json();
        return {
          ...quote,
          id: post.id.toString(),
        };
      }
    } catch (postTypeError) {
      // Custom post type might not exist, try alternative storage
      console.debug('Custom post type not available, trying alternative storage');
    }

    // Alternative: Store in WordPress options table via custom endpoint
    // Or use WooCommerce order notes as draft orders
    // For now, we'll return the quote object even if storage fails
    // The quote will still be sent via email
    
    return quote;
  } catch (error) {
    console.error('Error storing quote:', error);
    // Return quote object anyway - email will still be sent
    return quote;
  }
}

/**
 * Fetch quotes for a user
 */
export async function fetchUserQuotes(userEmail: string): Promise<Quote[]> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) return [];

  const token = await getAuthToken();
  if (!token) return [];

  try {
    // Try to fetch from WordPress custom post type
    try {
      const response = await fetch(
        `${wpBase}/wp-json/wp/v2/quotes?meta_key=user_email&meta_value=${encodeURIComponent(userEmail)}&per_page=100&orderby=date&order=desc`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
        }
      );

      if (response.ok) {
        const posts = await response.json();
        if (Array.isArray(posts)) {
          return posts.map((post: any) => {
            try {
              const quoteData = post.meta?.quote_data 
                ? JSON.parse(post.meta.quote_data) 
                : {
                    quote_number: post.meta?.quote_number || post.title?.rendered || `QUOTE-${post.id}`,
                    user_email: post.meta?.user_email || userEmail,
                    user_name: post.meta?.user_name || 'Customer',
                    items: [],
                    subtotal: 0,
                    shipping: 0,
                    discount: 0,
                    total: post.meta?.quote_total || 0,
                    status: post.meta?.quote_status || 'pending',
                    expires_at: post.meta?.quote_expires_at || calculateExpiryDate(30),
                  };
              
              // Parse comments if available
              let comments = quoteData.comments || [];
              if (post.meta?.quote_comments) {
                try {
                  const parsed = JSON.parse(post.meta.quote_comments);
                  if (Array.isArray(parsed)) {
                    comments = parsed;
                  }
                } catch (e) {
                  console.debug('Could not parse quote comments, using default');
                }
              }

              return {
                ...quoteData,
                id: post.id.toString(),
                quote_number: quoteData.quote_number || post.title?.rendered || `QUOTE-${post.id}`,
                created_at: post.date || quoteData.created_at || new Date().toISOString(),
                updated_at: post.modified || quoteData.updated_at || new Date().toISOString(),
                comments: comments,
              };
            } catch (parseError) {
              console.error('Error parsing quote data:', parseError);
              return null;
            }
          }).filter((q: Quote | null) => q !== null) as Quote[];
        }
      }
    } catch (fetchError) {
      console.debug('Custom post type fetch failed, quotes may not be stored yet');
    }

    // If no quotes found, return empty array
    return [];
  } catch (error) {
    console.error('Error fetching quotes:', error);
    return [];
  }
}

/**
 * Update quote status with history tracking
 */
export async function updateQuoteStatus(
  quoteId: string,
  status: Quote['status'],
  changedBy?: string,
  reason?: string,
  notes?: string
): Promise<Quote | null> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) return null;

  const token = await getAuthToken();
  if (!token) return null;

  try {
    // First, get the current quote to preserve history
    const currentQuote = await getQuoteById(quoteId);
    if (!currentQuote) {
      console.error('Quote not found:', quoteId);
      return null;
    }

    const now = new Date().toISOString();
    
    // Create new status history entry
    const newHistoryEntry: QuoteStatusHistory = {
      status,
      changed_at: now,
      changed_by: changedBy || 'System',
      reason,
      notes,
    };

    // Append to existing history
    const updatedHistory = [
      ...(currentQuote.status_history || []),
      newHistoryEntry,
    ];

    // Prepare update data
    const updateData: any = {
      meta: {
        quote_status: status,
        quote_status_history: JSON.stringify(updatedHistory),
      },
    };

    // Set status-specific timestamps
    if (status === 'accepted') {
      updateData.meta.quote_accepted_at = now;
    } else if (status === 'rejected') {
      updateData.meta.quote_rejected_at = now;
      if (reason) {
        updateData.meta.quote_rejected_reason = reason;
      }
    } else if (status === 'sent') {
      updateData.meta.quote_sent_at = now;
    }

    // Update the quote data
    const updatedQuote: Quote = {
      ...currentQuote,
      status,
      updated_at: now,
      status_history: updatedHistory,
    };

    if (status === 'accepted') {
      updatedQuote.accepted_at = now;
    } else if (status === 'rejected') {
      updatedQuote.rejected_at = now;
      if (reason) {
        updatedQuote.rejected_reason = reason;
      }
    }

    // Update quote_data meta with full quote object
    updateData.meta.quote_data = JSON.stringify(updatedQuote);

    const response = await fetch(`${wpBase}/wp-json/wp/v2/quotes/${quoteId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData),
    });

    if (response.ok) {
      return updatedQuote;
    }

    return null;
  } catch (error) {
    console.error('Error updating quote status:', error);
    return null;
  }
}

/**
 * Get quote by ID (with optional customer ID for authorization)
 */
export async function getQuoteById(quoteId: string, customerId?: number): Promise<Quote | null> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) return null;

  const token = await getAuthToken();
  if (!token) return null;

  try {
    const response = await fetch(`${wpBase}/wp-json/wp/v2/quotes/${quoteId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (response.ok) {
      const post = await response.json();
      try {
        const quoteData = post.meta?.quote_data 
          ? JSON.parse(post.meta.quote_data) 
          : {
              quote_number: post.meta?.quote_number || post.title?.rendered || `QUOTE-${post.id}`,
              user_email: post.meta?.user_email || '',
              user_name: post.meta?.user_name || 'Customer',
              items: [],
              subtotal: 0,
              shipping: 0,
              discount: 0,
              total: post.meta?.quote_total || 0,
              status: post.meta?.quote_status || 'pending',
              expires_at: post.meta?.quote_expires_at || calculateExpiryDate(30),
            };
        
              // Parse status history if available
              let statusHistory = quoteData.status_history || [];
              if (post.meta?.quote_status_history) {
                try {
                  const parsed = JSON.parse(post.meta.quote_status_history);
                  if (Array.isArray(parsed)) {
                    statusHistory = parsed;
                  }
                } catch (e) {
                  console.debug('Could not parse status history, using default');
                }
              }

              // If no history exists but quote has status, create initial history entry
              if (statusHistory.length === 0 && quoteData.status) {
                statusHistory = [{
                  status: quoteData.status,
                  changed_at: post.date || quoteData.created_at || new Date().toISOString(),
                  changed_by: quoteData.user_name || 'Customer',
                  notes: 'Quote created',
                }];
              }

              // Parse comments if available
              let comments = quoteData.comments || [];
              if (post.meta?.quote_comments) {
                try {
                  const parsed = JSON.parse(post.meta.quote_comments);
                  if (Array.isArray(parsed)) {
                    comments = parsed;
                  }
                } catch (e) {
                  console.debug('Could not parse quote comments, using default');
                }
              }

              return {
                ...quoteData,
                id: post.id.toString(),
                quote_number: quoteData.quote_number || post.title?.rendered || `QUOTE-${post.id}`,
                created_at: post.date || quoteData.created_at || new Date().toISOString(),
                updated_at: post.modified || quoteData.updated_at || new Date().toISOString(),
                status_history: statusHistory,
                comments: comments,
              };
      } catch (parseError) {
        console.error('Error parsing quote data:', parseError);
        return null;
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching quote:', error);
    return null;
  }
}

/**
 * Mark quote as converted to order
 */
export async function markQuoteAsConverted(
  quoteId: string,
  orderId: number,
  orderNumber?: string
): Promise<Quote | null> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) return null;

  const token = await getAuthToken();
  if (!token) return null;

  try {
    // Get current quote
    const currentQuote = await getQuoteById(quoteId);
    if (!currentQuote) {
      console.error('Quote not found:', quoteId);
      return null;
    }

    const now = new Date().toISOString();

    // Create conversion history entry
    const conversionHistoryEntry: QuoteStatusHistory = {
      status: 'accepted',
      changed_at: now,
      changed_by: 'System',
      notes: `Converted to order ${orderNumber || orderId}`,
    };

    // Update quote data
    const updatedQuote: Quote = {
      ...currentQuote,
      status: 'accepted',
      updated_at: now,
      status_history: [
        ...(currentQuote.status_history || []),
        conversionHistoryEntry,
      ],
    };

    // Update quote meta
    const updateData: any = {
      meta: {
        quote_data: JSON.stringify(updatedQuote),
        quote_converted: 'yes',
        quote_order_id: orderId.toString(),
        quote_order_number: orderNumber || orderId.toString(),
        quote_converted_at: now,
      },
    };

    const response = await fetch(`${wpBase}/wp-json/wp/v2/quotes/${quoteId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData),
    });

    if (response.ok) {
      return updatedQuote;
    }

    return null;
  } catch (error) {
    console.error('Error marking quote as converted:', error);
    return null;
  }
}

/**
 * Delete quote by ID (with fallback by quote_number)
 */
export async function deleteQuoteById(quoteId: string): Promise<boolean> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) return false;

  const token = await getAuthToken();
  if (!token) return false;

  // Helper to delete by post ID
  const deleteByPostId = async (postId: string | number) => {
    const resp = await fetch(`${wpBase}/wp-json/wp/v2/quotes/${postId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return resp.ok;
  };

  // First attempt: assume quoteId is the WP post ID
  try {
    const direct = await deleteByPostId(quoteId);
    if (direct) return true;
  } catch {
    // ignore and try fallback
  }

  // Fallback: find by quote_number meta and delete
  try {
    const findResponse = await fetch(
      `${wpBase}/wp-json/wp/v2/quotes?meta_key=quote_number&meta_value=${encodeURIComponent(
        quoteId
      )}&per_page=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      }
    );

    if (!findResponse.ok) {
      return false;
    }

    const posts = await findResponse.json();
    if (!Array.isArray(posts) || posts.length === 0) {
      return false;
    }

    const postId = posts[0].id;
    return await deleteByPostId(postId);
  } catch (error) {
    console.error('Error deleting quote:', error);
    return false;
  }
}

