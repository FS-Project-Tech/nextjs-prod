// import { NextRequest, NextResponse } from 'next/server';
// import { getWpBaseUrl } from '@/lib/wp-utils';
// import { getToken } from 'next-auth/jwt';

// /**
//  * GET /api/wishlist
//  * Fetch current user's wishlist from WordPress plugin
//  */
// export async function GET(req: NextRequest) {
//   try {
//     const nextAuthToken = await getToken({
//       req,
//       secret: process.env.NEXTAUTH_SECRET,
//     });
//     const token = (nextAuthToken as any)?.wpToken;

//     if (!token) {
//       return NextResponse.json({
//         success: true,
//         wishlist: [],
//         authenticated: false,
//       });
//     }

//     const wpBase = getWpBaseUrl();
//     if (!wpBase) {
//       return NextResponse.json({
//         success: false,
//         wishlist: [],
//         error: 'WordPress URL not configured',
//       }, { status: 500 });
//     }

//     // Fetch from WordPress wishlist plugin
//     const response = await fetch(`${wpBase}/wp-json/custom/v1/wishlist`, {
//       headers: {
//         'Authorization': `Bearer ${token}`,
//         'Content-Type': 'application/json',
//       },
//       cache: 'no-store',
//     });

//     if (!response.ok) {
//       if (response.status === 401) {
//         return NextResponse.json({
//           success: false,
//           wishlist: [],
//           error: 'Authentication required',
//           requiresAuth: true,
//         }, { status: 401 });
//       }
//       return NextResponse.json({
//         success: true,
//         wishlist: [],
//         authenticated: true,
//       });
//     }

//     const data = await response.json();

//     return NextResponse.json({
//       success: true,
//       wishlist: data.wishlist || [],
//       authenticated: true,
//     });
//   } catch (error) {
//     console.error('Wishlist GET error:', error);
//     return NextResponse.json({
//       success: false,
//       wishlist: [],
//       error: 'Failed to fetch wishlist',
//     }, { status: 500 });
//   }
// }

// /**
//  * POST /api/wishlist
//  * Add item to wishlist via WordPress plugin
//  */
// export async function POST(req: NextRequest) {
//   try {
//     const body = await req.json();
//     const { productId } = body;

//     if (!productId || (typeof productId !== 'number' && typeof productId !== 'string')) {
//       return NextResponse.json({
//         success: false,
//         error: 'Invalid product ID',
//       }, { status: 400 });
//     }

//     const nextAuthToken = await getToken({
//       req,
//       secret: process.env.NEXTAUTH_SECRET,
//     });
//     const token = (nextAuthToken as any)?.wpToken;

//     if (!token) {
//       return NextResponse.json({
//         success: false,
//         error: 'Authentication required',
//         requiresAuth: true,
//       }, { status: 401 });
//     }

//     const wpBase = getWpBaseUrl();
//     if (!wpBase) {
//       return NextResponse.json({
//         success: false,
//         error: 'WordPress URL not configured',
//       }, { status: 500 });
//     }

//     // Add to WordPress wishlist plugin
//     const response = await fetch(`${wpBase}/wp-json/custom/v1/wishlist/add`, {
//       method: 'POST',
//       headers: {
//         'Authorization': `Bearer ${token}`,
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify({ product_id: Number(productId) }),
//       cache: 'no-store',
//     });

//     if (!response.ok) {
//       if (response.status === 401) {
//         return NextResponse.json({
//           success: false,
//           error: 'Authentication required',
//           requiresAuth: true,
//         }, { status: 401 });
//       }
//       const errorData = await response.json().catch(() => ({}));
//       return NextResponse.json({
//         success: false,
//         error: errorData.message || 'Failed to add to wishlist',
//       }, { status: response.status });
//     }

//     const data = await response.json();

//     return NextResponse.json({
//       success: true,
//       wishlist: data.wishlist || [],
//       message: 'Product added to wishlist',
//     });
//   } catch (error) {
//     console.error('Wishlist POST error:', error);
//     return NextResponse.json({
//       success: false,
//       error: 'Failed to add to wishlist',
//     }, { status: 500 });
//   }
// }

// /**
//  * DELETE /api/wishlist
//  * Remove item from wishlist via WordPress plugin
//  */
// export async function DELETE(req: NextRequest) {
//   try {
//     let productId: number | undefined;

//     try {
//       const body = await req.json();
//       productId = Number(body.productId);
//     } catch {
//       const searchParams = req.nextUrl.searchParams;
//       const idParam = searchParams.get('productId');
//       if (idParam) {
//         productId = parseInt(idParam, 10);
//       }
//     }

//     if (!productId || isNaN(productId) || productId <= 0) {
//       return NextResponse.json({
//         success: false,
//         error: 'Invalid product ID',
//       }, { status: 400 });
//     }

//     const nextAuthToken = await getToken({
//       req,
//       secret: process.env.NEXTAUTH_SECRET,
//     });
//     const token = (nextAuthToken as any)?.wpToken;

//     if (!token) {
//       return NextResponse.json({
//         success: false,
//         error: 'Authentication required',
//         requiresAuth: true,
//       }, { status: 401 });
//     }

//     const wpBase = getWpBaseUrl();
//     if (!wpBase) {
//       return NextResponse.json({
//         success: false,
//         error: 'WordPress URL not configured',
//       }, { status: 500 });
//     }

//     // Remove from WordPress wishlist plugin
//     const response = await fetch(`${wpBase}/wp-json/custom/v1/wishlist/remove`, {
//       method: 'POST',
//       headers: {
//         'Authorization': `Bearer ${token}`,
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify({ product_id: productId }),
//       cache: 'no-store',
//     });

