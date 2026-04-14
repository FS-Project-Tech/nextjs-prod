import { unstable_cache } from "next/cache";
import { getAcfOptions } from "@/lib/wp-acf-options";

export type PublicHeaderPayload = {
  logo: string | null;
  footerLogo: string | null;
  tagline: string | null;
  siteName: string | null;
};

function getWpBase(): string | null {
  const api = process.env.WC_API_URL || "";
  if (!api) return null;
  try {
    const u = new URL(api);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 5000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

function envFallback(): PublicHeaderPayload {
  return {
    logo: process.env.NEXT_PUBLIC_HEADER_LOGO || null,
    footerLogo: process.env.NEXT_PUBLIC_FOOTER_LOGO || null,
    tagline: process.env.NEXT_PUBLIC_HEADER_TAGLINE || null,
    siteName: process.env.NEXT_PUBLIC_SITE_NAME || null,
  };
}

/**
 * Resolves header/footer branding for RSC + API. Cached across requests (Vercel Data Cache).
 * Woo sync elsewhere is unchanged — this is read-only public CMS.
 */
async function resolvePublicHeaderData(): Promise<PublicHeaderPayload> {
  const fallback = envFallback();
  const base = getWpBase();
  if (!base) return fallback;

  try {
    const fields = (await getAcfOptions()) ?? {};
    const siteLogo = fields.site_logo as { url?: string } | undefined;
    const headerLogo = fields.header_logo as { url?: string } | undefined;
    const footerLogoField = fields.footer_logo as { url?: string } | undefined;
    const footerLogoAlt = fields.footerLogo as { url?: string } | undefined;
    const footerLogoImage = fields.footer_logo_image as { url?: string } | undefined;
    if (Object.keys(fields).length > 0) {
      return {
        logo: siteLogo?.url || headerLogo?.url || fallback.logo,
        footerLogo:
          footerLogoField?.url ||
          footerLogoAlt?.url ||
          footerLogoImage?.url ||
          fallback.footerLogo ||
          fallback.logo,
        tagline: (fields.header_tagline as string) || (fields.site_tagline as string) || fallback.tagline,
        siteName: (fields.site_name as string) || (fields.siteName as string) || fallback.siteName,
      };
    }
  } catch {
    /* continue */
  }

  try {
    const res = await fetchWithTimeout(
      `${base}/wp-json/wp/v2/pages?slug=home&_fields=acf`,
      { next: { revalidate: 300 } },
      5000
    );
    if (res.ok) {
      const arr: unknown[] = await res.json();
      const row = arr?.[0] as { acf?: Record<string, unknown> } | undefined;
      const acf = row?.acf || {};
      const g = (k: string) => acf[k] as { url?: string } | undefined;
      return {
        logo: g("site_logo")?.url || g("header_logo")?.url || fallback.logo,
        footerLogo:
          g("footer_logo")?.url ||
          g("footerLogo")?.url ||
          g("footer_logo_image")?.url ||
          fallback.footerLogo ||
          fallback.logo,
        tagline: (acf.header_tagline as string) || (acf.site_tagline as string) || fallback.tagline,
        siteName: (acf.site_name as string) || (acf.siteName as string) || fallback.siteName,
      };
    }
  } catch {
    /* continue */
  }

  let siteName = fallback.siteName;
  try {
    const settingsRes = await fetchWithTimeout(
      `${base}/wp-json/wp/v2/settings`,
      { next: { revalidate: 300 } },
      5000
    );
    if (settingsRes.ok) {
      const settings = (await settingsRes.json()) as { name?: string };
      siteName = settings?.name || siteName;
    }
  } catch {
    /* continue */
  }

  return {
    logo: fallback.logo,
    footerLogo: fallback.footerLogo || fallback.logo,
    tagline: fallback.tagline,
    siteName: siteName || fallback.siteName,
  };
}

const getPublicHeaderDataCached = unstable_cache(
  resolvePublicHeaderData,
  ["cms-public-header-v1"],
  { revalidate: 300, tags: ["cms-header"] }
);

export async function getPublicHeaderData(): Promise<PublicHeaderPayload> {
  return getPublicHeaderDataCached();
}
