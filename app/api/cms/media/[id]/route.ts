import { NextRequest, NextResponse } from 'next/server';
import { getWpBaseUrl } from '@/lib/auth';
import { secureResponse } from '@/lib/security-headers';
import { applyCorsHeaders } from '@/lib/cors';

/**
 * GET /api/cms/media/[id]
 * Proxy endpoint for WordPress media (images)
 * Prevents direct browser → WordPress calls
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      const response = new NextResponse(null, { status: 204 });
      return applyCorsHeaders(req, response);
    }

    const mediaId = params.id;
    if (!mediaId || isNaN(Number(mediaId))) {
      return secureResponse(
        { error: 'Invalid media ID' },
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
    const response = await fetch(`${wpBase}/wp-json/wp/v2/media/${mediaId}`, {
      next: { revalidate: 3600 }, // Cache for 1 hour
      cache: 'force-cache',
    });

    if (!response.ok) {
      return secureResponse(
        { error: 'Media not found' },
        { status: response.status }
      );
    }

    const mediaData = await response.json();
    
    // Return sanitized media data
    const sanitized = {
      id: mediaData.id,
      source_url: mediaData.source_url,
      alt_text: mediaData.alt_text || '',
      title: mediaData.title?.rendered || mediaData.title || '',
      url: mediaData.source_url || mediaData.url || '',
      alt: mediaData.alt_text || mediaData.alt || '',
    };

    const apiResponse = secureResponse(sanitized, {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
    return applyCorsHeaders(req, apiResponse);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Media fetch error:', error);
    }
    return secureResponse(
      { error: 'Failed to fetch media' },
      { status: 500 }
    );
  }
}

