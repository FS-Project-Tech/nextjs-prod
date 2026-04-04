import { NextRequest, NextResponse } from "next/server";
import { getWpBaseUrl } from "@/lib/wp-utils";
import { getToken } from "next-auth/jwt";

interface RouteParams {
  params: Promise<{ productId: string }>;
}

/**
 * DELETE /api/wishlist/:productId
 * Remove specific item from wishlist via WordPress plugin
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { productId: productIdParam } = await params;
    const productId = parseInt(productIdParam, 10);

    if (isNaN(productId) || productId <= 0) {
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
      wishlist: data.wishlist || [],
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

/**
 * GET /api/wishlist/:productId
 * Check if specific product is in wishlist
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { productId: productIdParam } = await params;
    const productId = parseInt(productIdParam, 10);

    if (isNaN(productId) || productId <= 0) {
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
      return NextResponse.json({
        success: true,
        productId,
        isInWishlist: false,
      });
    }

    const wpBase = getWpBaseUrl();
    if (!wpBase) {
      return NextResponse.json({
        success: true,
        productId,
        isInWishlist: false,
      });
    }

    // Get wishlist from WordPress plugin
    const response = await fetch(`${wpBase}/wp-json/custom/v1/wishlist`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({
        success: true,
        productId,
        isInWishlist: false,
      });
    }

    const data = await response.json();
    const wishlist = data.wishlist || [];
    const isInWishlist = wishlist.includes(productId);

    return NextResponse.json({
      success: true,
      productId,
      isInWishlist,
    });
  } catch (error) {
    console.error("Wishlist check error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to check wishlist",
      },
      { status: 500 }
    );
  }
}
