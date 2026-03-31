import { NextRequest, NextResponse } from 'next/server';
import { getWpBaseUrl } from '@/lib/auth';
import { rateLimit } from '@/lib/api-security';
import { sanitizeEmail } from '@/lib/sanitize';
import { secureResponse } from '@/lib/security-headers';

/**
 * POST /api/auth/forgot
 * Request password reset via WooCommerce/WordPress
 * Protected with rate limiting to prevent abuse
 */
export async function POST(req: NextRequest) {
  // Apply rate limiting (stricter for password reset)
  const rateLimitCheck = await rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 3, // 3 attempts per 15 minutes per IP
  })(req);

  if (rateLimitCheck) {
    return rateLimitCheck;
  }

  try {
    const body = await req.json();
    let { email } = body;

    // Sanitize email
    email = sanitizeEmail(email);

    if (!email) {
      return secureResponse(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const wpBase = getWpBaseUrl();
    if (!wpBase) {
      return secureResponse(
        { error: 'WordPress URL not configured' },
        { status: 500 }
      );
    }

    // Use WordPress lost password endpoint
    // Note: This requires WordPress to be configured with email sending
    const response = await fetch(`${wpBase}/wp-json/bdpwr/v1/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
      cache: 'no-store',
    });

    // Even if the endpoint doesn't exist or fails, return success for security
    // (don't reveal if email exists)
    return secureResponse({
      message: 'If an account exists with this email, a password reset link has been sent.',
    });
  } catch (error) {
    // Log error but don't expose details
    if (process.env.NODE_ENV === 'development') {
      console.error('Forgot password error:', error);
    }
    // Return success even on error for security (prevent email enumeration)
    return secureResponse({
      message: 'If an account exists with this email, a password reset link has been sent.',
    });
  }
}


