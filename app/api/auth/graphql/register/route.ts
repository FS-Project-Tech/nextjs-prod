import { NextRequest, NextResponse } from 'next/server';
import { serverRegister } from '@/lib/graphql/auth-server';
import { rateLimit } from '@/lib/api-security';
import { sanitizeString, sanitizeEmail } from '@/lib/sanitize';
import { validateRedirect, ALLOWED_REDIRECT_PATHS } from '@/lib/redirectUtils';

/**
 * POST /api/auth/graphql/register
 * 
 * GraphQL-based registration with automatic fallback to REST
 */
export async function POST(request: NextRequest) {
  // Apply rate limiting (stricter for registration)
  const rateLimitCheck = await rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 5, // 5 registrations per hour per IP
  })(request);

  if (rateLimitCheck) {
    return rateLimitCheck;
  }

  try {
    const body = await request.json();
    let { username, email, password, firstName, lastName, redirectTo } = body;

    // Sanitize input
    username = typeof username === 'string' ? sanitizeString(username.trim()) : '';
    email = typeof email === 'string' ? sanitizeEmail(email.trim()) : '';
    password = typeof password === 'string' ? password : '';
    firstName = typeof firstName === 'string' ? sanitizeString(firstName.trim()) : undefined;
    lastName = typeof lastName === 'string' ? sanitizeString(lastName.trim()) : undefined;

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_BODY', message: 'Email and password are required.' },
        },
        { status: 400 }
      );
    }

    // Use email as username if not provided
    if (!username) {
      username = email.split('@')[0];
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_EMAIL', message: 'Invalid email format.' },
        },
        { status: 400 }
      );
    }

    // Password length validation
    if (password.length < 8 || password.length > 128) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_PASSWORD', message: 'Password must be between 8 and 128 characters.' },
        },
        { status: 400 }
      );
    }

    // Attempt registration
    const registerResult = await serverRegister({
      username,
      email,
      password,
      firstName,
      lastName,
    });

    if (!registerResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'REGISTER_FAILED', message: registerResult.error || 'Registration failed' },
        },
        { status: 400 }
      );
    }

    // Validate redirect URL
    const safeRedirect = validateRedirect(
      redirectTo,
      ALLOWED_REDIRECT_PATHS,
      '/dashboard'
    );

    return NextResponse.json({
      success: true,
      user: registerResult.user,
      redirectTo: safeRedirect,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    console.error('[auth/graphql/register] error:', error);
    
    // Handle specific error messages
    const message = error.message || 'Unable to register right now.';
    const isDuplicate = message.toLowerCase().includes('exists') || 
                        message.toLowerCase().includes('duplicate');
    
    return NextResponse.json(
      {
        success: false,
        error: { 
          code: isDuplicate ? 'USER_EXISTS' : 'REGISTER_ERROR', 
          message: isDuplicate ? 'An account with this email already exists.' : message,
        },
      },
      { status: isDuplicate ? 409 : 500 }
    );
  }
}

