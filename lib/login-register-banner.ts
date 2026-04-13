/**
 * Login / register side banner from ACF Options (single `getAcfOptions()` — no sub-routes).
 * Expects fields on the main options page: banner_image | image | login_register_image; banner_link | url | link
 */

import { getWordPressRestBaseUrl } from "@/lib/cms-pages";
import { getAcfOptions } from "@/lib/wp-acf-options";
import {
  getBannerLinkUrl,
  resolveBannerRowImageUrl,
  type DetailBannerData,
} from "@/lib/detail-banner";

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

function hasBannerFields(acf: Record<string, unknown>): boolean {
  return Boolean(
    acf.banner_image ??
      acf.image ??
      acf.login_register_image ??
      acf.banner_link ??
      acf.url ??
      acf.link,
  );
}

export async function fetchLoginRegisterBanner(): Promise<LoginRegisterBannerPayload> {
  const wpBase = getWordPressRestBaseUrl().replace(/\/$/, "");
  if (!wpBase) {
    return { imageUrl: null, linkUrl: null, fromCms: false };
  }

  const acf = await getAcfOptions();
  if (!acf || !hasBannerFields(acf)) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[login-register-banner] No banner fields on main ACF options. Add banner fields to the global options page returned by /acf/v3/options/options.",
      );
    }
    return { imageUrl: null, linkUrl: null, fromCms: false };
  }

  const row = pickAcfRecord(acf);
  const imageUrl = await resolveBannerRowImageUrl(row, wpBase);
  const linkUrl = normalizeLink(getBannerLinkUrl(row));
  return {
    imageUrl,
    linkUrl,
    fromCms: Boolean(imageUrl),
  };
}
