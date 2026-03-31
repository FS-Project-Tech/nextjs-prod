import { NextRequest, NextResponse } from 'next/server';
import { 
  responseCache, 
  invalidateProducts, 
  invalidateCategories, 
  invalidateAll,
  CACHE_TAGS,
} from '@/lib/cache';
import { getAuthToken } from '@/lib/auth-server';

/**
 * GET /api/cache
 * Get cache statistics (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const token = await getAuthToken();
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const stats = responseCache.getStats();
    const hitRatio = responseCache.getHitRatio();

    return NextResponse.json({
      success: true,
      stats: {
        ...stats,
        hitRatio: `${(hitRatio * 100).toFixed(2)}%`,
        hitRatioRaw: hitRatio,
      },
    });
  } catch (error) {
    console.error('Cache stats error:', error);
    return NextResponse.json(
      { error: 'Failed to get cache stats' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cache
 * Invalidate cache entries (admin only)
 * 
 * Body:
 * - action: 'invalidate_all' | 'invalidate_products' | 'invalidate_categories' | 'invalidate_tag'
 * - tag?: string (required if action is 'invalidate_tag')
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const token = await getAuthToken();
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action, tag } = body;

    let invalidated = 0;
    let message = '';

    switch (action) {
      case 'invalidate_all':
        invalidateAll();
        message = 'All cache entries invalidated';
        break;

      case 'invalidate_products':
        invalidated = responseCache.invalidateByTag(CACHE_TAGS.PRODUCTS);
        invalidateProducts();
        message = `Invalidated ${invalidated} product cache entries`;
        break;

      case 'invalidate_categories':
        invalidated = responseCache.invalidateByTag(CACHE_TAGS.CATEGORIES);
        invalidateCategories();
        message = `Invalidated ${invalidated} category cache entries`;
        break;

      case 'invalidate_tag':
        if (!tag) {
          return NextResponse.json(
            { error: 'Tag is required for invalidate_tag action' },
            { status: 400 }
          );
        }
        invalidated = responseCache.invalidateByTag(tag);
        message = `Invalidated ${invalidated} entries for tag: ${tag}`;
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: invalidate_all, invalidate_products, invalidate_categories, invalidate_tag' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      message,
      invalidated,
    });
  } catch (error) {
    console.error('Cache invalidation error:', error);
    return NextResponse.json(
      { error: 'Failed to invalidate cache' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/cache
 * Clear all cache (admin only)
 */
export async function DELETE(request: NextRequest) {
  try {
    // Check authentication
    const token = await getAuthToken();
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    invalidateAll();

    return NextResponse.json({
      success: true,
      message: 'All cache cleared',
    });
  } catch (error) {
    console.error('Cache clear error:', error);
    return NextResponse.json(
      { error: 'Failed to clear cache' },
      { status: 500 }
    );
  }
}

