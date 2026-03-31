import { NextRequest, NextResponse } from 'next/server';
import { getWpBaseUrl } from '@/lib/auth';
import { getAuthToken } from '@/lib/auth-server';
import { createWCSession, getWCSessionCookie, setWCSessionCookie } from '@/lib/woocommerce-session';
import { secureResponse } from '@/lib/security-headers';
import { applyCorsHeaders } from '@/lib/cors';

/**
 * GET /api/wc/session
 * Get current WooCommerce session information
 */
export async function GET(req: NextRequest) {
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      const response = new NextResponse(null, { status: 204 });
      return applyCorsHeaders(req, response);
    }

    const sessionToken = await getWCSessionCookie();
    const authToken = await getAuthToken();
    
    if (!authToken) {
      return secureResponse(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get session info from WordPress
    const wpBase = getWpBaseUrl();
    if (!wpBase) {
      return secureResponse(
        { error: 'WordPress URL not configured' },
        { status: 500 }
      );
    }

    try {
      const response = await fetch(`${wpBase}/wp-json/custom-auth/v1/session-info`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        // If endpoint doesn't exist, return basic session info
        return secureResponse({
          session_id: sessionToken || null,
          has_session: !!sessionToken,
        });
      }

      const data = await response.json();
      
      return secureResponse({
        session_id: sessionToken || data.wc_session_id || null,
        has_session: !!sessionToken || !!data.wc_session_id,
        customer_id: data.customer_id || null,
        user_id: data.user_id || null,
      });
    } catch (error) {
      // Fallback to basic session info
      return secureResponse({
        session_id: sessionToken || null,
        has_session: !!sessionToken,
      });
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('WC session GET error:', error);
    }
    
    const errorResponse = secureResponse(
      { error: 'Failed to get session information' },
      { status: 500 }
    );
    return applyCorsHeaders(req, errorResponse);
  }
}

/**
 * POST /api/wc/session
 * Create or refresh WooCommerce session
 */
export async function POST(req: NextRequest) {
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      const response = new NextResponse(null, { status: 204 });
      return applyCorsHeaders(req, response);
    }

    const body = await req.json().catch(() => ({}));
    const { customer_id } = body;
    
    const authToken = await getAuthToken();
    
    if (!authToken) {
      return secureResponse(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Create WooCommerce session
    const sessionToken = await createWCSession(customer_id);
    
    if (!sessionToken) {
      // Try to get session info from WordPress
      const wpBase = getWpBaseUrl();
      if (wpBase) {
        try {
          const response = await fetch(`${wpBase}/wp-json/custom-auth/v1/wc-session`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify({ customer_id }),
            cache: 'no-store',
          });

          if (response.ok) {
            const data = await response.json();
            if (data.session_token || data.session_id) {
              await setWCSessionCookie(data.session_token || data.session_id);
              
              return secureResponse({
                success: true,
                session_id: data.session_token || data.session_id,
              });
            }
          }
        } catch (error) {
          // Fallback to local session creation
        }
      }
      
      // Return success even if session creation failed
      // WooCommerce will create session on first cart operation
      return secureResponse({
        success: true,
        session_id: null,
        message: 'Session will be created on first cart operation',
      });
    }

    const successResponse = secureResponse({
      success: true,
      session_id: sessionToken,
    });
    return applyCorsHeaders(req, successResponse);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('WC session POST error:', error);
    }
    
    const errorResponse = secureResponse(
      { error: 'Failed to create session' },
      { status: 500 }
    );
    return applyCorsHeaders(req, errorResponse);
  }
}


