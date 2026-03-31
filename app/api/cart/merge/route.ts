import { NextRequest, NextResponse } from 'next/server';
import { getAuthToken } from '@/lib/auth-server';
import { syncCartAfterLogin } from '@/lib/graphql/auth-server';

/**
 * POST /api/cart/merge
 * 
 * Merge guest cart items into authenticated user's WooCommerce cart
 * Should be called after successful login with local cart items
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authToken = await getAuthToken();
    if (!authToken) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { items } = body;

    // Validate items
    if (!items || !Array.isArray(items)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_BODY', message: 'Cart items array is required' },
        },
        { status: 400 }
      );
    }

    // Validate item structure
    const validItems = items.filter((item: any) => {
      return (
        typeof item === 'object' &&
        typeof item.productId === 'number' &&
        item.productId > 0 &&
        typeof item.quantity === 'number' &&
        item.quantity > 0
      );
    });

    if (validItems.length === 0 && items.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_ITEMS', message: 'No valid cart items provided' },
        },
        { status: 400 }
      );
    }

    // Sync cart
    const result = await syncCartAfterLogin(validItems);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MERGE_FAILED', message: result.error || 'Failed to merge cart' },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      mergedCount: result.mergedCount,
      message: `Successfully merged ${result.mergedCount} item(s) into your cart`,
    }, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('[cart/merge] error:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: { code: 'MERGE_ERROR', message: 'Unable to merge cart' },
      },
      { status: 500 }
    );
  }
}

