import { NextRequest, NextResponse } from "next/server";
import { fetchPageBySlug } from "@/lib/cms-pages";
import { secureResponse } from "@/lib/security-headers";

/**
 * GET /api/cms/page/[slug]
 * Common API for theory/informational pages (shipping, terms, privacy, faq, etc.).
 * Fetches page content from WordPress by slug.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    if (!slug || typeof slug !== "string") {
      return secureResponse({ error: "Invalid slug" }, { status: 400 });
    }

    const page = await fetchPageBySlug(slug);
    if (!page) {
      return secureResponse({ error: "Page not found" }, { status: 404 });
    }

    return secureResponse({
      id: page.id,
      slug: page.slug,
      title: page.title?.rendered || "",
      content: page.content?.rendered || "",
      excerpt: page.excerpt?.rendered || "",
      date: page.date,
      modified: page.modified,
    });
  } catch (error) {
    console.error("[cms/page] Error:", error);
    return secureResponse({ error: "Failed to fetch page" }, { status: 500 });
  }
}
