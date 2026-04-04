/**
 * ACF Options → login / register side banner (image + optional URL).
 *
 * WordPress: Field group on Options Page "Login-Register-banner" (or similar).
 * The ACF→REST path is often `/wp-json/acf/v3/options/{rest-base}` where **rest-base**
 * may match your options **menu slug** (try env + common variants below).
 *
 * Also tries `/wp-json/acf/v3/options/options` (e.g. custom route from docs) when fields
 * are merged into that payload.
 *
 * Field names: banner_image | image | login_register_image; banner_link | url | link
 *
 * Override slug: WP_LOGIN_REGISTER_BANNER_ACF_SLUG or NEXT_PUBLIC_WP_LOGIN_REGISTER_BANNER_ACF_SLUG
 */

import { getWordPressRestBaseUrl } from "@/lib/cms-pages";
import {
  getBannerLinkUrl,
  resolveBannerRowImageUrl,
  type DetailBannerData,
} from "@/lib/detail-banner";

export const DEFAULT_LOGIN_REGISTER_BANNER_ACF_SLUG = "login-register-banner";

/** Menu/title slug from WP admin (see Options page slug). */
const SLUG_FALLBACKS = [
  "login-register-banner",
  "Login-Register-banner",
  "login_register_banner",
  "Login_Register_Banner",
] as const;

export interface LoginRegisterBannerPayload {
  imageUrl: string | null;
  linkUrl: string | null;
  fromCms: boolean;
}

function pickAcfRecord(acf: Record<string, unknown>): DetailBannerData {
  const banner_image = acf.banner_image ?? acf.image ?? acf.login_register_image;
  const banner_link = acf.banner_link ?? acf.url ?? acf.banner_url ?? acf.link;
  return {
    banner_image: banner_image as DetailBannerData["banner_image"],
    banner_link: banner_link as DetailBannerData["banner_link"],
  };
}

function normalizeLink(raw: string): string | null {
  const t = (raw || "").trim();
  if (!t || t === "#") return null;
  return t;
}

function extractAcfFromJson(json: unknown): Record<string, unknown> | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (o.acf && typeof o.acf === "object" && !Array.isArray(o.acf)) {
    return o.acf as Record<string, unknown>;
  }
  if (o.banner_image !== undefined || o.banner_link !== undefined || o.image !== undefined) {
    return o;
  }
  return null;
}

function hasBannerFields(acf: Record<string, unknown>): boolean {
  return Boolean(
    acf.banner_image ??
    acf.image ??
    acf.login_register_image ??
    acf.banner_link ??
    acf.url ??
    acf.link
  );
}

async function buildPayload(
  acf: Record<string, unknown>,
  wpBase: string
): Promise<LoginRegisterBannerPayload> {
  const row = pickAcfRecord(acf);
  const imageUrl = await resolveBannerRowImageUrl(row, wpBase);
  const linkUrl = normalizeLink(getBannerLinkUrl(row));
  return {
    imageUrl,
    linkUrl,
    fromCms: Boolean(imageUrl),
  };
}

function uniqueNonEmptyBases(): string[] {
  const raw = [getWordPressRestBaseUrl(), (process.env.NEXT_PUBLIC_WP_URL || "").trim()];
  const out: string[] = [];
  for (const r of raw) {
    const b = r.replace(/\/$/, "");
    if (b && !out.includes(b)) out.push(b);
  }
  return out;
}

function slugCandidates(): string[] {
  const fromEnv = (
    process.env.WP_LOGIN_REGISTER_BANNER_ACF_SLUG ||
    process.env.NEXT_PUBLIC_WP_LOGIN_REGISTER_BANNER_ACF_SLUG ||
    ""
  )
    .trim()
    .replace(/^\//, "");
  const set = new Set<string>();
  if (fromEnv) set.add(fromEnv);
  for (const s of SLUG_FALLBACKS) set.add(s);
  return [...set];
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchLoginRegisterBanner(): Promise<LoginRegisterBannerPayload> {
  const bases = uniqueNonEmptyBases();
  if (bases.length === 0) {
    return { imageUrl: null, linkUrl: null, fromCms: false };
  }

  const slugs = slugCandidates();
  const empty = { imageUrl: null, linkUrl: null, fromCms: false } as const;

  for (const base of bases) {
    for (const slug of slugs) {
      const json = await fetchJson(`${base}/wp-json/acf/v3/options/${encodeURIComponent(slug)}`);
      const acf = extractAcfFromJson(json);
      if (acf && hasBannerFields(acf)) {
        const payload = await buildPayload(acf, base);
        if (payload.imageUrl) return payload;
      }
    }

    const merged = await fetchJson(`${base}/wp-json/acf/v3/options/options`);
    const acf = extractAcfFromJson(merged);
    if (acf && hasBannerFields(acf)) {
      const payload = await buildPayload(acf, base);
      if (payload.imageUrl) return payload;
    }
  }

  if (process.env.NODE_ENV === "development") {
    console.warn(
      "[login-register-banner] No banner image from ACF. Check:",
      "\n  • Field group → Settings → REST API: enable + set REST base (try slug matching options menu).",
      "\n  • Open in browser:",
      `${bases[0]}/wp-json/acf/v3/options/login-register-banner`,
      "and",
      `${bases[0]}/wp-json/acf/v3/options/Login-Register-banner`,
      "\n  • Or set WP_LOGIN_REGISTER_BANNER_ACF_SLUG to the segment that returns JSON with acf.banner_image."
    );
  }

  return empty;
}
