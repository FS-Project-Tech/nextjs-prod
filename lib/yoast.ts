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
export function extractDescriptionsFromYoastHead(html: unknown): { meta?: string; og?: string } {
  if (typeof html !== "string" || !html.trim()) return {};
  const pick = (re: RegExp): string | undefined => {
    const m = html.match(re);
    const v = m?.[1];
    if (v == null || !String(v).trim()) return undefined;
    return decodeBasicHtmlEntities(String(v)).trim();
  };
  return {
    meta:
      pick(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i) ??
      pick(/<meta\s+content=["']([^"']*)["']\s+name=["']description["']/i),
    og:
      pick(/<meta\s+property=["']og:description["']\s+content=["']([^"']*)["']/i) ??
      pick(/<meta\s+content=["']([^"']*)["']\s+property=["']og:description["']/i),
  };
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
