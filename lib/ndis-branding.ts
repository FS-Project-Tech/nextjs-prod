/**
 * NDIS logo URL for product CTAs, badges, etc.
 * Set `NEXT_PUBLIC_NDIS_LOGO_URL` in `.env.local` to your CMS asset (SVG/PNG recommended ~56×40).
 */
export const DEFAULT_NDIS_LOGO_PATH = "/ndis-logo.svg";

const WP_NDIS_LOGO_FALLBACK =
  "https://live.joyamedicalsupplies.com.au/wp-content/uploads/2026/04/ndis-logo.svg";

export function getNdisLogoUrl(override?: string | null): string {
  const fromProp = override?.trim();
  if (fromProp) return fromProp;

  const fromEnv = process.env.NEXT_PUBLIC_NDIS_LOGO_URL?.trim();
  if (fromEnv) return fromEnv;

  if (process.env.NEXT_PUBLIC_NDIS_LOGO_USE_WP_FALLBACK === "true") {
    return WP_NDIS_LOGO_FALLBACK;
  }

  return DEFAULT_NDIS_LOGO_PATH;
}

/** Hero / section imagery (separate from logo mark). */
export function getNdisHeroImageUrl(): string {
  return (
    process.env.NEXT_PUBLIC_NDIS_IMAGE_URL?.trim() ||
    "https://live.joyamedicalsupplies.com.au/wp-content/uploads/2026/04/ndis-homepage.avif"
  );
}
