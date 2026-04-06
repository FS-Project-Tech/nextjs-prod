/**
 * WordPress Telehealth page: split main copy vs video/embed column.
 *
 * **Option A (optional):** Custom HTML block between copy and video:
 * `<!-- joya-telehealth-split -->`
 *
 * **Option B (default):** Put your paragraphs first, then add a **YouTube / Embed** or **Video** block.
 * The first embed/video/iframe (YouTube, Vimeo, …) is detected and shown in the right column automatically.
 */
 
/** HTML comment marker (Custom HTML block in WordPress). */
export const TELEHEALTH_SPLIT_MARKER = /<!--\s*joya-telehealth-split\s*-->/i;
 
/**
 * First Gutenberg embed / video / common iframe in rendered HTML (REST `content.rendered`).
 * Matches from `<figure class="wp-block-embed` … or self-hosted video, or iframe pointing at known hosts.
 */
const AUTO_MEDIA_START =
  /(?:<figure\s[^>]*\bwp-block-embed\b|<figure\s[^>]*\bwp-block-video\b|<video[\s>]|<iframe\s[^>]*\bsrc=["'][^"']*(?:youtube(?:-nocookie)?\.com|youtu\.be|vimeo\.com|player\.vimeo\.com))/i;
 
export function splitTelehealthBody(html: string): { copyHtml: string; mediaHtml: string } {
  const raw = String(html || "").trim();
  if (!raw) return { copyHtml: "", mediaHtml: "" };
 
  const markerParts = raw.split(TELEHEALTH_SPLIT_MARKER);
  if (markerParts.length >= 2) {
    return {
      copyHtml: markerParts[0].trim(),
      mediaHtml: markerParts.slice(1).join("").trim(),
    };
  }
 
  const m = AUTO_MEDIA_START.exec(raw);
  if (m != null && m.index !== undefined) {
    if (m.index > 0) {
      return {
        copyHtml: raw.slice(0, m.index).trim(),
        mediaHtml: raw.slice(m.index).trim(),
      };
    }
    return { copyHtml: "", mediaHtml: raw };
  }
 
  return { copyHtml: raw, mediaHtml: "" };
}