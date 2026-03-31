import { NextRequest, NextResponse } from 'next/server';
import { getWpBaseUrl } from '@/lib/auth';
import { secureResponse } from '@/lib/security-headers';
import { applyCorsHeaders } from '@/lib/cors';

/**
 * GET /api/cms/taxonomy/[taxonomy]/[id]
 * Proxy endpoint for WordPress taxonomy terms with ACF fields
 * Prevents direct browser → WordPress calls
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { taxonomy: string; id: string } }
) {
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      const response = new NextResponse(null, { status: 204 });
      return applyCorsHeaders(req, response);
    }

    const { taxonomy, id } = params;
    if (!taxonomy || !id || isNaN(Number(id))) {
      return secureResponse(
        { error: 'Invalid taxonomy or ID' },
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

    // Fetch from WordPress (server-side only)
    const response = await fetch(`${wpBase}/wp-json/wp/v2/${taxonomy}/${id}?_fields=acf`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      return secureResponse(
        { error: 'Taxonomy term not found' },
        { status: response.status }
      );
    }

    const termData = await response.json();
    
    const apiResponse = secureResponse(termData, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
    return applyCorsHeaders(req, apiResponse);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Taxonomy fetch error:', error);
    }
    return secureResponse(
      { error: 'Failed to fetch taxonomy term' },
      { status: 500 }
    );
  }
}

