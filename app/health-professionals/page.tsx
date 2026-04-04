import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import PrefetchLink from "@/components/PrefetchLink";
import { fetchFirstPageOrPostBySlug } from "@/lib/cms-pages";
import { sanitizeWordPressPageHTML, decodeHTMLEntities } from "@/lib/xss-sanitizer";
import { BreadcrumbStructuredData } from "@/components/StructuredData";

const NEXT_PATH = "/health-professionals";

function wpSlugCandidates(): string[] {
  const fromEnv = process.env.NEXT_PUBLIC_WP_HEALTH_PROFESSIONALS_SLUG?.trim();
  const out = [fromEnv, "health-professionals", "health-professional"].filter((s): s is string =>
    Boolean(s)
  );
  return [...new Set(out)];
}

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const page = await fetchFirstPageOrPostBySlug(wpSlugCandidates(), {
    cache: "no-store",
  });
  const rawTitle = page?.title?.rendered
    ? String(page.title.rendered)
        .replace(/<[^>]+>/g, "")
        .trim()
    : "";
  const title = rawTitle ? decodeHTMLEntities(rawTitle) : "Health Professionals";
  const rawExcerpt = page?.excerpt?.rendered
    ? String(page.excerpt.rendered)
        .replace(/<[^>]+>/g, "")
        .trim()
        .slice(0, 160)
    : undefined;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  return {
    title: `${title} | Joya Medical Supplies`,
    description: rawExcerpt ? decodeHTMLEntities(rawExcerpt) : undefined,
    alternates: { canonical: `${siteUrl}${NEXT_PATH}` },
    openGraph: {
      title,
      description: rawExcerpt ? decodeHTMLEntities(rawExcerpt) : undefined,
      type: "website",
      url: `${siteUrl}${NEXT_PATH}`,
    },
  };
}

function HealthProfessionalsFallback() {
  const title = "Health Professionals";
  const breadcrumbItems = [{ label: "Home", href: "/" }, { label: title }];
  return (
    <>
      <BreadcrumbStructuredData items={breadcrumbItems} />
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 text-center">{title}</h1>
        <p className="text-gray-600 text-center max-w-lg mb-6">
          WordPress did not return content for this slug, or Next is calling the{" "}
          <strong>wrong host</strong>. If the page works on staging but{" "}
          <code className="rounded bg-gray-100 px-1">NEXT_PUBLIC_WP_URL</code> is your Cloudways
          URL, add <code className="rounded bg-gray-100 px-1">NEXT_PUBLIC_WORDPRESS_REST_URL</code>{" "}
          in <code className="rounded bg-gray-100 px-1">.env.local</code> set to the same domain you
          use in the browser (e.g. <code className="rounded bg-gray-100 px-1">https://stage…</code>
          ). Verify{" "}
          <code className="rounded bg-gray-100 px-1 text-xs">
            …/wp-json/wp/v2/pages?slug=health-professionals
          </code>{" "}
          on <em>that</em> host returns JSON.
        </p>
        <Link
          href="/shop"
          className="rounded-lg px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          style={{ backgroundColor: "var(--primary)" }}
        >
          Continue shopping
        </Link>
      </div>
    </>
  );
}

export default async function HealthProfessionalsPage() {
  const page = await fetchFirstPageOrPostBySlug(wpSlugCandidates(), {
    cache: "no-store",
  });

  if (!page) {
    return <HealthProfessionalsFallback />;
  }

  const title = decodeHTMLEntities(
    page.title?.rendered?.replace(/<[^>]+>/g, "").trim() || "Health Professionals"
  );
  const content = page.content?.rendered || "";

  let featuredImg = page._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
  if (!featuredImg && content) {
    const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch) featuredImg = imgMatch[1];
  }

  const breadcrumbItems = [{ label: "Home", href: "/" }, { label: title }];

  return (
    <>
      <BreadcrumbStructuredData items={breadcrumbItems} />
      <div className="min-h-screen bg-white">
        <section className="border-b border-gray-100 bg-white">
          <div className="container mx-auto px-4 py-6 sm:px-6 md:px-8 md:py-8">
            <nav className="mb-6 text-sm text-gray-500">
              <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <li>
                  <PrefetchLink href="/" className="hover:text-teal-600 transition-colors">
                    Home
                  </PrefetchLink>
                </li>
                <li aria-hidden>/</li>
                <li className="font-medium text-gray-900">{title}</li>
              </ol>
            </nav>
            {featuredImg && (
              <div className="mb-8 flex justify-center lg:hidden">
                <div className="relative aspect-[4/3] w-full max-w-lg overflow-hidden rounded-lg">
                  <Image src={featuredImg} alt="" fill className="object-cover" sizes="100vw" />
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="container mx-auto px-4 pb-12 sm:px-6 md:px-8 md:pb-16">
          <div
            className="nursing-page-content b2b-page-content mx-auto max-w-8xl text-gray-900"
            dangerouslySetInnerHTML={{
              __html: sanitizeWordPressPageHTML(content),
            }}
          />
        </section>
      </div>
    </>
  );
}
