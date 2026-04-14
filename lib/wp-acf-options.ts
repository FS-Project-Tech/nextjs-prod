/**
 * Single WordPress ACF Options fetch per React request tree (`cache()` dedupes).
 * Always uses `/wp-json/acf/v3/options/options` only — no sub-routes.
 *
 * Set WORDPRESS_REST_API_KEY (server-only) to match WordPress HEADLESS_ACF_API_KEY when protected.
 */

import { cache } from "react";
import { getWordPressRestBaseUrl } from "@/lib/cms-pages";

/** Align with CMS header + product ISR windows (≥60s). */
export const ACF_OPTIONS_REVALIDATE = 300;

/** Hero repeaters sometimes appear on JSON root instead of under `acf`. */
const ACF_ROOT_KEYS_TO_PROMOTE = [
  "left_side_banner",
  "right_side_banner",
  "mobile_left_side_banner",
  "mobile_right_side_banner",
] as const;

function wpAcfHeaders(): HeadersInit {
  const key = process.env.WORDPRESS_REST_API_KEY?.trim();
  return key ? { "x-api-key": key } : {};
}

async function fetchAcfOptionsInternal(): Promise<Record<string, unknown> | null> {
  const base = getWordPressRestBaseUrl().replace(/\/$/, "");
  if (!base) return null;

  const res = await fetch(`${base}/wp-json/acf/v3/options/options`, {
    next: { revalidate: ACF_OPTIONS_REVALIDATE },
    headers: wpAcfHeaders(),
  });

  if (!res.ok) return null;

  try {
    const data = (await res.json()) as Record<string, unknown>;
    const acfRaw = data.acf;
    const out: Record<string, unknown> =
      acfRaw && typeof acfRaw === "object" && !Array.isArray(acfRaw)
        ? { ...(acfRaw as Record<string, unknown>) }
        : {};

    for (const k of ACF_ROOT_KEYS_TO_PROMOTE) {
      if (out[k] === undefined && data[k] !== undefined) {
        out[k] = data[k];
      }
    }

    return out;
  } catch {
    return null;
  }
}

/**
 * Returns merged `acf` fields (plus promoted hero keys from JSON root). One HTTP request per render pass.
 */
export const getAcfOptions = cache(fetchAcfOptionsInternal);
