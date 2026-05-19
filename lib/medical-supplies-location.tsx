import type { Metadata } from "next";
import Image from "next/image";
import PrefetchLink from "@/components/PrefetchLink";
import CmsPageFallback from "@/components/CmsPageFallback";
import { fetchPageBySlug } from "@/lib/cms-pages";
import { plainTextFromRendered } from "@/lib/cms-posts";
import { decodeBlogHTMLEntities } from "@/lib/blog-decode";
import { resolveWpPageYoastHead } from "@/lib/wordpress";
import { buildNextMetadataFromYoast } from "@/lib/yoast";
import { sanitizeWordPressPageHTML, decodeHTMLEntities } from "@/lib/xss-sanitizer";
import { BreadcrumbStructuredData } from "@/components/StructuredData";

export type MedicalSuppliesLocationConfig = {
  /** WordPress page slug (must match Pages → permalink). */
  wpSlug: string;
  /** Default H1 / fallback label, e.g. "Medical Supplies Sydney". */
  fallbackTitle: string;
};

export const MEDICAL_SUPPLIES_LOCATIONS: MedicalSuppliesLocationConfig[] = [
  { wpSlug: "medical-supplies-adelaide", fallbackTitle: "Medical Supplies Adelaide" },
  { wpSlug: "medical-supplies-brisbane-north", fallbackTitle: "Medical Supplies Brisbane North" },
  { wpSlug: "medical-supplies-central-coast", fallbackTitle: "Medical Supplies Central Coast" },
  { wpSlug: "medical-supplies-coffs-harbour", fallbackTitle: "Medical Supplies Coffs Harbour" },
  { wpSlug: "medical-supplies-melbourne", fallbackTitle: "Medical Supplies Melbourne" },
  { wpSlug: "medical-supplies-newcastle", fallbackTitle: "Medical Supplies Newcastle" },
  { wpSlug: "medical-supplies-sunshine-coast", fallbackTitle: "Medical Supplies Sunshine Coast" },
  { wpSlug: "medical-supplies-sydney", fallbackTitle: "Medical Supplies Sydney" },
  { wpSlug: "medical-supplies-toowoomba", fallbackTitle: "Medical Supplies Toowoomba" },
  { wpSlug: "medical-supplies-townsville", fallbackTitle: "Medical Supplies Townsville" },
  { wpSlug: "medical-supplies-tweed-heads", fallbackTitle: "Medical Supplies Tweed Heads" },
];

export function medicalSuppliesPath(config: MedicalSuppliesLocationConfig): string {
  return `/${config.wpSlug}`;
}

export async function generateMedicalSuppliesLocationMetadata(
  config: MedicalSuppliesLocationConfig,
): Promise<Metadata> {
  const { wpSlug, fallbackTitle } = config;
  const pathname = medicalSuppliesPath(config);

  try {
    const page = await fetchPageBySlug(wpSlug).catch(() => null);
    const yoast = await resolveWpPageYoastHead(wpSlug, pathname, page).catch(() => ({}));

    const plainTitle = page?.title?.rendered
      ? decodeBlogHTMLEntities(plainTextFromRendered(page.title.rendered))
      : fallbackTitle;
    const fallbackMetaTitle = `${plainTitle} | Joya Medical Supplies`;

    const excerpt = plainTextFromRendered(page?.excerpt?.rendered, 160);
    const fallbackDescription = excerpt
      ? decodeBlogHTMLEntities(excerpt)
      : undefined;

    const featuredUrl = page?._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
    let contentImg: string | undefined;
    const content = page?.content?.rendered || "";
    if (!featuredUrl && content) {
      const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch) contentImg = imgMatch[1];
    }

    return buildNextMetadataFromYoast({
      yoast,
      canonicalPath: pathname,
      fallbackTitle: fallbackMetaTitle,
      fallbackDescription,
      fallbackImages: (featuredUrl || contentImg)
        ? [{ url: featuredUrl || contentImg!, alt: plainTitle }]
        : undefined,
    });
  } catch (err) {
    console.error(`[${wpSlug}] generateMetadata failed`, {
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      title: `${fallbackTitle} | Joya Medical Supplies`,
      alternates: { canonical: pathname },
    };
  }
}

export function createMedicalSuppliesLocationPage(config: MedicalSuppliesLocationConfig) {
  const { wpSlug, fallbackTitle } = config;
  const contentClass = `${wpSlug}-page-content`;

  return async function MedicalSuppliesLocationPage() {
    let page: Awaited<ReturnType<typeof fetchPageBySlug>> = null;
    try {
      page = await fetchPageBySlug(wpSlug);
    } catch (err) {
      console.error(`[${wpSlug}] fetchPageBySlug threw`, {
        message: err instanceof Error ? err.message : String(err),
      });
    }

    if (!page) {
      console.error("CMS page not found:", wpSlug);
      return <CmsPageFallback slug={wpSlug} breadcrumbLabel={fallbackTitle} />;
    }

    const title = decodeHTMLEntities(
      page.title?.rendered?.replace(/<[^>]+>/g, "").trim() || fallbackTitle,
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
                    <PrefetchLink href="/" className="transition-colors hover:text-teal-600">
                      Home
                    </PrefetchLink>
                  </li>
                  <li aria-hidden>/</li>
                  <li className="font-medium text-gray-900">{title}</li>
                </ol>
              </nav>
              {featuredImg ? (
                <div className="mb-8 flex justify-center lg:hidden">
                  <div className="relative aspect-[4/3] w-full max-w-lg overflow-hidden rounded-lg">
                    <Image src={featuredImg} alt="" fill className="object-cover" sizes="100vw" />
                  </div>
                </div>
              ) : null}
            </div>
          </section>
          <section className="container mx-auto px-4 pb-12 sm:px-6 md:px-8 md:pb-16">
            <div
              className={`${contentClass} mx-auto max-w-8xl text-gray-900`}
              dangerouslySetInnerHTML={{
                __html: sanitizeWordPressPageHTML(content),
              }}
            />
          </section>
        </div>
      </>
    );
  };
}
