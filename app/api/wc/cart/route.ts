// import { NextRequest, NextResponse } from 'next/server';
// import wcAPI from '@/lib/woocommerce';
// import { getWCSessionHeaders } from '@/lib/woocommerce-session';
// import { secureResponse } from '@/lib/security-headers';
// import { applyCorsHeaders } from '@/lib/cors';

// /**
//  * GET /api/wc/cart
//  * Get cart from WooCommerce (if using Store API)
//  * Note: WooCommerce REST API doesn't have a native cart endpoint
//  * This endpoint uses the Store API if available, otherwise returns empty
//  */
// export async function GET(req: NextRequest) {
//   try {
//     // Handle CORS preflight
//     if (req.method === 'OPTIONS') {
//       const response = new NextResponse(null, { status: 204 });
//       return applyCorsHeaders(req, response);
//     }

//     // Get WooCommerce session headers
//     const sessionHeaders = await getWCSessionHeaders();
    
//     try {
//       // Try to use WooCommerce Store API if available
//       const wpBase = process.env.WC_API_URL?.replace('/wp-json/wc/v3', '') || '';
//       if (wpBase) {
//         const response = await fetch(`${wpBase}/wp-json/wc/store/v1/cart`, {
//           method: 'GET',
//           headers: {
//             'Content-Type': 'application/json',
//             'Accept': 'application/json',
//             ...sessionHeaders,
//           },
//           cache: 'no-store',
//         });

//         if (response.ok) {
//           const cart = await response.json();
//           return secureResponse({ success: true, cart });
//         }
//       }
//     } catch (error) {
//       // Store API not available, continue with fallback
//     }

//     // Fallback: Return empty cart
//     // In a headless setup, cart is managed client-side
//     // WooCommerce REST API doesn't have a native cart endpoint
//     return secureResponse({
//       success: true,
//       cart: {
//         items: [],
//         totals: {
//           total_items: '0',
//           total_items_tax: '0',
//           total_fees: '0',
//           total_fees_tax: '0',
//           total_discount: '0',
//           total_discount_tax: '0',
//           total_shipping: '0',
//           total_shipping_tax: '0',
//           total_price: '0',
//           total_tax: '0',
//           tax_lines: [],
//         },
//         shipping_address: null,
//         billing_address: null,
//         payment_method: null,
//         payment_result: null,
//       },
//       message: 'Cart is managed client-side. Use /api/cart/sync to validate with WooCommerce.',
//     });
//   } catch (error) {
//     if (process.env.NODE_ENV === 'development') {
//       console.error('WC cart GET error:', error);
//     }
    
//     const errorResponse = secureResponse(
//       { error: 'Failed to get cart' },
//       { status: 500 }
//     );
//     return applyCorsHeaders(req, errorResponse);
//   }
// }

// /**
//  * POST /api/wc/cart
//  * Add item to cart (if using Store API)
//  * Note: This is a placeholder. In practice, use /api/cart/sync
//  */
// export async function POST(req: NextRequest) {
//   try {
//     // Handle CORS preflight
//     if (req.method === 'OPTIONS') {
//       const response = new NextResponse(null, { status: 204 });
//       return applyCorsHeaders(req, response);
//     }

//     const body = await req.json().catch(() => ({}));
//     const { product_id, quantity = 1, variation_id } = body;

//     if (!product_id) {
//       return secureResponse(
//         { error: 'Product ID is required' },
//         { status: 400 }
//       );
//     }

//     // Get WooCommerce session headers
//     const sessionHeaders = await getWCSessionHeaders();
    
//     try {
//       // Try to use WooCommerce Store API if available
//       const wpBase = process.env.WC_API_URL?.replace('/wp-json/wc/v3', '') || '';
//       if (wpBase) {
//         const response = await fetch(`${wpBase}/wp-json/wc/store/v1/cart/add-item`, {
//           method: 'POST',
//           headers: {
//             'Content-Type': 'application/json',
//             'Accept': 'application/json',
//             ...sessionHeaders,
//           },
//           body: JSON.stringify({
//             id: product_id,
//             quantity,
//             variation_id,
//           }),
//           cache: 'no-store',
//         });

