import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken, getUserData } from '@/lib/auth-server';
import { getQuoteById } from '@/lib/quote-storage';
import { addQuoteComment, deleteQuoteComment, updateQuoteComment } from '@/lib/quote-comments';
import { sendEmail } from '@/lib/quote-email';

/**
 * POST /api/dashboard/quotes/[id]/comments
 * Add a comment to a quote
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { content, isInternal = false } = body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json(
        { error: 'Comment content is required' },
        { status: 400 }
      );
    }

    const token = await getAuthToken();
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const user = await getUserData(token);
    if (!user || !user.email) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get quote to check ownership
    const quote = await getQuoteById(id);
    if (!quote) {
      return NextResponse.json(
        { error: 'Quote not found' },
        { status: 404 }
      );
    }

    // Check permissions
    const isOwner = quote.user_email.toLowerCase() === user.email.toLowerCase();
    const isAdmin = user.roles?.includes('administrator') || user.roles?.includes('shop_manager');

    // Only admins can add internal notes
    if (isInternal && !isAdmin) {
      return NextResponse.json(
        { error: 'Only admins can add internal notes' },
        { status: 403 }
      );
    }

    // Users can only comment on their own quotes
    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized to comment on this quote' },
        { status: 403 }
      );
    }

    // Add comment
    const authorType = isAdmin ? 'admin' : 'customer';
    const comment = await addQuoteComment(
      id,
      content.trim(),
      user.name || user.email,
      user.email,
      authorType,
      isInternal
    );

    if (!comment) {
      return NextResponse.json(
        { error: 'Failed to add comment' },
        { status: 500 }
      );
    }

    // Send email notification if not internal
    if (!isInternal) {
      try {
        // Notify the other party (customer if admin commented, admin if customer commented)
        const wpBase = process.env.NEXT_PUBLIC_WP_URL || '';
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';
        const quoteUrl = `${siteUrl}/dashboard/quotes/${id}`;

        if (isAdmin) {
          // Admin commented - notify customer
          await sendEmail({
            to: quote.user_email,
            subject: `New comment on Quote ${quote.quote_number}`,
            body: `A new comment has been added to your quote ${quote.quote_number}.\n\nComment: ${content}\n\nView quote: ${quoteUrl}`,
            html: `
              <p>A new comment has been added to your quote <strong>${quote.quote_number}</strong>.</p>
              <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 15px 0;">
                <p style="margin: 0;"><strong>${user.name || 'Admin'}:</strong></p>
                <p style="margin: 8px 0 0 0;">${content}</p>
              </div>
              <p><a href="${quoteUrl}" style="color: #14b8a6;">View Quote</a></p>
            `,
            type: 'quote_created', // Reuse email type
          });
        } else {
          // Customer commented - notify admin (optional, can be configured)
          // For now, we'll just log it
          console.log(`Customer ${quote.user_email} added comment to quote ${id}`);
        }
      } catch (emailError) {
        console.error('Failed to send comment notification email:', emailError);
        // Don't fail the request if email fails
      }
    }

    return NextResponse.json({
      success: true,
      comment,
      message: 'Comment added successfully',
    });
  } catch (error: any) {
    console.error('Quote comment error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to add comment' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/dashboard/quotes/[id]/comments
 * Delete a comment (admin only)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const commentId = searchParams.get('commentId');

    if (!commentId) {
      return NextResponse.json(
        { error: 'Comment ID is required' },
        { status: 400 }
      );
    }

    const token = await getAuthToken();
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const user = await getUserData(token);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Only admins can delete comments
    const isAdmin = user.roles?.includes('administrator') || user.roles?.includes('shop_manager');
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const success = await deleteQuoteComment(id, commentId);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to delete comment' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Comment deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete comment error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete comment' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/dashboard/quotes/[id]/comments
 * Update a comment
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { commentId, content } = body;

    if (!commentId || !content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json(
        { error: 'Comment ID and content are required' },
        { status: 400 }
      );
    }

    const token = await getAuthToken();
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const user = await getUserData(token);
    if (!user || !user.email) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get quote and comment to check ownership
    const quote = await getQuoteById(id);
    if (!quote) {
      return NextResponse.json(
        { error: 'Quote not found' },
        { status: 404 }
      );
    }

    const comment = quote.comments?.find(c => c.id === commentId);
    if (!comment) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }

    // Check permissions - users can only edit their own comments, admins can edit any
    const isOwner = comment.author_email.toLowerCase() === user.email.toLowerCase();
    const isAdmin = user.roles?.includes('administrator') || user.roles?.includes('shop_manager');

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized to edit this comment' },
        { status: 403 }
      );
    }

    const updatedComment = await updateQuoteComment(id, commentId, content.trim());

    if (!updatedComment) {
      return NextResponse.json(
        { error: 'Failed to update comment' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      comment: updatedComment,
      message: 'Comment updated successfully',
    });
  } catch (error: any) {
    console.error('Update comment error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update comment' },
      { status: 500 }
    );
  }
}

