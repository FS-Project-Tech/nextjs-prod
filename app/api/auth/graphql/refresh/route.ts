import { NextRequest, NextResponse } from 'next/server';
import { serverRefreshToken, serverGetCurrentUser } from '@/lib/graphql/auth-server';

/**
 * POST /api/auth/graphql/refresh
 * 
 * Refresh JWT auth token using refresh token
 */
export async function POST(request: NextRequest) {
  try {
    const refreshResult = await serverRefreshToken();

    if (!refreshResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'REFRESH_FAILED', message: refreshResult.error || 'Token refresh failed' },
        },
        { status: 401 }
      );
    }

    // Get updated user info
    const user = await serverGetCurrentUser();

    return NextResponse.json({
      success: true,
      user,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    console.error('[auth/graphql/refresh] error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: { code: 'REFRESH_ERROR', message: 'Unable to refresh token.' },
      },
      { status: 500 }
    );
  }
}

