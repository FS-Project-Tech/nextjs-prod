/**
 * WordPress events (custom post type) for headless /events routes.
 *
 * Optional: NEXT_PUBLIC_WP_EVENTS_REST_BASE — force a single REST base (e.g. "event").
 * If unset, probes common bases in order: events → event → tribe_events
 */

const WP_URL = process.env.NEXT_PUBLIC_WP_URL || "";

const EXPLICIT_REST_BASE = process.env.NEXT_PUBLIC_WP_EVENTS_REST_BASE?.replace(/^\/+|\/+$/g, "");

/** Bases tried when env is not set (The Events Calendar often uses tribe_events). */
const FALLBACK_REST_BASES = ["events", "event", "tribe_events"] as const;

export interface WpEvent {
  id: number;
  slug: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  date: string;
  modified: string;
  featured_media: number;
  /** Present when ACF (or similar) exposes fields on the REST post object */
  acf?: Record<string, unknown>;
  /** Post meta registered for REST (gallery IDs, etc.) */
  meta?: Record<string, unknown>;
  _embedded?: {
    "wp:featuredmedia"?: Array<{
      source_url: string;
      alt_text?: string;
    }>;
  };
}

export type EventGalleryImage = { src: string; alt: string };

/** ACF field names to read first (in order). Override via NEXT_PUBLIC_WP_EVENTS_GALLERY_ACF_KEYS=comma,separated */
const DEFAULT_GALLERY_ACF_KEYS = [
  "event_gallery",
  "gallery",
  "event_images",
  "images",
  "image_gallery",
  "additional_images",
  "photos",
  "event_photos",
];

function configuredGalleryKeys(): string[] {
  const raw = process.env.NEXT_PUBLIC_WP_EVENTS_GALLERY_ACF_KEYS?.trim();
  if (!raw) return DEFAULT_GALLERY_ACF_KEYS;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** If ACF stores JSON in a string, parse once. */
function tryParseAcfJsonString(v: unknown): unknown {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s.startsWith("[") && !s.startsWith("{")) return null;
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return null;
  }
}

/** Extract image URLs from nested ACF values (gallery, repeater rows, single image). */
function flattenAcfImages(val: unknown): EventGalleryImage[] {
  if (!val) return [];
  const asJson = tryParseAcfJsonString(val);
  if (asJson !== null) return flattenAcfImages(asJson);
  if (Array.isArray(val)) {
    const out: EventGalleryImage[] = [];
    for (const item of val) {
      out.push(...flattenAcfImages(item));
    }
    return out;
  }
  if (typeof val !== "object") return [];
  const o = val as Record<string, unknown>;

  if (typeof o.url === "string" && o.url) {
    const alt =
      (typeof o.alt === "string" && o.alt) || (typeof o.alt_text === "string" && o.alt_text) || "";
    return [{ src: o.url, alt }];
  }
  if (o.sizes && typeof o.sizes === "object") {
    const sizes = o.sizes as Record<string, string>;
    const src =
      sizes.large ||
      sizes["1536x1536"] ||
      sizes.medium_large ||
      sizes.full ||
      sizes.medium ||
      Object.values(sizes).find((v) => typeof v === "string" && v.length > 4);
    if (src) {
      const alt =
        (typeof o.alt === "string" && o.alt) ||
        (typeof o.alt_text === "string" && o.alt_text) ||
        "";
      return [{ src, alt }];
    }
  }

  const nested: EventGalleryImage[] = [];
  for (const v of Object.values(o)) {
    nested.push(...flattenAcfImages(v));
  }
  return nested;
}

function normalizeUrlKey(url: string): string {
  try {
    return url.split("?")[0] || url;
  } catch {
    return url;
  }
}

/**
 * Collect attachment IDs (ACF gallery often returns [123,456] or [{ID:123}] only in REST).
 * Order is preserved; duplicates skipped.
 */
