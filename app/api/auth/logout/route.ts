import { NextRequest, NextResponse } from 'next/server';
import { clearAuthToken, validateCSRFToken } from '@/lib/auth-server';
import { clearWCSessionCookie } from '@/lib/woocommerce-session';
import { secureResponse } from '@/lib/security-headers';

/**
 * POST /api/auth/logout
 * Secure logout endpoint that clears session and CSRF tokens
 */
export async function POST(request: NextRequest) {
  try {
    // Optional CSRF validation for logout (can be skipped for logout)
    const body = await request.json().catch(() => ({}));
    if (body.csrfToken) {
      const isValidCSRF = await validateCSRFToken(body.csrfToken);
      if (!isValidCSRF) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_CSRF', message: 'Invalid CSRF token.' } },
          { status: 403 }
        );
      }
    }

    // Clear all auth cookies (session + CSRF + WooCommerce session)
    await clearAuthToken();
    await clearWCSessionCookie();
    
    return secureResponse(
      { success: true },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error) {
    console.error('[auth/logout] error', error);
    return secureResponse(
      { success: false, error: { code: 'LOGOUT_FAILED', message: 'Unable to log out right now.' } },
      { status: 500 }
    );
  }
}

