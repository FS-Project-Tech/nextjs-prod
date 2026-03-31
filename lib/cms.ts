/**
 * CMS Utilities
 * Functions for fetching content from WordPress CMS
 */

const CMS_BASE_URL = process.env.WC_API_URL || '';

/**
 * Get WordPress base URL for REST API
 */
function getWpJsonBase(): string | null {
  if (!CMS_BASE_URL) return null;
  try {
    const url = new URL(CMS_BASE_URL);
    return `${url.protocol}//${url.host}/wp-json/wp/v2`;
  } catch {
    return null;
  }
}

export interface HeroSliders {
  left: Array<{ id: number; url: string; alt?: string }>;
  right: Array<{ id: number; url: string; alt?: string }>;
}

/**
 * Fetch hero slider images from WordPress
 * Falls back to placeholder images if CMS is unavailable
 */
export async function fetchHeroSliders(): Promise<HeroSliders> {
  const wpBase = getWpJsonBase();
  
  if (!wpBase) {
    // Return placeholder images if CMS URL is not configured
    return {
      left: [
        { id: 1, url: 'https://picsum.photos/800/600?random=1', alt: 'Hero Image 1' },
        { id: 2, url: 'https://picsum.photos/800/600?random=2', alt: 'Hero Image 2' },
      ],
      right: [
        { id: 3, url: 'https://picsum.photos/800/600?random=3', alt: 'Hero Image 3' },
        { id: 4, url: 'https://picsum.photos/800/600?random=4', alt: 'Hero Image 4' },
      ],
    };
  }

  try {
    // Try to fetch from WordPress REST API
    // This would typically be a custom endpoint or ACF field
    // For now, return placeholder images
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutMs = 10000; // 10 second timeout (increased from 3s for slow CMS responses)
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    
    const response = await fetch(`${wpBase}/media?media_type=image&per_page=4`, {
      cache: 'no-store', // Always fetch fresh data
      signal: controller?.signal,
    }).finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch media');
    }

    const media = await response.json();
    
    if (Array.isArray(media) && media.length >= 4) {
      const left = media.slice(0, 2)
        .map((item: any) => ({
          id: item.id,
          url: item.source_url || item.media_details?.sizes?.large?.source_url || item.guid?.rendered || '',
          alt: item.alt_text || item.title?.rendered || '',
        }))
        .filter((item: any) => item.url && item.url.trim() !== ''); // Filter out empty URLs
      
      const right = media.slice(2, 4)
        .map((item: any) => ({
          id: item.id,
          url: item.source_url || item.media_details?.sizes?.large?.source_url || item.guid?.rendered || '',
          alt: item.alt_text || item.title?.rendered || '',
        }))
        .filter((item: any) => item.url && item.url.trim() !== ''); // Filter out empty URLs
      
      // Only return if we have valid images
      if (left.length > 0 && right.length > 0) {
        return { left, right };
      }
    }
  } catch (error) {
    // Fall back to placeholder images on error
    const err = error as any;

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/85fce644-efa2-4bb9-867e-84b2679df9a3', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'debug-session',
        runId: 'cms-run1',
        hypothesisId: 'H-cms-1',
        location: 'cms.ts:92',
        message: 'CMS hero slider fetch failed, using placeholders',
        data: {
          name: err?.name,
          code: err?.code,
          message: err?.message,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    // Handle various timeout and connection error types
    const isTimeoutError = 
      err?.name === 'AbortError' ||
      err?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
      err?.code === 'ECONNABORTED' ||
      err?.code === 'ETIMEDOUT' ||
      err?.message?.includes('timeout') ||
      err?.message?.includes('aborted') ||
      err?.message?.includes('Connect Timeout');
    
    if (isTimeoutError) {
      // Connection or request timeout - expected for slow/unavailable CMS
      // Silently fall back to placeholders (no logging to reduce noise)
    } else if (err?.message && !(err instanceof Error ? err.message : 'An error occurred').includes('aborted')) {
      // Log actual errors (not timeouts/connection issues)
      // Only in development to avoid production noise
      if (process.env.NODE_ENV === 'development') {
        console.warn('Failed to fetch hero sliders from CMS:', err.message);
      }
    }
  }

  // Fallback to placeholder images
  return {
    left: [
      { id: 1, url: 'https://picsum.photos/800/600?random=1', alt: 'Hero Image 1' },
      { id: 2, url: 'https://picsum.photos/800/600?random=2', alt: 'Hero Image 2' },
    ],
    right: [
      { id: 3, url: 'https://picsum.photos/800/600?random=3', alt: 'Hero Image 3' },
      { id: 4, url: 'https://picsum.photos/800/600?random=4', alt: 'Hero Image 4' },
    ],
  };
}

