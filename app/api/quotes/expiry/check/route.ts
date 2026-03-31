import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken, getUserData } from '@/lib/auth-server';
import { checkAndUpdateExpiredQuotes, checkAllExpiredQuotes } from '@/lib/quote-expiry';

/**
 * POST /api/quotes/expiry/check
 * Check and update expired quotes
 * 
 * For authenticated users: checks their own quotes
 * For admins: can check all quotes (requires ?all=true)
 * 
 * Can be called by:
 * - Cron jobs (external service)
 * - WordPress cron
 * - Manual admin action
 */
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const checkAll = searchParams.get('all') === 'true';

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

    // Check if user is admin
    const isAdmin = user.roles?.includes('administrator') || user.roles?.includes('shop_manager');

    if (checkAll && !isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required to check all quotes' },
        { status: 403 }
      );
    }

    let result;

    if (checkAll && isAdmin) {
      // Check all quotes (admin only)
      result = await checkAllExpiredQuotes();
    } else {
      // Check user's own quotes
      result = await checkAndUpdateExpiredQuotes(user.email);
    }

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check expired quotes';
    console.error('Quote expiry check error:', error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/quotes/expiry/check
 * Same as POST, but for cron services that only support GET
 * Requires secret parameter for security
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const secret = searchParams.get('secret');
    const checkAll = searchParams.get('all') === 'true';

    // Verify secret for cron jobs
    const expectedSecret = process.env.QUOTE_EXPIRY_CHECK_SECRET;
    if (expectedSecret && secret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Invalid secret' },
        { status: 401 }
      );
    }

    // For cron jobs, we can check all quotes if secret is provided
    if (checkAll && expectedSecret && secret === expectedSecret) {
      const result = await checkAllExpiredQuotes();
      return NextResponse.json({
        success: true,
        ...result,
        timestamp: new Date().toISOString(),
      });
    }

    // Otherwise, require authentication
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

    const result = await checkAndUpdateExpiredQuotes(user.email);

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check expired quotes';
    console.error('Quote expiry check error:', error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