//     if (!response.ok) {
//       if (response.status === 401) {
//         return NextResponse.json({
//           success: false,
//           error: 'Authentication required',
//           requiresAuth: true,
//         }, { status: 401 });
//       }
//       const errorData = await response.json().catch(() => ({}));
//       return NextResponse.json({
//         success: false,
//         error: errorData.message || 'Failed to remove from wishlist',
//       }, { status: response.status });
//     }

//     const data = await response.json();

//     return NextResponse.json({
//       success: true,
//       wishlist: data.wishlist || [],
//       message: 'Product removed from wishlist',
//     });
//   } catch (error) {
//     console.error('Wishlist DELETE error:', error);
//     return NextResponse.json({
//       success: false,
//       error: 'Failed to remove from wishlist',
//     }, { status: 500 });
//   }
// }

import { NextRequest, NextResponse } from "next/server";
import { getWpBaseUrl } from "@/lib/wp-utils";
import { getToken } from "next-auth/jwt";

/** Coerce WordPress wishlist IDs to positive integers (WP may return strings). */
function normalizeWishlistIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const entry of raw) {
    const n =
      typeof entry === "number"
        ? entry
        : typeof entry === "string"
          ? parseInt(entry, 10)
          : Number(entry);
    if (!Number.isFinite(n) || n <= 0) continue;
    const id = Math.trunc(n);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * GET /api/wishlist
 * Fetch current user's wishlist from WordPress plugin
 */
export async function GET(req: NextRequest) {
  try {
    const nextAuthToken = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });
    const token = (nextAuthToken as any)?.wpToken;

    if (!token) {
      return NextResponse.json({
        success: true,
        wishlist: [],
        authenticated: false,
      });
    }

    const wpBase = getWpBaseUrl();
    if (!wpBase) {
      return NextResponse.json(
        {
          success: false,
          wishlist: [],
          error: "WordPress URL not configured",
        },
        { status: 500 }
      );
    }

    // Fetch from WordPress wishlist plugin
    const response = await fetch(`${wpBase}/wp-json/custom/v1/wishlist`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      if (response.status === 401) {
        return NextResponse.json(
          {
            success: false,
            wishlist: [],
            error: "Authentication required",
            requiresAuth: true,
          },
          { status: 401 }
        );
      }
      return NextResponse.json({
        success: true,
        wishlist: [],
        authenticated: true,
      });
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      wishlist: data.wishlist || [],
      authenticated: true,
    });
  } catch (error) {
    console.error("Wishlist GET error:", error);
    return NextResponse.json(
      {
        success: false,
        wishlist: [],
        error: "Failed to fetch wishlist",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/wishlist
 * Add item to wishlist via WordPress plugin
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { productId } = body;

    if (!productId || (typeof productId !== "number" && typeof productId !== "string")) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid product ID",
        },
        { status: 400 }
      );
    }

    const nextAuthToken = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });
    const token = (nextAuthToken as any)?.wpToken;

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication required",
          requiresAuth: true,
        },
        { status: 401 }
      );
    }

    const wpBase = getWpBaseUrl();
    if (!wpBase) {
      return NextResponse.json(
        {
          success: false,
          error: "WordPress URL not configured",
        },
        { status: 500 }
      );
    }

    // Add to WordPress wishlist plugin
    const response = await fetch(`${wpBase}/wp-json/custom/v1/wishlist/add`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ product_id: Number(productId) }),
      cache: "no-store",
    });

    if (!response.ok) {
      if (response.status === 401) {
        return NextResponse.json(
          {
            success: false,
            error: "Authentication required",
            requiresAuth: true,
          },
          { status: 401 }
        );
      }
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        {
          success: false,
          error: errorData.message || "Failed to add to wishlist",
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      wishlist: normalizeWishlistIds(data.wishlist),
      message: "Product added to wishlist",
    });
  } catch (error) {
    console.error("Wishlist POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to add to wishlist",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/wishlist
 * Remove item from wishlist via WordPress plugin
 */
export async function DELETE(req: NextRequest) {
  try {
    let productId: number | undefined;

    try {
      const body = await req.json();
      productId = Number(body.productId);
    } catch {
      const searchParams = req.nextUrl.searchParams;
      const idParam = searchParams.get("productId");
      if (idParam) {
        productId = parseInt(idParam, 10);
      }
    }

    if (!productId || isNaN(productId) || productId <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid product ID",
        },
        { status: 400 }
      );
    }

    const nextAuthToken = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });
    const token = (nextAuthToken as any)?.wpToken;

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication required",
          requiresAuth: true,
        },
        { status: 401 }
      );
    }

    const wpBase = getWpBaseUrl();
    if (!wpBase) {
      return NextResponse.json(
        {
          success: false,
          error: "WordPress URL not configured",
        },
        { status: 500 }
      );
    }

    // Remove from WordPress wishlist plugin
    const response = await fetch(`${wpBase}/wp-json/custom/v1/wishlist/remove`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ product_id: productId }),
      cache: "no-store",
    });

    if (!response.ok) {
      if (response.status === 401) {
        return NextResponse.json(
          {
            success: false,
            error: "Authentication required",
            requiresAuth: true,
          },
          { status: 401 }
        );
      }
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        {
          success: false,
          error: errorData.message || "Failed to remove from wishlist",
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      wishlist: normalizeWishlistIds(data.wishlist),
      message: "Product removed from wishlist",
    });
  } catch (error) {
    console.error("Wishlist DELETE error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to remove from wishlist",
      },
      { status: 500 }
    );
  }
}
