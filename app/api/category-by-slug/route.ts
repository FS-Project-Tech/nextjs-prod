import { NextRequest, NextResponse } from "next/server";
import { fetchCategoryBySlug } from "@/lib/woocommerce";
import { createPublicApiHandler, API_TIMEOUT } from "@/lib/api-middleware";
import { sanitizeObject } from "@/lib/sanitize";

async function getCategoryBySlug(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get('slug');
    
    if (!slug) {
      return NextResponse.json({ category: null });
    }
    
    // Fetch category directly
    const category = await fetchCategoryBySlug(slug).catch(() => null);
    
    // Sanitize category data
    const sanitizedCategory = category ? sanitizeObject(category) : null;
    
    // Set headers
    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    
    return NextResponse.json({ category: sanitizedCategory }, { headers });
  } catch (error) {
    return NextResponse.json({ category: null }, { status: 200 });
  }
}

// Export with security middleware
export const GET = createPublicApiHandler(getCategoryBySlug, {
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60, // 60 requests per minute
  },
  timeout: API_TIMEOUT.CATEGORIES, // 15 seconds
  sanitize: true,
  allowedMethods: ['GET'],
});


