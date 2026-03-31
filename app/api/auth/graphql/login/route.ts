import { NextRequest, NextResponse } from 'next/server';
import { serverLogin, syncCartAfterLogin } from '@/lib/graphql/auth-server';
import { rateLimit } from '@/lib/api-security';
import { sanitizeString } from '@/lib/sanitize';
import { validateRedirect, ALLOWED_REDIRECT_PATHS } from '@/lib/redirectUtils';

/**
 * POST /api/auth/graphql/login
 * 
 * GraphQL-based login with automatic fallback to REST
 * Includes cart merge functionality
 */
export async function POST(request: NextRequest) {
  // Apply rate limiting
  const rateLimitCheck = await rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // 5 attempts per 15 minutes per IP
  })(request);

  if (rateLimitCheck) {
    return rateLimitCheck;
  }

  try {
    const body = await request.json();
    let { username, password, cartItems, redirectTo } = body;

    // Sanitize input
    username = typeof username === 'string' ? sanitizeString(username.trim()) : '';
    password = typeof password === 'string' ? password : '';

    // Validate required fields
    if (!username || !password) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_BODY', message: 'Username and password are required.' },
        },
        { status: 400 }
      );
    }

    // Validate username length
    if (username.length < 3 || username.length > 255) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_USERNAME', message: 'Invalid username format.' },
        },
        { status: 400 }
      );
    }

    // Password length validation
    if (password.length < 6 || password.length > 128) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_PASSWORD', message: 'Password must be between 6 and 128 characters.' },
        },
        { status: 400 }
      );
    }

    // Attempt login
    const loginResult = await serverLogin(username, password);

    if (!loginResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'LOGIN_FAILED', message: loginResult.error || 'Login failed' },
        },
        { status: 401 }
      );
    }

    // Merge cart items if provided
    let cartSyncResult = null;
    if (cartItems && Array.isArray(cartItems) && cartItems.length > 0) {
      cartSyncResult = await syncCartAfterLogin(cartItems);
    }

    // Validate redirect URL
    const safeRedirect = validateRedirect(
      redirectTo,
      ALLOWED_REDIRECT_PATHS,
      '/dashboard'
    );

    return NextResponse.json({
      success: true,
      user: loginResult.user,
      redirectTo: safeRedirect,
      cartSync: cartSyncResult,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    console.error('[auth/graphql/login] error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: { code: 'LOGIN_ERROR', message: 'Unable to sign in right now.' },
      },
      { status: 500 }
    );
  }
}

