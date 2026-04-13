import { NextRequest, NextResponse } from "next/server";
import { createPublicApiHandler, API_TIMEOUT } from "@/lib/api-middleware";
import { getAcfOptions } from "@/lib/wp-acf-options";

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

/**
 * Fetch with timeout using AbortController
 */
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
    const isAbort =
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError");
    if (isAbort) {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

async function getHeaderData(req: NextRequest) {
  // Read environment variables (server-side only)
  const fallback = {
    logo: process.env.NEXT_PUBLIC_HEADER_LOGO || null,
    footerLogo: process.env.NEXT_PUBLIC_FOOTER_LOGO || null,
    tagline: process.env.NEXT_PUBLIC_HEADER_TAGLINE || null,
    siteName: process.env.NEXT_PUBLIC_SITE_NAME || null,
  };

  const base = getWpBase();
  if (!base) {
    // Return fallback immediately if no WordPress base URL
    return NextResponse.json(fallback, { headers: { "Cache-Control": "no-store" } });
  }

  // Shared ACF options (same fetch as RSC — one WP request per request when combined with SSR)
  try {
    const fields = (await getAcfOptions()) ?? {};
    const siteLogo = fields.site_logo as { url?: string } | undefined;
    const headerLogo = fields.header_logo as { url?: string } | undefined;
    const footerLogoField = fields.footer_logo as { url?: string } | undefined;
    const footerLogoAlt = fields.footerLogo as { url?: string } | undefined;
    const footerLogoImage = fields.footer_logo_image as { url?: string } | undefined;
    if (Object.keys(fields).length > 0) {
      return NextResponse.json(
        {
          logo: siteLogo?.url || headerLogo?.url || fallback.logo,
          footerLogo:
            footerLogoField?.url ||
            footerLogoAlt?.url ||
            footerLogoImage?.url ||
            fallback.footerLogo ||
            fallback.logo,
          tagline: fields.header_tagline || fields.site_tagline || fallback.tagline,
          siteName: fields.site_name || fields.siteName || fallback.siteName,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
  } catch {
    /* fall through */
  }

  // Fallback to a "home" page ACF (5 second timeout)
  try {
    const res = await fetchWithTimeout(
      `${base}/wp-json/wp/v2/pages?slug=home&_fields=acf`,
      { cache: "no-store" },
      5000
    );
    if (res.ok) {
      const arr: any[] = await res.json();
      const acf = arr?.[0]?.acf || {};
      return NextResponse.json(
        {
          logo: acf?.site_logo?.url || acf?.header_logo?.url || fallback.logo,
          footerLogo:
            acf?.footer_logo?.url ||
            acf?.footerLogo?.url ||
            acf?.footer_logo_image?.url ||
            fallback.footerLogo ||
            fallback.logo,
          tagline: acf?.header_tagline || acf?.site_tagline || fallback.tagline,
          siteName: acf?.site_name || acf?.siteName || fallback.siteName,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
  } catch (error) {
    // Swallow and continue to next fallback path
    const isAbort =
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError");
    if (isAbort) {
      // Silent on timeout/abort
    }
  }

  // Try to get site name from WordPress general settings (5 second timeout)
  let siteName = fallback.siteName;
  try {
    const settingsRes = await fetchWithTimeout(
      `${base}/wp-json/wp/v2/settings`,
      { cache: "no-store" },
      5000
    );
    if (settingsRes.ok) {
      const settings: any = await settingsRes.json();
      siteName = settings?.name || siteName;
    }
  } catch (error) {
    const isAbort =
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError");
    if (isAbort) {
      // Silent on timeout/abort
    }
  }

  // Final fallback - always return footerLogo from env var if set
  return NextResponse.json(
    {
      logo: fallback.logo,
      footerLogo: fallback.footerLogo || fallback.logo, // Use footer logo or fallback to header logo
      tagline: fallback.tagline,
      siteName: siteName || fallback.siteName,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// Export with security middleware
export const GET = createPublicApiHandler(getHeaderData, {
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 requests per minute
  },
  timeout: API_TIMEOUT.DEFAULT,
  sanitize: true,
  allowedMethods: ["GET"],
});
