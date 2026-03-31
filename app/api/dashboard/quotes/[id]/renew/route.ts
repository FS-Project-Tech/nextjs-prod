import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken, getUserData } from '@/lib/auth-server';
import { getQuoteById } from '@/lib/quote-storage';
import { renewQuote } from '@/lib/quote-expiry';

/**
 * POST /api/dashboard/quotes/[id]/renew
 * Renew/extend a quote's expiry date
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { additionalDays = 30 } = body;

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

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized to renew this quote' },
        { status: 403 }
      );
    }

    // Validate additionalDays
    if (typeof additionalDays !== 'number' || additionalDays < 1 || additionalDays > 365) {
      return NextResponse.json(
        { error: 'Additional days must be between 1 and 365' },
        { status: 400 }
      );
    }

    // Renew quote
    const renewedQuote = await renewQuote(id, additionalDays);

    if (!renewedQuote) {
      return NextResponse.json(
        { error: 'Failed to renew quote' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      quote: renewedQuote,
      message: `Quote renewed for ${additionalDays} additional days`,
      newExpiryDate: renewedQuote.expires_at,
    });
  } catch (error: any) {
    console.error('Quote renewal error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to renew quote' },
      { status: 500 }
    );
  }
}

