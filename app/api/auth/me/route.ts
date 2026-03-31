import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken, getUserData, validateToken, clearAuthToken } from '@/lib/auth-server';
import { secureResponse } from '@/lib/security-headers';
import { sanitizeUser } from '@/lib/sanitize';

/**
 * GET /api/auth/me
 * Get current authenticated user
 * Automatically clears invalid sessions
 */
export async function GET(req: NextRequest) {
  try {
    const token = await getAuthToken();

    if (!token) {
      return secureResponse(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Validate token (with timeout handling)
    let isValid = false;
    try {
      isValid = await validateToken(token);
    } catch (error) {
      // Timeout or connection errors - treat as invalid
      const err = error as Error & { code?: string };
      const isTimeoutError = 
        err?.name === 'AbortError' ||
        err?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
        err?.message?.includes('timeout') ||
        err?.message?.includes('aborted');
      
      if (!isTimeoutError) {
        console.error('Token validation error:', error);
      }
      isValid = false;
    }

    if (!isValid) {
      // Clear invalid session
      await clearAuthToken();
      return secureResponse(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Get user data (with timeout handling)
    let user = null;
    try {
      user = await getUserData(token);
    } catch (error) {
      // Timeout or connection errors - treat as unable to fetch
      const err = error as Error & { code?: string };
      const isTimeoutError = 
        err?.name === 'AbortError' ||
        err?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
        err?.message?.includes('timeout') ||
        err?.message?.includes('aborted');
      
      if (!isTimeoutError) {
        console.error('Get user data error:', error);
      }
      user = null;
    }

    if (!user) {
      // If user data can't be fetched, clear invalid session
      await clearAuthToken();
      return secureResponse(
        { error: 'Unable to fetch user data. Please login again.' },
        { status: 401 }
      );
    }

    // Sanitize user data before returning
    const sanitizedUser = sanitizeUser(user);

    return secureResponse(
      { user: sanitizedUser },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error) {
    // Catch any unexpected errors and return 401 instead of 500
    // Clear session on error
    try {
      await clearAuthToken();
    } catch {
      // Ignore clear errors
    }
    const err = error as Error & { code?: string };
    const isTimeoutError = 
      err?.name === 'AbortError' ||
      err?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
      err?.message?.includes('timeout') ||
      err?.message?.includes('aborted');
    
    if (!isTimeoutError) {
      console.error('Get user error:', error);
    }
    
    // Always return 401 instead of 500 for authentication errors
    return secureResponse(
      { error: 'Authentication failed. Please login again.' },
      { status: 401 }
    );
  }
}


