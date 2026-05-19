import type { Metadata } from "next";
import { getPublicSiteOrigin } from "@/lib/cms-seo";
import { getWordPressRestBaseUrl } from "@/lib/cms-pages";

function decodeBasicHtmlEntities(raw: string): string {
  return raw
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number.parseInt(n, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = Number.parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    });
}

/**
 * When `yoast_head_json` omits `description` (common on some taxonomies), Yoast still injects
 * `<meta name="description">` / `og:description` into the `yoast_head` HTML string on REST responses.
 */
function pickMetaContent(html: string, re: RegExp): string | undefined {
  const m = html.match(re);
  const v = m?.[1];
  if (v == null || !String(v).trim()) return undefined;
  return decodeBasicHtmlEntities(String(v)).trim();
}

export function extractDescriptionsFromYoastHead(html: unknown): { meta?: string; og?: string } {
  if (typeof html !== "string" || !html.trim()) return {};
  return {
    meta:
      pickMetaContent(html, /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i) ??
      pickMetaContent(html, /<meta\s+content=["']([^"']*)["']\s+name=["']description["']/i),
    og:
      pickMetaContent(html, /<meta\s+property=["']og:description["']\s+content=["']([^"']*)["']/i) ??
      pickMetaContent(html, /<meta\s+content=["']([^"']*)["']\s+property=["']og:description["']/i),
  };
}

/** Title from `yoast_head` HTML when `yoast_head_json.title` is missing on taxonomy terms. */
export function extractTitleFromYoastHead(html: unknown): string | undefined {
  if (typeof html !== "string" || !html.trim()) return undefined;
  return (
    pickMetaContent(html, /<title[^>]*>([^<]*)<\/title>/i) ??
    pickMetaContent(html, /<meta\s+property=["']og:title["']\s+content=["']([^"']*)["']/i) ??
    pickMetaContent(html, /<meta\s+content=["']([^"']*)["']\s+property=["']og:title["']/i)
  );
}

export type YoastHeadJsonLike = {
  title?: string;
  description?: string;
  canonical?: string;
  og_title?: string;
  og_description?: string;
  og_image?: Array<{ url: string; width?: number; height?: number; alt?: string }>;
  twitter_title?: string;
  twitter_description?: string;
  twitter_image?: string;
};

/** Merge partial Yoast payloads; first non-empty value wins per field. */
export function mergeYoastHeadJson(
  ...sources: (YoastHeadJsonLike | Record<string, unknown> | null | undefined)[]
): YoastHeadJsonLike {
  const out: YoastHeadJsonLike = {};
  const str = (v: unknown): string | undefined => {
    const s = typeof v === "string" ? v.trim() : "";
    return s || undefined;
  };

  for (const src of sources) {
    if (!src || typeof src !== "object") continue;
    const o = src as Record<string, unknown>;
    if (!out.title) out.title = str(o.title);
    if (!out.description) out.description = str(o.description);
    if (!out.canonical) out.canonical = str(o.canonical);
    if (!out.og_title) out.og_title = str(o.og_title);
    if (!out.og_description) out.og_description = str(o.og_description);
    if (!out.twitter_title) out.twitter_title = str(o.twitter_title);
    if (!out.twitter_description) out.twitter_description = str(o.twitter_description);
    if (!out.twitter_image) out.twitter_image = str(o.twitter_image);
    if (!out.og_image && Array.isArray(o.og_image) && o.og_image.length > 0) {
      out.og_image = o.og_image as YoastHeadJsonLike["og_image"];
    }
  }
  return out;
}

export function isYoastHeadJsonSparse(y: YoastHeadJsonLike | undefined): boolean {
  if (!y) return true;
  return !y.title?.trim() || !y.description?.trim();
}

export async function getYoastMeta(url: string) {
  const base = getWordPressRestBaseUrl();
  if (!base || !url?.trim()) return null;

  const res = await fetch(
    `${base.replace(/\/$/, "")}/wp-json/yoast/v1/get_head?url=${encodeURIComponent(url.trim())}`,
    {
      next: { revalidate: 300 },
    },
  );

  if (!res.ok) return null;

  return res.json();
}

export type WpEntityWithYoast = {
  yoast_head_json?: unknown;
  yoast_head?: unknown;
};

export type BuildYoastMetadataOptions = {
  yoast: YoastHeadJsonLike;
  canonicalPath: string;
  fallbackTitle: string;
  fallbackDescription?: string;
  fallbackImages?: Array<{ url: string; alt?: string; width?: number; height?: number }>;
  openGraphType?: "website" | "article";
};

/** Map merged Yoast JSON to Next.js `Metadata` (title, description, canonical, OG, Twitter). */
export function buildNextMetadataFromYoast(opts: BuildYoastMetadataOptions): Metadata {
  const { yoast, canonicalPath, fallbackTitle, fallbackDescription, fallbackImages, openGraphType } =
    opts;
  const siteUrl = getPublicSiteOrigin().replace(/\/$/, "");
  const defaultCanonical = siteUrl ? `${siteUrl}${canonicalPath}` : canonicalPath;

  const title = yoast.title?.trim() || fallbackTitle;
  const description =
    (yoast.description && yoast.description.trim()) || fallbackDescription || undefined;
  const canonical = (yoast.canonical && yoast.canonical.trim()) || defaultCanonical;

  const ogTitle = yoast.og_title?.trim() || title;
  const ogDescription = (yoast.og_description && yoast.og_description.trim()) || description;
  const ogImages =
    yoast.og_image && yoast.og_image.length > 0
      ? yoast.og_image.map((img) => ({
          url: img.url,
          width: img.width,
          height: img.height,
          alt: img.alt || ogTitle,
        }))
      : fallbackImages ?? [];

  const twitterTitle = yoast.twitter_title?.trim() || title;
  const twitterDescription =
    (yoast.twitter_description && yoast.twitter_description.trim()) || description;
  const firstOgUrl =
    ogImages.length > 0 && typeof ogImages[0] === "object" && ogImages[0]?.url
      ? ogImages[0].url
      : undefined;
  const twitterImages = yoast.twitter_image
    ? [yoast.twitter_image]
    : firstOgUrl
      ? [firstOgUrl]
      : [];

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      type: openGraphType ?? "website",
      url: canonical,
      ...(ogImages.length > 0 ? { images: ogImages } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: twitterTitle,
      description: twitterDescription,
      ...(twitterImages.length > 0 ? { images: twitterImages } : {}),
    },
  };
}