function extractOrderedAttachmentIds(val: unknown): number[] {
  const ordered: number[] = [];
  const seen = new Set<number>();

  function add(id: number) {
    if (!Number.isFinite(id) || id < 1) return;
    const n = Math.floor(id);
    if (seen.has(n)) return;
    seen.add(n);
    ordered.push(n);
  }

  function walk(v: unknown) {
    if (v == null) return;
    const parsed = tryParseAcfJsonString(v);
    if (parsed !== null) {
      walk(parsed);
      return;
    }
    if (typeof v === "number") {
      add(v);
      return;
    }
    if (typeof v === "string") {
      const t = v.trim();
      if (/^\d+$/.test(t)) {
        add(parseInt(t, 10));
        return;
      }
      /* ACF / meta: "101,102,103" or "101, 102" */
      const commaParts = t
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (commaParts.length > 1 && commaParts.every((p) => /^\d+$/.test(p))) {
        for (const p of commaParts) add(parseInt(p, 10));
        return;
      }
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.ID === "number") add(o.ID);
      else if (typeof o.id === "number") add(o.id);
      else if (typeof o.attachment_id === "number") add(o.attachment_id);
      for (const [key, child] of Object.entries(o)) {
        if (key === "ID" || key === "id" || key === "attachment_id") continue;
        walk(child);
      }
    }
  }

  walk(val);
  return ordered;
}

/** Resolve WP attachment IDs to full-size URLs (batched). */
async function fetchWpMediaByIds(orderedIds: number[]): Promise<EventGalleryImage[]> {
  if (!WP_URL || orderedIds.length === 0) return [];

  const unique: number[] = [];
  const seen = new Set<number>();
  for (const id of orderedIds) {
    const n = Math.floor(id);
    if (n < 1 || seen.has(n)) continue;
    seen.add(n);
    unique.push(n);
  }

  const results: EventGalleryImage[] = [];
  const batchSize = 100;

  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const url = `${WP_URL}/wp-json/wp/v2/media?include=${batch.join(",")}&per_page=${batch.length}`;
    try {
      const res = await fetch(url, { next: { revalidate: 300 } });
      if (!res.ok) continue;
      const items: Array<{
        id: number;
        source_url?: string;
        guid?: { rendered?: string };
        alt_text?: string;
      }> = await res.json();
      if (!Array.isArray(items)) continue;
      const byId = new Map<
        number,
        {
          source_url?: string;
          guid?: { rendered?: string };
          alt_text?: string;
        }
      >();
      for (const m of items) {
        if (m && typeof m.id === "number") byId.set(m.id, m);
      }
      for (const id of batch) {
        const m = byId.get(id);
        if (!m) continue;
        const src =
          (typeof m.source_url === "string" && m.source_url) ||
          (typeof m.guid?.rendered === "string" && m.guid.rendered) ||
          "";
        if (!src) continue;
        results.push({
          src,
          alt: typeof m.alt_text === "string" ? m.alt_text : "",
        });
      }
    } catch {
      /* ignore batch */
    }
  }

  return results;
}

/** Images uploaded while editing this post (`post_parent` = event ID). */
async function fetchMediaAttachedToPost(parentId: number): Promise<EventGalleryImage[]> {
  if (!WP_URL || parentId < 1) return [];
  const results: EventGalleryImage[] = [];
  let page = 1;
  const perPage = 100;
  const maxPages = 15;

  while (page <= maxPages) {
    const search = new URLSearchParams();
    search.set("parent", String(parentId));
    search.set("media_type", "image");
    search.set("per_page", String(perPage));
    search.set("page", String(page));
    search.set("orderby", "id");
    search.set("order", "asc");

    try {
      const res = await fetch(`${WP_URL}/wp-json/wp/v2/media?${search.toString()}`, {
        next: { revalidate: 300 },
      });
      if (!res.ok) break;
      const items: Array<{
        id: number;
        source_url?: string;
        guid?: { rendered?: string };
        alt_text?: string;
      }> = await res.json();
      if (!Array.isArray(items) || items.length === 0) break;
      for (const m of items) {
        const src =
          (typeof m.source_url === "string" && m.source_url) ||
          (typeof m.guid?.rendered === "string" && m.guid.rendered) ||
          "";
        if (!src) continue;
        results.push({
          src,
          alt: typeof m.alt_text === "string" ? m.alt_text : "",
        });
      }
      const totalPages = parseInt(res.headers.get("X-WP-TotalPages") || "1", 10) || 1;
      if (page >= totalPages) break;
      page++;
    } catch {
      break;
    }
  }

  return results;
}

