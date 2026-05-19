import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import PrefetchLink from "@/components/PrefetchLink";
import { fetchPostBySlug, plainTextFromRendered } from "@/lib/cms-posts";
import { decodeBlogHTMLEntities } from "@/lib/blog-decode";
import { resolvePostYoastHead } from "@/lib/wordpress";
import { buildNextMetadataFromYoast } from "@/lib/yoast";
import { sanitizeHTML } from "@/lib/xss-sanitizer";
import { BreadcrumbStructuredData } from "@/components/StructuredData";
 
// export const dynamicParams = true;
export const dynamic = "force-dynamic";
export const revalidate = 60;

type BlogSlugParams = Promise<{ slug: string }>;

function resolveSlug(resolved: { slug: string }): string {
  return String(resolved?.slug || "").trim();
}
 
export async function generateMetadata({
  params,
}: {
  params: BlogSlugParams;
}): Promise<Metadata> {
  try {
    const slug = resolveSlug(await params);
    if (!slug) return { title: "Post" };

    const post = await fetchPostBySlug(slug);
    if (!post) return { title: "Post" };

    const rawTitle = plainTextFromRendered(post.title?.rendered);
    const fallbackTitle = rawTitle ? decodeBlogHTMLEntities(rawTitle) : "Post";
    const rawExcerpt = plainTextFromRendered(post.excerpt?.rendered, 160);
    const fallbackDescription = rawExcerpt
      ? decodeBlogHTMLEntities(rawExcerpt)
      : undefined;

    const featuredUrl = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
    const yoast = await resolvePostYoastHead(slug, post).catch(() => ({}));

    return buildNextMetadataFromYoast({
      yoast,
      canonicalPath: `/blog/${slug}`,
      fallbackTitle,
      fallbackDescription,
      fallbackImages: featuredUrl
        ? [{ url: featuredUrl, alt: fallbackTitle }]
        : undefined,
      openGraphType: "article",
    });
  } catch {
    return { title: "Post" };
  }
}
 
export default async function BlogPostPage({ params }: { params: BlogSlugParams }) {
  const slug = resolveSlug(await params);
  if (!slug) notFound();

  const post = await fetchPostBySlug(slug);
  if (!post?.id) notFound();
 
  const rawTitle = plainTextFromRendered(post.title?.rendered);
  const title = rawTitle ? decodeBlogHTMLEntities(rawTitle) : "Untitled";
  let content = "";
  try {
    content = sanitizeHTML(post.content?.rendered || "");
  } catch {
    content = "";
  }
  const safeDate =
    typeof post.date === "string" && !Number.isNaN(new Date(post.date).getTime())
      ? new Date(post.date).toLocaleDateString("en-AU", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "";
 
  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Blog", href: "/blog" },
    { label: title },
  ];
 
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
                <li>
                  <PrefetchLink href="/blog" className="hover:text-teal-600 transition-colors">
                    Blog
                  </PrefetchLink>
                </li>
                <li aria-hidden>/</li>
                <li className="text-gray-900 font-medium">{title}</li>
              </ol>
            </nav>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{title}</h1>
            {safeDate ? (
              <time className="mt-2 block text-sm text-gray-500" dateTime={post.date}>
                {safeDate}
              </time>
            ) : null}
          </div>
        </div>
 
        <div className="container mx-auto px-4 py-10 sm:px-6 md:px-8">
              <div className="info-content" dangerouslySetInnerHTML={{ __html: content,}}/>
                <div className="mt-8">
                  <Link
                    href="/blog"
                    className="inline-flex items-center gap-2 text-teal-600 font-medium hover:text-teal-700"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                    Back to Blog
                  </Link>
                </div>
              </div>
      </div>
    </>
  );
}