//         if (response.ok) {
//           const cart = await response.json();
//           return secureResponse({ success: true, cart });
//         }
//       }
//     } catch (error) {
//       // Store API not available
//     }

//     // Fallback: Return error suggesting to use /api/cart/sync
//     return secureResponse(
//       {
//         error: 'WooCommerce Store API not available. Use /api/cart/sync to manage cart.',
//         suggestion: 'Use /api/cart/sync endpoint to add items and validate with WooCommerce.',
//       },
//       { status: 501 }
//     );
//   } catch (error) {
//     if (process.env.NODE_ENV === 'development') {
//       console.error('WC cart POST error:', error);
//     }
    
//     const errorResponse = secureResponse(
//       { error: 'Failed to add item to cart' },
//       { status: 500 }
//     );
//     return applyCorsHeaders(req, errorResponse);
//   }
// }




import { NextRequest, NextResponse } from 'next/server';
import { secureResponse } from '@/lib/security-headers';
import { applyCorsHeaders } from '@/lib/cors';

/**
 * GET /api/wc/cart
 * Loads cart linked to logged-in WordPress user (NOT browser session)
 */
export async function GET(req: NextRequest) {
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      const response = new NextResponse(null, { status: 204 });
      return applyCorsHeaders(req, response);
    }

    const wpBase = process.env.WC_API_URL?.replace('/wp-json/wc/v3', '') || '';

    if (!wpBase) {
      return secureResponse(
        { error: 'WordPress URL not configured' },
        { status: 500 }
      );
    }

    /**
     * 🔥 IMPORTANT:
     * Forward ALL cookies from request.
     * This includes WordPress login cookies.
     * This is what makes cart user-based instead of session-based.
     */
    const cookieHeader = req.headers.get('cookie') || '';

    const response = await fetch(`${wpBase}/wp-json/wc/store/v1/cart`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        Cookie: cookieHeader, // 🔥 critical fix
      },
      credentials: 'include',
      cache: 'no-store',
    });

    if (!response.ok) {
      const text = await response.text();
      return secureResponse(
        {
          error: 'Failed to fetch WooCommerce cart',
          status: response.status,
          body: text,
        },
        { status: response.status }
      );
    }

    const cart = await response.json();

    const successResponse = secureResponse({
      success: true,
      cart,
    });

    return applyCorsHeaders(req, successResponse);

  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('WC cart GET error:', error);
    }

    const errorResponse = secureResponse(
      { error: 'Failed to get cart' },
      { status: 500 }
    );

    return applyCorsHeaders(req, errorResponse);
  }
}

/**
 * POST /api/wc/cart
 * Add item to user-based cart
 */
export async function POST(req: NextRequest) {
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      const response = new NextResponse(null, { status: 204 });
      return applyCorsHeaders(req, response);
    }

    const body = await req.json().catch(() => ({}));
    const { product_id, quantity = 1, variation_id } = body;

    if (!product_id) {
      return secureResponse(
        { error: 'Product ID is required' },
        { status: 400 }
      );
    }

    const wpBase = process.env.WC_API_URL?.replace('/wp-json/wc/v3', '') || '';

    if (!wpBase) {
      return secureResponse(
        { error: 'WordPress URL not configured' },
        { status: 500 }
      );
    }

    /**
     * 🔥 Forward login cookies
     */
    const cookieHeader = req.headers.get('cookie') || '';

    const response = await fetch(`${wpBase}/wp-json/wc/store/v1/cart/add-item`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        Cookie: cookieHeader, // 🔥 critical fix
      },
      credentials: 'include',
      body: JSON.stringify({
        id: product_id,
        quantity,
        variation_id,
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      const text = await response.text();
      return secureResponse(
        {
          error: 'Failed to add item to cart',
          status: response.status,
          body: text,
        },
        { status: response.status }
      );
    }

    const cart = await response.json();

    const successResponse = secureResponse({
      success: true,
      cart,
    });

    return applyCorsHeaders(req, successResponse);

  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('WC cart POST error:', error);
    }

    const errorResponse = secureResponse(
      { error: 'Failed to add item to cart' },
      { status: 500 }
    );

    return applyCorsHeaders(req, errorResponse);
  }
}