/** Gutenberg / classic: &lt;img&gt; tags inside post content (gallery blocks). */
function extractImagesFromEventHtml(html: string): EventGalleryImage[] {
  if (!html) return [];
  const out: EventGalleryImage[] = [];
  const seenLocal = new Set<string>();

  function add(src: string, alt: string) {
    if (!src || src.startsWith("data:")) return;
    const key = normalizeUrlKey(src);
    if (seenLocal.has(key)) return;
    seenLocal.add(key);
    out.push({ src, alt: alt || "" });
  }

  const chunkRe = /<img[^>]+>/gi;
  let m: RegExpExecArray | null;
  while ((m = chunkRe.exec(html)) !== null) {
    const tag = m[0];
    const srcMatch = /\bsrc=["']([^"']+)["']/i.exec(tag);
    const altMatch = /\balt=["']([^"']*)["']/i.exec(tag);
    if (srcMatch?.[1]) add(srcMatch[1], altMatch?.[1] || "");
  }

  return out;
}

function isGalleryRelatedAcfKey(key: string): boolean {
  return /gallery|image|photo|picture|media|attachment|banner|slider|file/.test(key.toLowerCase());
}

function isGalleryRelatedMetaKey(key: string): boolean {
  const k = key.toLowerCase();
  return isGalleryRelatedAcfKey(k) || /_thumbnail|image_ids|gallery_ids|photos|slides/.test(k);
}

/**
 * Collect URL-based images + ordered attachment IDs from ACF (no network).
 */
function collectAcfUrlsAndIdOrder(event: WpEvent): {
  urlImages: EventGalleryImage[];
  attachmentIds: number[];
} {
  const urlImages: EventGalleryImage[] = [];
  const attachmentIds: number[] = [];
  const idSeen = new Set<number>();

  function pushIdsFrom(val: unknown) {
    for (const id of extractOrderedAttachmentIds(val)) {
      if (idSeen.has(id)) continue;
      idSeen.add(id);
      attachmentIds.push(id);
    }
  }

  const acf = event.acf && typeof event.acf === "object" ? event.acf : undefined;

  if (acf) {
    const preferred = configuredGalleryKeys();
    const used = new Set<string>();

    for (const field of preferred) {
      if (!(field in acf)) continue;
      used.add(field);
      const val = acf[field];
      for (const img of flattenAcfImages(val)) urlImages.push(img);
      pushIdsFrom(val);
    }

    for (const key of Object.keys(acf)) {
      if (used.has(key)) continue;
      const val = acf[key];
      if (!isGalleryRelatedAcfKey(key)) continue;
      for (const img of flattenAcfImages(val)) urlImages.push(img);
      pushIdsFrom(val);
    }
  }

  const meta =
    event.meta && typeof event.meta === "object" && !Array.isArray(event.meta)
      ? event.meta
      : undefined;
  if (meta) {
    for (const [key, val] of Object.entries(meta)) {
      if (!isGalleryRelatedMetaKey(key)) continue;
      for (const img of flattenAcfImages(val)) urlImages.push(img);
      pushIdsFrom(val);
    }
  }

  return { urlImages, attachmentIds };
}

/**
 * All images for the event: featured first, then ACF URLs, then attachment IDs resolved via `/wp/v2/media`.
 * Use this from Server Components — ACF galleries often return **IDs only**, which need a media fetch.
 *
 * @param contentHtmlForGallery Optional raw post HTML (e.g. before stripping `wp-block-gallery`) so &lt;img&gt; tags are found.
 */
