import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken, getUserData } from '@/lib/auth-server';
import { fetchUserQuotes } from '@/lib/quote-storage';
import {
  calculateQuoteStatistics,
  generateQuoteTrends,
  getStatusDistribution,
  getMonthlyRevenue,
} from '@/lib/quote-analytics';

/**
 * GET /api/dashboard/quotes/analytics
 * Get quote analytics and statistics
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

    // Get date range from query params
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Fetch all quotes for user
    const quotes = await fetchUserQuotes(user.email);

    // Filter by date range if provided
    let filteredQuotes = quotes;
    if (startDate || endDate) {
      filteredQuotes = quotes.filter(quote => {
        const quoteDate = new Date(quote.created_at);
        if (startDate && quoteDate < new Date(startDate)) return false;
        if (endDate && quoteDate > new Date(endDate)) return false;
        return true;
      });
    }

    // Calculate statistics
    const statistics = calculateQuoteStatistics(filteredQuotes);
    const trends = generateQuoteTrends(filteredQuotes);
    const statusDistribution = getStatusDistribution(filteredQuotes);
    const monthlyRevenue = getMonthlyRevenue(filteredQuotes);

    return NextResponse.json({
      success: true,
      analytics: {
        statistics,
        trends,
        statusDistribution,
        monthlyRevenue,
      },
    });
  } catch (error) {
    console.error('Analytics error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch analytics';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

