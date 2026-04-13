/**
 * Server-side fetch helpers for routes protected by `x-api-key` when NEXT_PUBLIC_API_KEY is set.
 */

export function getPublicApiKeyHeaders(): Record<string, string> {
  const k = process.env.NEXT_PUBLIC_API_KEY?.trim();
  return k ? { "x-api-key": k } : {};
}