export async function resolveEventGalleryImages(
  event: WpEvent,
  contentHtmlForGallery?: string | null
): Promise<EventGalleryImage[]> {
  const seen = new Set<string>();
  const out: EventGalleryImage[] = [];

  function add(img: EventGalleryImage) {
    const key = normalizeUrlKey(img.src);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ src: img.src, alt: img.alt || "" });
  }

  const featured = event._embedded?.["wp:featuredmedia"]?.[0];
  if (featured?.source_url) {
    add({
      src: featured.source_url,
      alt: featured.alt_text || "",
    });
  }

  const { urlImages, attachmentIds } = collectAcfUrlsAndIdOrder(event);
  for (const img of urlImages) add(img);

  const fromMedia = await fetchWpMediaByIds(attachmentIds);
  for (const img of fromMedia) add(img);

  /* Uploads attached to this event (often not duplicated in ACF). */
  const fromParent = await fetchMediaAttachedToPost(event.id);
  for (const img of fromParent) add(img);

  /* Gallery block / inline images inside post HTML */
  const htmlSrc = contentHtmlForGallery ?? event.content?.rendered ?? "";
  for (const img of extractImagesFromEventHtml(htmlSrc)) {
    add(img);
  }

  return out;
}

export function decodeHTMLEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

async function probeRestBase(base: string): Promise<boolean> {
  if (!WP_URL) return false;
  try {
    const res = await fetch(`${WP_URL}/wp-json/wp/v2/${base}?per_page=1`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data);
  } catch {
    return false;
  }
}

let restBasePromise: Promise<string> | null = null;

/**
 * Resolve WP REST collection slug for events CPT.
 */
export async function getEventsRestBase(): Promise<string> {
  if (!WP_URL) return "events";
  if (EXPLICIT_REST_BASE) return EXPLICIT_REST_BASE;

  if (!restBasePromise) {
    restBasePromise = (async () => {
      for (const base of FALLBACK_REST_BASES) {
        if (await probeRestBase(base)) return base;
      }
      return "events";
    })();
  }
  return restBasePromise;
}

function buildListUrl(base: string, search: URLSearchParams): string {
  return `${WP_URL}/wp-json/wp/v2/${base}?${search.toString()}`;
}

export type FetchEventsMeta = {
  /** True when WP URL is set and REST returned a JSON array (may be empty). */
  apiOk: boolean;
  /** Rest base used for the request (after resolve). */
  restBase: string;
};

