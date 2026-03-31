import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken, getUserData } from '@/lib/auth-server';
import { getQuoteById, deleteQuoteById } from '@/lib/quote-storage';

/**
 * GET /api/dashboard/quotes/[id]
 * Get a specific quote by ID
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const quote = await getQuoteById(id);
    
    if (!quote) {
      return NextResponse.json(
        { error: 'Quote not found' },
        { status: 404 }
      );
    }

    // Verify quote belongs to user
    if (quote.user_email.toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json(
        { error: 'Unauthorized access to quote' },
        { status: 403 }
      );
    }

    return NextResponse.json({ quote });

  } catch (error) {
    console.error('Quote detail API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quote' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/dashboard/quotes/[id]
 * Delete a specific quote by ID (owner or admin)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const quote = await getQuoteById(id);
    
    if (!quote) {
      return NextResponse.json(
        { error: 'Quote not found' },
        { status: 404 }
      );
    }

    const isOwner = quote.user_email.toLowerCase() === user.email.toLowerCase();
    const isAdmin = user.roles?.includes('administrator') || user.roles?.includes('shop_manager');

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized access to quote' },
        { status: 403 }
      );
    }

    const deleted = await deleteQuoteById(id);
    if (!deleted) {
      return NextResponse.json(
        { error: 'Failed to delete quote' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: 'Quote deleted' });

  } catch (error) {
    console.error('Quote delete API error:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete quote';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

