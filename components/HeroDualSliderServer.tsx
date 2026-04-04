import { cache } from "react";
import HeroDualSlider, { SliderImage } from "@/components/HeroDualSlider";
import { getWordPressRestBaseUrl } from "@/lib/cms-pages";

interface ACFImageField {
  url?: string;
  alt?: string;
  alt_text?: string;
  source_url?: string;
  guid?: { rendered?: string };
  sizes?: Record<string, string>;
  title?: { rendered?: string };
}

interface ACFRepeaterItem {
  image?: ACFImageField | string | number;
  link?: string | { url?: string; href?: string };
}

interface ACFOptionsResponse {
  acf?: {
    left_side_banner?: ACFRepeaterItem[];
    right_side_banner?: ACFRepeaterItem[];
    mobile_left_side_banner?: ACFRepeaterItem[];
    mobile_right_side_banner?: ACFRepeaterItem[];
    [key: string]: unknown;
  };
}

/** Optional: WordPress ACF options sub-route if `/options` omits Hero fields (e.g. menu slug). */
function heroOptionsSlugCandidates(): string[] {
  const fromEnv = (
    process.env.NEXT_PUBLIC_ACF_HERO_OPTIONS_SLUG ||
    process.env.WP_ACF_HERO_OPTIONS_SLUG ||
    ""
  )
    .trim()
    .replace(/^\//, "");
  const extra = fromEnv ? [fromEnv] : [];
  return [
    ...extra,
    "hero-dual-slider",
    "hero_dual_slider",
    "Hero-Dual-Slider",
    "Hero Dual Slider",
    "herodualslider",
  ];
}

const HERO_ACF_KEYS = [
  "left_side_banner",
  "right_side_banner",
  "mobile_left_side_banner",
  "mobile_right_side_banner",
] as const;

async function fetchJsonAcf(baseUrl: string, path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${baseUrl}${path}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return {};
  try {
    const data = (await res.json()) as Record<string, unknown>;
    const acfRaw = data?.acf;
    const base: Record<string, unknown> =
      acfRaw && typeof acfRaw === "object" && !Array.isArray(acfRaw)
        ? { ...(acfRaw as Record<string, unknown>) }
        : {};
    // Some setups expose repeater fields on the JSON root instead of under `acf`
    for (const k of HERO_ACF_KEYS) {
      if (base[k] === undefined && data[k] !== undefined) {
        base[k] = data[k];
      }
    }
    return base;
  } catch {
    return {};
  }
}

/** Normalise ACF layer keys (ignore case / stray spaces in exported JSON). */
function normalisedLayer(layer: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [rawKey, val] of Object.entries(layer)) {
    const k = rawKey.trim().toLowerCase().replace(/\s+/g, "_");
    out[k] = val;
  }
  return out;
}

/** Merge ACF objects: later sources fill missing keys; non-empty arrays win for list fields. */
function mergeHeroAcf(...layers: Record<string, unknown>[]): Record<string, unknown> {
  const keys = [
    "left_side_banner",
    "right_side_banner",
    "mobile_left_side_banner",
    "mobile_right_side_banner",
  ] as const;
  const normalisedLayers = layers.map(normalisedLayer);
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    for (const layer of normalisedLayers) {
      const v = layer[key];
      if (Array.isArray(v) && v.length > 0) {
        out[key] = v;
        break;
      }
      if (v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)) {
        if (out[key] === undefined) out[key] = v;
      }
    }
  }
  return out;
}

// Batch fetch images by ID
async function fetchImagesByIds(ids: number[]): Promise<Map<number, { url: string; alt: string }>> {
  const baseUrl = getWordPressRestBaseUrl().replace(/\/$/, "");
  const results = new Map<number, { url: string; alt: string }>();

  try {
    const promises = ids.map(async (id) => {
      const res = await fetch(`${baseUrl}/wp-json/wp/v2/media/${id}`, {
        next: { revalidate: 3600 },
      });
      if (res.ok) {
        const data = await res.json();
        return [
          id,
          {
            url: data.source_url || data.guid?.rendered || "",
            alt: data.alt_text || data.title?.rendered || "",
          },
        ] as const;
      }
      return null;
    });

    const settled = await Promise.allSettled(promises);
    settled.forEach((result) => {
      if (result.status === "fulfilled" && result.value) {
        const [id, data] = result.value;
        results.set(id, data);
      }
    });
  } catch (error) {
    console.error("[HeroSlider] Batch image fetch failed:", error);
  }

  return results;
}

function extractImageData(image: unknown): { url: string; alt: string } | null {
  if (!image) return null;
  if (typeof image === "string") return { url: image, alt: "" };
  if (typeof image === "number") return null;

  if (typeof image === "object" && image !== null) {
    const o = image as Record<string, unknown>;
    let url =
      (typeof o.url === "string" ? o.url : "") ||
      (typeof o.source_url === "string" ? o.source_url : "") ||
      (typeof (o.guid as { rendered?: string })?.rendered === "string"
        ? (o.guid as { rendered: string }).rendered
        : "");
    if (!url && o.sizes && typeof o.sizes === "object") {
      const sizes = o.sizes as Record<string, string>;
      url =
        sizes.large ||
        sizes.medium_large ||
        sizes.medium ||
        sizes.full ||
        sizes.thumbnail ||
        Object.values(sizes).find((s) => typeof s === "string" && s.length > 0) ||
        "";
    }
    const alt =
      (typeof o.alt === "string" ? o.alt : "") ||
      (typeof o.alt_text === "string" ? o.alt_text : "") ||
      (typeof (o.title as { rendered?: string })?.rendered === "string"
        ? (o.title as { rendered: string }).rendered
        : "");
    return url ? { url, alt } : null;
  }

  return null;
}

