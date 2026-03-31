/**
 * Quote Comments/Notes Management
 * Handles adding, retrieving, and managing quote comments
 */

import { getWpBaseUrl } from './auth';
import { getAuthToken } from './auth-server';
import type { Quote, QuoteComment } from './types/quote';

/**
 * Add a comment to a quote
 */
export async function addQuoteComment(
  quoteId: string,
  content: string,
  author: string,
  authorEmail: string,
  authorType: 'customer' | 'admin',
  isInternal: boolean = false
): Promise<QuoteComment | null> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    throw new Error('WordPress URL not configured');
  }

  const token = await getAuthToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  const now = new Date().toISOString();
  const commentId = `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const comment: QuoteComment = {
    id: commentId,
    quote_id: quoteId,
    author,
    author_email: authorEmail,
    author_type: authorType,
    content,
    created_at: now,
    is_internal: isInternal,
  };

  try {
    // Get current quote to preserve existing comments
    const { getQuoteById } = await import('./quote-storage');
    const quote = await getQuoteById(quoteId);
    
    if (!quote) {
      throw new Error('Quote not found');
    }

    // Add new comment to existing comments
    const existingComments = quote.comments || [];
    const updatedComments = [...existingComments, comment];

    // Update quote with new comment
    const response = await fetch(`${wpBase}/wp-json/wp/v2/quotes/${quoteId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        meta: {
          quote_comments: JSON.stringify(updatedComments),
          quote_data: JSON.stringify({
            ...quote,
            comments: updatedComments,
            updated_at: now,
          }),
        },
      }),
    });

    if (response.ok) {
      return comment;
    }

    return null;
  } catch (error) {
    console.error('Error adding quote comment:', error);
    throw error;
  }
}

/**
 * Get all comments for a quote
 */
export async function getQuoteComments(quoteId: string): Promise<QuoteComment[]> {
  const { getQuoteById } = await import('./quote-storage');
  const quote = await getQuoteById(quoteId);
  
  if (!quote) {
    return [];
  }

  return quote.comments || [];
}

/**
 * Delete a comment (admin only)
 */
export async function deleteQuoteComment(
  quoteId: string,
  commentId: string
): Promise<boolean> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    throw new Error('WordPress URL not configured');
  }

  const token = await getAuthToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  try {
    // Get current quote
    const { getQuoteById } = await import('./quote-storage');
    const quote = await getQuoteById(quoteId);
    
    if (!quote) {
      throw new Error('Quote not found');
    }

    // Remove comment from array
    const existingComments = quote.comments || [];
    const updatedComments = existingComments.filter(c => c.id !== commentId);

    // Update quote
    const response = await fetch(`${wpBase}/wp-json/wp/v2/quotes/${quoteId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        meta: {
          quote_comments: JSON.stringify(updatedComments),
          quote_data: JSON.stringify({
            ...quote,
            comments: updatedComments,
            updated_at: new Date().toISOString(),
          }),
        },
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Error deleting quote comment:', error);
    throw error;
  }
}

/**
 * Update a comment
 */
export async function updateQuoteComment(
  quoteId: string,
  commentId: string,
  content: string
): Promise<QuoteComment | null> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    throw new Error('WordPress URL not configured');
  }

  const token = await getAuthToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  try {
    // Get current quote
    const { getQuoteById } = await import('./quote-storage');
    const quote = await getQuoteById(quoteId);
    
    if (!quote) {
      throw new Error('Quote not found');
    }

    // Update comment in array
    const existingComments = quote.comments || [];
    const updatedComments = existingComments.map(c => {
      if (c.id === commentId) {
        return {
          ...c,
          content,
          updated_at: new Date().toISOString(),
        };
      }
      return c;
    });

    const updatedComment = updatedComments.find(c => c.id === commentId);
    if (!updatedComment) {
      throw new Error('Comment not found');
    }

    // Update quote
    const response = await fetch(`${wpBase}/wp-json/wp/v2/quotes/${quoteId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        meta: {
          quote_comments: JSON.stringify(updatedComments),
          quote_data: JSON.stringify({
            ...quote,
            comments: updatedComments,
            updated_at: new Date().toISOString(),
          }),
        },
      }),
    });

    if (response.ok) {
      return updatedComment;
    }

    return null;
  } catch (error) {
    console.error('Error updating quote comment:', error);
    throw error;
  }
}

