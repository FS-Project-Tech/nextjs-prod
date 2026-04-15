import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import PrefetchLink from "@/components/PrefetchLink";
import { fetchPostBySlug } from "@/lib/cms-posts";
import { sanitizeHTML } from "@/lib/xss-sanitizer";
import { BreadcrumbStructuredData } from "@/components/StructuredData";
 
// export const dynamicParams = true;
export const dynamic = "force-dynamic";
export const revalidate = 60;

function resolveSlug(params: { slug: string }): string {
  return String(params?.slug || "").trim();
}
 
function decodeHTMLEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}
 
export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  try {
    const slug = resolveSlug(params);
    if (!slug) return { title: "Post" };
    const post = await fetchPostBySlug(slug);
    if (!post) return { title: "Post" };
    const rawTitle = post.title?.rendered?.replace(/<[^>]+>/g, "").trim() || "";
    const title = rawTitle ? decodeHTMLEntities(rawTitle) : "Post";
    const rawExcerpt =
      post.excerpt?.rendered
        ?.replace(/<[^>]+>/g, "")
        .trim()
        .slice(0, 160) || "";
    const description = rawExcerpt ? decodeHTMLEntities(rawExcerpt) : undefined;
    return {
      title,
      description,
      alternates: { canonical: `/blog/${slug}` },
    };
  } catch {
    return { title: "Post" };
  }
}
 
export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const slug = resolveSlug(params);
  if (!slug) notFound();

  const post = await fetchPostBySlug(slug);
  if (!post?.id) notFound();
 
  const rawTitle = post.title?.rendered?.replace(/<[^>]+>/g, "").trim() || "";
  const title = rawTitle ? decodeHTMLEntities(rawTitle) : "Untitled";
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
          <div className="mx-auto max-w-3xl rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
            <div
              className="info-content"
              dangerouslySetInnerHTML={{
                __html: content,
              }}
            />
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
      </div>
    </>
  );
}