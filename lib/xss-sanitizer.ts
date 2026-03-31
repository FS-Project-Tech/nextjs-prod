 /**
 * Server-safe XSS Sanitization Utilities
 * NO jsdom
 * NO DOMPurify
 */
 
 import xss from 'xss';
 
 /**
  * Product content sanitizer (allows limited HTML)
  */
 export function sanitizeHTML(
   html: string | null | undefined,
   options: {
     allowLinks?: boolean;
     allowImages?: boolean;
     strict?: boolean;
   } = {}
 ): string {
   if (!html || typeof html !== 'string') return '';
  
   const { allowLinks = true, allowImages = true, strict = false } = options;
  
   if (strict) {
     return stripHTML(html);
   }
  
   return xss(html, {
     whiteList: {
       p: [],
       br: [],
       strong: [],
       b: [],
       em: [],
       i: [],
       ul: [],
       ol: [],
       li: [],
       h1: [],
       h2: [],
       h3: [],
       h4: [],
       h5: [],
       h6: [],
       blockquote: [],
       code: [],
       pre: [],
       ...(allowLinks
         ? { a: ['href', 'title', 'target', 'rel', 'class'] }
         : {}),
         ...(allowImages
           ? {
               img: ['src', 'alt', 'width', 'height', 'loading', 'class', 'style'],
               figure: ['class', 'style'],
               figcaption: ['class'],
             }
           : {}),
         details: ['open'],
         summary: [],
     },
     stripIgnoreTag: true,
     stripIgnoreTagBody: ['script', 'style'],
   });
 }
  
 /**
  * WordPress page / Gutenberg content — allows block wrappers (columns, groups) via class only.
  * Use for headless WP pages where layout relies on wp-block-* classes.
  */
 export function sanitizeWordPressPageHTML(
   html: string | null | undefined
 ): string {
   if (!html || typeof html !== "string") return "";
  
   return xss(html, {
     whiteList: {
       p: ["class"],
       br: [],
       strong: ["class"],
       b: [],
       em: [],
       i: [],
       u: [],
       ul: ["class"],
       ol: ["class"],
       li: ["class"],
       h1: ["class"],
       h2: ["class"],
       h3: ["class"],
       h4: ["class"],
       h5: ["class"],
       h6: ["class"],
       blockquote: ["class"],
       code: [],
       pre: ["class"],
       a: ["href", "title", "target", "rel", "class"],
       img: ["src", "alt", "width", "height", "loading", "class", "decoding"],
       figure: ["class"],
       figcaption: ["class"],
       div: ["class", "id"],
       section: ["class", "id"],
       article: ["class"],
       span: ["class"],
       details: ["open", "class"],
       summary: ["class"],
       hr: ["class"],
       table: ["class"],
       thead: ["class"],
       tbody: ["class"],
       tr: ["class"],
       th: ["class"],
       td: ["class"],
     },
     stripIgnoreTag: true,
     stripIgnoreTagBody: ["script", "style", "iframe", "object", "embed"],
   });
 }
  
 /**
  * Review sanitizer (very strict)
  */
 export function sanitizeReview(html: string | null | undefined): string {
   if (!html || typeof html !== 'string') return '';
  
   return xss(html, {
     whiteList: {
       p: [],
       br: [],
       strong: [],
       b: [],
       em: [],
       i: [],
       ul: [],
       ol: [],
       li: [],
     },
     stripIgnoreTag: true,
   });
 }
  
 /**
  * Strip ALL HTML
  */
 export function stripHTML(html: string | null | undefined): string {
   if (!html || typeof html !== 'string') return '';
  
   return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
 }
  
 /**
  * Decode HTML entities (e.g. &amp;, &hellip;, &#39;)
  */
 export function decodeHTMLEntities(str: string): string {
   return str
     .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
     .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
     .replace(/&amp;/g, "&")
     .replace(/&lt;/g, "<")
     .replace(/&gt;/g, ">")
     .replace(/&quot;/g, '"')
     .replace(/&#39;|&apos;/g, "'")
     .replace(/&nbsp;/g, " ")
     .replace(/&hellip;/g, "…")
     .replace(/&ndash;/g, "–")
     .replace(/&mdash;/g, "—");
 }
  
 /**
  * Escape HTML entities
  */
 export function escapeHTML(text: string | null | undefined): string {
   if (!text || typeof text !== 'string') return '';
  
   return text
     .replace(/&/g, '&amp;')
     .replace(/</g, '&lt;')
     .replace(/>/g, '&gt;')
     .replace(/"/g, '&quot;')
     .replace(/'/g, '&#39;');
 }
  
 /**
  * Safe HTML type
  */
 export interface SafeHTML {
   __html: string;
   __sanitized: true;
 }
  
 /**
  * Create safe HTML for dangerouslySetInnerHTML
  */
 export function createSafeHTML(
   html: string | null | undefined,
   options?: Parameters<typeof sanitizeHTML>[1]
 ): SafeHTML {
   return {
     __html: sanitizeHTML(html, options),
     __sanitized: true,
   };
 }