function extractLink(item: ACFRepeaterItem): string | undefined {
  const l = item.link;
  if (l == null) return undefined;
  if (typeof l === "string") return l;
  if (typeof l === "object") {
    const o = l as { url?: string; href?: string };
    if (typeof o.url === "string" && o.url) return o.url;
    if (typeof o.href === "string" && o.href) return o.href;
  }
  return undefined;
}

function attachmentIdFromImageField(image: unknown): number | null {
  if (typeof image === "number" && Number.isFinite(image) && image > 0) {
    return Math.floor(image);
  }
  if (typeof image === "string" && /^\d+$/.test(image.trim())) {
    return Number(image.trim());
  }
  if (typeof image === "object" && image !== null) {
    const o = image as Record<string, unknown>;
    const idVal = o.ID ?? o.id;
    if (typeof idVal === "number" && Number.isFinite(idVal) && idVal > 0) {
      return Math.floor(idVal);
    }
    if (typeof idVal === "string" && /^\d+$/.test(idVal.trim())) {
      return Number(idVal.trim());
    }
  }
  return null;
}

async function transformACFItems(items: ACFRepeaterItem[]): Promise<SliderImage[]> {
  if (!Array.isArray(items) || !items.length) return [];

  const imageIds: number[] = [];
  items.forEach((item) => {
    const id = attachmentIdFromImageField(item.image);
    if (id != null) imageIds.push(id);
  });

  const imageMap = imageIds.length ? await fetchImagesByIds(imageIds) : new Map();

  const results: SliderImage[] = [];
  items.forEach((item) => {
    const link = extractLink(item);
    const id = attachmentIdFromImageField(item.image);
    if (id != null) {
      const imageData = imageMap.get(id);
      if (imageData?.url) {
        results.push({
          src: imageData.url,
          alt: imageData.alt,
          link,
        });
        return;
      }
    }
    const imageData = extractImageData(item.image);
    if (imageData?.url) {
      results.push({
        src: imageData.url,
        alt: imageData.alt,
        link,
      });
    }
  });

  return results.filter((img) => img.src?.trim());
}

async function fetchACFHeroData(): Promise<{
  left: SliderImage[];
  right: SliderImage[];
  mobileLeft: SliderImage[];
  mobileRight: SliderImage[];
}> {
  const empty = { left: [], right: [], mobileLeft: [], mobileRight: [] as SliderImage[] };
  const baseUrl = getWordPressRestBaseUrl().replace(/\/$/, "");
  if (!baseUrl) return empty;

  try {
    const acfLayers: Record<string, unknown>[] = [];

    const main = await fetchJsonAcf(baseUrl, "/wp-json/acf/v3/options/options");
    if (Object.keys(main).length) acfLayers.push(main);

    for (const slug of heroOptionsSlugCandidates()) {
      const encoded = encodeURIComponent(slug);
      const layer = await fetchJsonAcf(baseUrl, `/wp-json/acf/v3/options/${encoded}`);
      if (Object.keys(layer).length) acfLayers.push(layer);
    }

    const acf = mergeHeroAcf(...acfLayers);

    const leftBanner = (acf.left_side_banner as ACFRepeaterItem[] | undefined) || [];
    const rightBanner = (acf.right_side_banner as ACFRepeaterItem[] | undefined) || [];
    const mobileLeftBanner = (acf.mobile_left_side_banner as ACFRepeaterItem[] | undefined) || [];
    const mobileRightBanner = (acf.mobile_right_side_banner as ACFRepeaterItem[] | undefined) || [];

    const [left, right, mobileLeft, mobileRight] = await Promise.all([
      transformACFItems(leftBanner),
      transformACFItems(rightBanner),
      transformACFItems(mobileLeftBanner),
      transformACFItems(mobileRightBanner),
    ]);

    if (process.env.NODE_ENV === "development" && mobileLeftBanner.length && !mobileLeft.length) {
      console.warn(
        "[HeroSlider] mobile_left_side_banner has rows in ACF but no image URLs resolved. Check image return format (Image Array) and REST response."
      );
    }

    return { left, right, mobileLeft, mobileRight };
  } catch (error) {
    console.error("[HeroSlider] ACF fetch failed:", error);
    return empty;
  }
}

const getCachedACFData = cache(fetchACFHeroData);

export default async function HeroDualSliderServer() {
  const { left, right, mobileLeft, mobileRight } = await getCachedACFData();
  return (
    <HeroDualSlider
      leftImages={left}
      rightImages={right}
      mobileLeftImages={mobileLeft}
      mobileRightImages={mobileRight}
    />
  );
}
