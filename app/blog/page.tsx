import type { Metadata } from "next";
import Link from "next/link";
import PrefetchLink from "@/components/PrefetchLink";
import { fetchPosts, fetchCategories } from "@/lib/cms-posts";
import { BreadcrumbStructuredData } from "@/components/StructuredData";

export const metadata: Metadata = {
  title: "Blog",
  description: "Articles, guides, and updates from Joya Medical Supplies.",
  alternates: { canonical: "/blog" },
};

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; category?: string }>;
}) {
  const { page = "1", category } = await searchParams;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const perPage = 10;

  const [postsData, categories] = await Promise.all([
    fetchPosts({
      per: perPage,
      page: pageNum,
      categories: category ? [parseInt(category, 10)] : undefined,
    }),
    fetchCategories(),
  ]);

  const posts = postsData.posts;
  const totalPages = postsData.totalPages;

  const breadcrumbItems = [{ label: "Home", href: "/" }, { label: "Blog" }];
  function buildPageUrl(page: number) {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (category) params.set("category", category);
    const q = params.toString();
    return q ? `/blog?${q}` : "/blog";
  }
  return (
    <>
      <BreadcrumbStructuredData items={breadcrumbItems} />
      <div className="min-h-screen bg-gray-50">
        <div className="border-b border-gray-200 bg-white">
          <div className="container mx-auto px-4 py-6 sm:px-6 md:px-8">
            <nav className="mb-3 text-sm text-gray-500">
              <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <li>
                  <PrefetchLink href="/" className="hover:text-teal-600 transition-colors">
                    Home
                  </PrefetchLink>
                </li>
                <li aria-hidden>/</li>
                <li className="text-gray-900 font-medium">Blog</li>
              </ol>
            </nav>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Blog</h1>
          </div>
        </div>

        <div className="container mx-auto px-4 py-10 sm:px-6 md:px-8">
          {/* Category filter */}
          {categories.length > 0 && (
            <div className="mb-8 flex flex-wrap gap-2">
              <Link
                href="/blog"
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  !category
                    ? "bg-teal-600 text-white"
                    : "bg-white text-gray-700 border border-gray-200 hover:border-teal-300"
                }`}
              >
                All
              </Link>
              {categories.map((cat) => (
                <Link
                  key={cat.id}
                  href={`/blog?category=${cat.id}`}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    category === String(cat.id)
                      ? "bg-teal-600 text-white"
                      : "bg-white text-gray-700 border border-gray-200 hover:border-teal-300"
                  }`}
                >
                  {cat.name}
                </Link>
              ))}
            </div>
          )}

          {/* Post list - basic card design */}
          <ul className="space-y-6">
            {posts.map((post) => {
              const title = post.title?.rendered?.replace(/<[^>]+>/g, "").trim() || "Untitled";
              const excerpt =
                post.excerpt?.rendered
                  ?.replace(/<[^>]+>/g, "")
                  .trim()
                  .slice(0, 200) || "";
              const img = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
              return (
                <li key={post.id}>
                  <Link
                    href={`/blog/${post.slug}`}
                    className="block rounded-xl border border-gray-200 bg-white p-6 transition-all hover:border-teal-300 hover:shadow-md"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      {img && (
                        <div className="h-32 w-full shrink-0 sm:h-24 sm:w-40 overflow-hidden rounded-lg bg-gray-100">
                          <img src={img} alt="" className="h-full w-full object-cover" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h2 className="text-lg font-semibold text-gray-900 hover:text-teal-600">
                          {title}
                        </h2>
                        <p className="mt-1 text-sm text-gray-600 line-clamp-2">{excerpt}</p>
                        <time className="mt-2 block text-xs text-gray-500" dateTime={post.date}>
                          {new Date(post.date).toLocaleDateString("en-AU", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </time>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Pagination */}
          {totalPages > 1 && (
            <nav
              className="mt-10 flex flex-wrap items-center justify-center gap-2"
              aria-label="Blog pagination"
            >
              {pageNum > 1 && (
                <Link
                  href={buildPageUrl(pageNum - 1)}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  ← Previous
                </Link>
              )}
              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <Link
                    key={p}
                    href={buildPageUrl(p)}
                    className={`min-w-[2.5rem] rounded-lg px-3 py-2 text-center text-sm font-medium ${
                      p === pageNum
                        ? "bg-teal-600 text-white"
                        : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {p}
                  </Link>
                ))}
              </div>
              {pageNum < totalPages && (
                <Link
                  href={buildPageUrl(pageNum + 1)}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Next →
                </Link>
              )}
            </nav>
          )}

          {posts.length === 0 && (
            <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-600">
              No posts found.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
