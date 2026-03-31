import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken, getUserData } from '@/lib/auth-server';
import { getQuoteById, updateQuoteStatus } from '@/lib/quote-storage';
import { 
  sendQuoteSentEmail, 
  sendQuoteAcceptedEmail, 
  sendQuoteRejectedEmail 
} from '@/lib/quote-email';
import type { Quote } from '@/lib/types/quote';

/**
 * POST /api/dashboard/quotes/[id]/status
 * Update quote status (for admins or users accepting/rejecting)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { status, reason, notes } = body;

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

    // Validate status
    const validStatuses: Quote['status'][] = ['pending', 'sent', 'accepted', 'rejected', 'expired'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') },
        { status: 400 }
      );
    }

    // Get current quote
    const currentQuote = await getQuoteById(id);
    if (!currentQuote) {
      return NextResponse.json(
        { error: 'Quote not found' },
        { status: 404 }
      );
    }

    // Check permissions
    // Users can only accept/reject their own quotes
    // Admins can set any status
    const isOwner = currentQuote.user_email.toLowerCase() === user.email.toLowerCase();
    const isAdmin = user.roles?.includes('administrator') || user.roles?.includes('shop_manager');

    if (!isAdmin) {
      // Non-admin users can only accept or reject their own quotes
      if (!isOwner) {
        return NextResponse.json(
          { error: 'Unauthorized to update this quote' },
          { status: 403 }
        );
      }

      // Users can only change status to accepted or rejected
      if (status !== 'accepted' && status !== 'rejected') {
        return NextResponse.json(
          { error: 'You can only accept or reject quotes' },
          { status: 403 }
        );
      }

      // Users can only accept/reject quotes that are in 'sent' status
      if (currentQuote.status !== 'sent') {
        return NextResponse.json(
          { error: `Cannot ${status} a quote with status: ${currentQuote.status}` },
          { status: 400 }
        );
      }
    }

    // Update status
    const changedBy = isAdmin 
      ? `Admin: ${user.name || user.email}`
      : user.name || user.email;

    const updatedQuote = await updateQuoteStatus(
      id,
      status,
      changedBy,
      reason,
      notes
    );

    if (!updatedQuote) {
      return NextResponse.json(
        { error: 'Failed to update quote status' },
        { status: 500 }
      );
    }

    // Send email notifications based on status change
    try {
      if (status === 'sent') {
        await sendQuoteSentEmail(updatedQuote);
      } else if (status === 'accepted') {
        await sendQuoteAcceptedEmail(updatedQuote);
      } else if (status === 'rejected') {
        await sendQuoteRejectedEmail(updatedQuote, reason);
      }
    } catch (emailError) {
      // Log but don't fail the request if email fails
      console.error('Failed to send quote status email:', emailError);
    }

    return NextResponse.json({
      success: true,
      quote: updatedQuote,
      message: `Quote status updated to ${status}`,
    });

  } catch (error) {
    console.error('Quote status update error:', error);
    return NextResponse.json(
      { error: 'Failed to update quote status' },
      { status: 500 }
    );
  }
}

