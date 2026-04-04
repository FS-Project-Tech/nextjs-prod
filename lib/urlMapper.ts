export function mapWpToFrontendUrl(url?: string) {
  if (!url) return "#";

  const wpUrl = process.env.NEXT_PUBLIC_WP_URL;
  const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL;

  if (!wpUrl || !frontendUrl) return url;

  return url.replace(wpUrl, frontendUrl);
}
