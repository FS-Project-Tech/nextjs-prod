import { NextRequest } from "next/server";
import { fetchCategories, fetchPosts } from "@/lib/cms-posts";
import {
  CACHE_TAGS,
  CACHE_TTL,
  getSearchParamsKey,
  shouldBypassCache,
  withApiCache,
} from "@/lib/cache/api-cache";

export const dynamic = "force-dynamic";

type BlogListResponse = Awaited<ReturnType<typeof buildBlogResponse>>;

async function buildBlogResponse(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const per = Math.max(1, Math.min(24, parseInt(search.get("per") || "10", 10) || 10));
  const page = Math.max(1, parseInt(search.get("page") || "1", 10) || 1);
  const categoryRaw = (search.get("category") || "").trim();
  const categoryId =
    categoryRaw && Number.isFinite(parseInt(categoryRaw, 10))
      ? parseInt(categoryRaw, 10)
      : undefined;

  const [postsData, categories] = await Promise.all([
    fetchPosts({
      per,
      page,
      categories: categoryId && categoryId > 0 ? [categoryId] : undefined,
    }),
    fetchCategories(),
  ]);

  return {
    success: true as const,
    posts: postsData.posts,
    totalPages: postsData.totalPages,
    categories,
  };
}

export const GET = withApiCache<BlogListResponse>(buildBlogResponse, {
  ttl: CACHE_TTL.CMS,
  tags: [CACHE_TAGS.CMS],
  keyGenerator: (request) => `api:blog:list:${getSearchParamsKey(request) || "default"}`,
  shouldCache: (request) => !shouldBypassCache(request),
  httpCache: {
    maxAge: 60,
    sMaxAge: 300,
    staleWhileRevalidate: 600,
  },
});