export async function fetchEvents(params?: {
  per?: number;
  page?: number;
}): Promise<{ events: WpEvent[]; totalPages: number; meta: FetchEventsMeta }> {
  if (!WP_URL) {
    return {
      events: [],
      totalPages: 0,
      meta: { apiOk: false, restBase: "events" },
    };
  }
  try {
    const base = await getEventsRestBase();
    const per = params?.per ?? 10;
    const search = new URLSearchParams();
    search.set("per_page", String(per));
    search.set("page", String(params?.page ?? 1));
    search.set("_embed", "1");

    const res = await fetch(buildListUrl(base, search), {
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return {
        events: [],
        totalPages: 0,
        meta: { apiOk: false, restBase: base },
      };
    }
    const payload = await res.json();
    if (!Array.isArray(payload)) {
      return {
        events: [],
        totalPages: 0,
        meta: { apiOk: false, restBase: base },
      };
    }
    const totalPages = parseInt(res.headers.get("X-WP-TotalPages") || "1", 10) || 1;
    return {
      events: payload,
      totalPages,
      meta: { apiOk: true, restBase: base },
    };
  } catch {
    return {
      events: [],
      totalPages: 0,
      meta: { apiOk: false, restBase: EXPLICIT_REST_BASE || "events" },
    };
  }
}

/**
 * ACF to REST v3: /wp-json/acf/v3/{post_type}/{id}
 * Post type slug is often singular (event) while REST collection is events.
 */
async function fetchAcfFieldsForEventPost(
  postId: number,
  restCollectionBase: string
): Promise<Record<string, unknown>> {
  if (!WP_URL || !postId) return {};

  const singular =
    restCollectionBase.replace(/s$/, "") === restCollectionBase
      ? restCollectionBase
      : restCollectionBase.replace(/s$/, "");

  const candidates = [singular, restCollectionBase, "event", "events"].filter(
    (v, i, a) => a.indexOf(v) === i
  );

  for (const postType of candidates) {
    try {
      const res = await fetch(`${WP_URL}/wp-json/acf/v3/${postType}/${postId}`, {
        next: { revalidate: 60 },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const acf = data?.acf;
      if (acf && typeof acf === "object" && !Array.isArray(acf)) {
        return acf as Record<string, unknown>;
      }
    } catch {
      /* try next */
    }
  }
  return {};
}

/** Single post URL usually returns fuller `meta` / `acf` than the collection ?slug= query. */
async function fetchEventByRestId(id: number, restCollectionBase: string): Promise<WpEvent | null> {
  if (!WP_URL || id < 1) return null;
  try {
    const res = await fetch(`${WP_URL}/wp-json/wp/v2/${restCollectionBase}/${id}?_embed=1`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const full = await res.json();
    return full?.id ? (full as WpEvent) : null;
  } catch {
    return null;
  }
}

/**
 * Remove Gutenberg gallery markup so the same images are not shown twice
 * (they are shown in the Photos section after extraction).
 */
export function stripWpBlockGalleriesFromHtml(html: string): string {
  if (!html) return "";
  let out = html;
  let prev = "";
  /* Repeated pass for nested figures (rare) */
  while (out !== prev) {
    prev = out;
    out = out.replace(/<figure\b[^>]*\bwp-block-gallery\b[^>]*>[\s\S]*?<\/figure>/gi, "");
  }
  return out;
}

export async function fetchEventBySlug(slug: string): Promise<WpEvent | null> {
  if (!WP_URL || !slug) return null;
  try {
    const base = await getEventsRestBase();
    const search = new URLSearchParams();
    search.set("slug", slug);
    search.set("_embed", "1");
    const res = await fetch(buildListUrl(base, search), {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    let event: WpEvent | null = Array.isArray(data) ? (data[0] ?? null) : data;
    if (!event?.id) return event;

    const fromId = await fetchEventByRestId(event.id, base);
    if (fromId) {
      event = {
        ...fromId,
        _embedded: fromId._embedded || event._embedded,
      };
    }

    const acfFromRest =
      event.acf && typeof event.acf === "object" && !Array.isArray(event.acf)
        ? (event.acf as Record<string, unknown>)
        : {};

    const acfFromV3 = await fetchAcfFieldsForEventPost(event.id, base);

    /* V3 must win: REST patch often has empty arrays that overwrote full V3 data before. */
    const mergedAcf: Record<string, unknown> = { ...acfFromRest, ...acfFromV3 };

    return {
      ...event,
      acf: Object.keys(mergedAcf).length > 0 ? mergedAcf : event.acf,
    };
  } catch {
    return null;
  }
}

/** Lightweight fetch for sitemap (slug + modified only). */
export async function fetchAllEventSlugsForSitemap(): Promise<
  { slug: string; modified: string }[]
> {
  if (!WP_URL) return [];
  const base = await getEventsRestBase();
  const out: { slug: string; modified: string }[] = [];
  let page = 1;
  const perPage = 100;
  const maxPages = 50;

  while (page <= maxPages) {
    const search = new URLSearchParams();
    search.set("per_page", String(perPage));
    search.set("page", String(page));
    search.set("_fields", "slug,modified");

    const res = await fetch(buildListUrl(base, search), {
      next: { revalidate: 3600 },
    });
    if (!res.ok) break;
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;

    for (const row of batch) {
      if (row?.slug) {
        out.push({
          slug: String(row.slug),
          modified: row.modified || new Date().toISOString(),
        });
      }
    }

    const totalPages = parseInt(res.headers.get("X-WP-TotalPages") || "1", 10) || 1;
    if (page >= totalPages) break;
    page++;
  }

  return out;
}
