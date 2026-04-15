import { NextRequest, NextResponse } from "next/server";
import { fetchPostBySlug } from "@/lib/cms-posts";
import { CACHE_TAGS, CACHE_TTL, shouldBypassCache, withApiCache } from "@/lib/cache/api-cache";

export const dynamic = "force-dynamic";

type BlogDetailParams = { params: Promise<{ slug: string }> | { slug: string } };

async function handleGet(
  request: NextRequest,
  { params }: BlogDetailParams
): Promise<NextResponse> {
  const resolved = await Promise.resolve(params);
  const slug = String(resolved?.slug || "").trim();
  if (!slug) {
    return NextResponse.json({ success: false, error: "Missing slug" }, { status: 400 });
  }

  const getCached = withApiCache(async () => {
    const post = await fetchPostBySlug(slug);
    if (!post) {
      return { success: false as const, error: "Not found" };
    }
    return { success: true as const, post };
  }, {
    ttl: CACHE_TTL.CMS,
    tags: [CACHE_TAGS.CMS, `${CACHE_TAGS.CMS}:blog:${slug}`],
    keyGenerator: () => `api:blog:detail:${slug}`,
    shouldCache: (req) => !shouldBypassCache(req),
    httpCache: {
      maxAge: 60,
      sMaxAge: 300,
      staleWhileRevalidate: 600,
    },
  });

  const response = await getCached(request);
  if (response.status === 200) {
    try {
      const body = await response.clone().json();
      if (body?.success === false && body?.error === "Not found") {
        return NextResponse.json(body, { status: 404, headers: response.headers });
      }
    } catch {
      // Fall through to returning original cached response.
    }
  }
  return response;
}

export async function GET(request: NextRequest, context: BlogDetailParams): Promise<NextResponse> {
  return handleGet(request, context);
}

