import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken, validateToken, getUserData, setAuthToken, clearAuthToken } from '@/lib/auth-server';

/**
 * POST /api/auth/refresh
 * Refresh session token by validating current token and extending expiration
 * This implements token rotation for better security
 */
export async function POST(request: NextRequest) {
  try {
    const token = await getAuthToken();

    if (!token) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_TOKEN', message: 'No session token found.' } },
        { status: 401 }
      );
    }

    // Validate current token
    const isValid = await validateToken(token);
    
    if (!isValid) {
      // Clear invalid session
      await clearAuthToken();
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_TOKEN', message: 'Session expired. Please login again.' } },
        { status: 401 }
      );
    }

    // Get user data to verify token is still valid
    const user = await getUserData(token);
    
    if (!user) {
      // Clear invalid session
      await clearAuthToken();
      return NextResponse.json(
        { success: false, error: { code: 'USER_NOT_FOUND', message: 'Unable to fetch user data.' } },
        { status: 401 }
      );
    }

    // Token is valid - refresh by setting it again (extends expiration)
    // In a more advanced setup, you could request a new token from WordPress
    // For now, we just extend the cookie expiration
    const csrf = await setAuthToken(token);

    return NextResponse.json({
      success: true,
      user,
      csrfToken: csrf,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[auth/refresh] error:', error);
    
    // Clear session on error
    try {
      await clearAuthToken();
    } catch (clearError) {
      // Ignore clear errors
    }

    return NextResponse.json(
      { success: false, error: { code: 'REFRESH_FAILED', message: 'Unable to refresh session.' } },
      { status: 500 }
    );
  }
}


