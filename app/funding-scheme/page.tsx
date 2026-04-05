import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import PrefetchLink from "@/components/PrefetchLink";
import { fetchPostBySlug } from "@/lib/cms-posts";
import { sanitizeHTML, decodeHTMLEntities } from "@/lib/xss-sanitizer";
import { BreadcrumbStructuredData } from "@/components/StructuredData";

export const metadata: Metadata = {
  title: "Funding Schemes | Joya Medical Supplies",
  description:
    "Help is available to cover costs of essential healthcare products. CAPS, My Aged Care, and NDIS funding schemes for Australians.",
  alternates: { canonical: "/funding-scheme" },
};

type FundingCard = {
  title: string;
  content: string;
  slug: string;
};

/** Parse WordPress content into intro + 3 card sections (CAPS, My Aged Care, NDIS) */
function parseFundingContent(html: string): { intro: string; cards: FundingCard[] } {
  const decoded = decodeHTMLEntities(html);
  const cards: FundingCard[] = [];
  const sections: { title: string; content: string }[] = [];
  const h2Regex = /<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2[^>]*>|$)/gi;
  let match;

  while ((match = h2Regex.exec(decoded)) !== null) {
    const cardTitle = match[1].replace(/<[^>]+>/g, "").trim();
    const cardContent = match[2].trim();
    sections.push({ title: cardTitle, content: cardContent });
  }

  const introSection = sections[0];
  const isIntroOnly =
    introSection &&
    introSection.title.toLowerCase().includes("funding scheme") &&
    !introSection.title.toLowerCase().includes("caps") &&
    !introSection.title.toLowerCase().includes("aged care") &&
    !introSection.title.toLowerCase().includes("ndis");

  const intro = isIntroOnly ? introSection.content : "";

  const cardSections = sections.filter(
    (s) =>
      s.title.toLowerCase().includes("caps") ||
      s.title.toLowerCase().includes("aged care") ||
      s.title.toLowerCase().includes("ndis")
  );

  for (const s of cardSections) {
    let slug = "caps";
    const titleLower = s.title.toLowerCase();
    if (titleLower.includes("ndis")) slug = "ndis";
    else if (titleLower.includes("aged care") || titleLower.includes("home care"))
      slug = "my-aged-care";
    else if (titleLower.includes("caps") || titleLower.includes("continence")) slug = "caps";

    const linkMatch = s.content.match(
      /<a\s[^>]*href=["'][^"']*\/funding-scheme\/([^/"']+)[^"']*["'][^>]*>/i
    );
    const extractedSlug = linkMatch?.[1];
    const finalSlug =
      extractedSlug && ["caps", "my-aged-care", "ndis"].includes(extractedSlug)
        ? extractedSlug
        : slug;

    cards.push({
      title: s.title,
      content: s.content.replace(/<a\s[^>]*href=["'][^"']*["'][^>]*>[\s\S]*?<\/a>/gi, ""),
      slug: finalSlug,
    });
  }

  return { intro, cards };
}

export default async function FundingSchemePage() {
  const post = await fetchPostBySlug("funding-schemes");
  if (!post) notFound();

  const rawTitle = post.title?.rendered?.replace(/<[^>]+>/g, "").trim() || "";
  const title = rawTitle ? decodeHTMLEntities(rawTitle) : "Funding Schemes";
  const content = post.content?.rendered || "";
  const { intro, cards } = parseFundingContent(content);

  const bannerDesc = intro
    ? decodeHTMLEntities(
        intro
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      )
    : "";

  let featuredImg = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
  if (!featuredImg && content) {
    const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch) featuredImg = imgMatch[1];
  }

  const breadcrumbItems = [{ label: "Home", href: "/" }, { label: "Funding Schemes" }];

  return (
    <>
      <BreadcrumbStructuredData items={breadcrumbItems} />
      <div className="min-h-screen bg-gray-50">
        {/* Banner - Image left, content right */}
        {/* Banner - Info left, image right */}
        <section className="bg-white border-b border-teal-200">
          <div className="container mx-auto px-4 py-10 sm:px-6 md:px-8">
            <nav className="mb-3 text-sm text-gray-500">
              <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <li>
                  <PrefetchLink href="/" className="hover:text-teal-600 transition-colors">
                    Home
                  </PrefetchLink>
                </li>
                <li aria-hidden>/</li>
                <li className="text-gray-900 font-medium">{title}</li>
              </ol>
            </nav>
            <div className="flex flex-col lg:flex-row lg:items-center lg:gap-12">
              {/* Info - left */}
              <div className="flex-1">
                <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">{title}</h1>
                {bannerDesc && (
                  <p className="text-gray-600 leading-relaxed max-w-2xl">{bannerDesc}</p>
                )}
              </div>
              {/* Image - right */}
              <div className="lg:w-2/5 shrink-0">
                {featuredImg ? (
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <Image
                      src={featuredImg}
                      alt={title}
                      width={1000}
                      height={1000}
                      className="mt-23 rounded-lg"
                    />
                  </div>
                ) : (
                  <div className="aspect-[4/3] bg-gray-100 flex items-center justify-center">
                    <span className="text-gray-600 text-sm">Featured image</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* {intro && (
          <section className="container mx-auto px-4 pt-8 sm:px-6 md:px-8">
            <div
              className="funding-scheme-intro mx-auto max-w-4xl text-gray-600"
              dangerouslySetInnerHTML={{ __html: sanitizeHTML(intro) }}
            />
          </section>
        )} */}

        {/* 3-column card grid */}
        <section className="container mx-auto px-4 py-10 sm:px-6 md:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {cards.map((card) => (
              <article
                key={card.slug}
                className="flex flex-col rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
              >
                <h2 className="text-lg font-bold text-teal-700 mb-4">{card.title}</h2>
                <div
                  className="flex-1 text-sm text-gray-600 [&_p]:mb-2 [&_strong]:font-semibold [&_strong]:text-gray-800"
                  dangerouslySetInnerHTML={{ __html: sanitizeHTML(card.content) }}
                />
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <PrefetchLink
                    href={card.slug === "ndis" ? "/ndis" : `/funding-scheme/${card.slug}`}
                    className="inline-block rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition-colors"
                  >
                    Read More
                  </PrefetchLink>
                </div>
              </article>
            ))}
          </div>
          <div className="mt-8">
            <Link
              href="/"
              className="inline-flex gap-2 text-teal-600 font-medium hover:text-teal-700 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back to Home
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
