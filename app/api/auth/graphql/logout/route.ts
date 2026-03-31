import { NextRequest, NextResponse } from 'next/server';
import { serverLogout } from '@/lib/graphql/auth-server';

/**
 * POST /api/auth/graphql/logout
 * 
 * Logout user and clear all auth cookies
 */
export async function POST(request: NextRequest) {
  try {
    await serverLogout();

    return NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    console.error('[auth/graphql/logout] error:', error);
    
    // Still return success - user should be logged out even if there's an error
    return NextResponse.json({
      success: true,
      message: 'Logged out',
    });
  }
}

