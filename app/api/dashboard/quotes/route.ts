import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken, getUserData } from '@/lib/auth-server';
import { fetchUserQuotes } from '@/lib/quote-storage';

/**
 * GET /api/dashboard/quotes
 * Fetch all quote requests for the logged-in user
 */
export async function GET(req: NextRequest) {
  try {
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

    // Fetch quotes from database
    const quotes = await fetchUserQuotes(user.email);

    // Sort by date (newest first)
    quotes.sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return NextResponse.json({
      quotes,
      total: quotes.length,
    });

  } catch (error) {
    console.error('Quotes API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quotes', quotes: [], total: 0 },
      { status: 500 }
    );
  }
}


