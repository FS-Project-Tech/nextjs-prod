/**
 * Public contact content — override with NEXT_PUBLIC_* `.env.local` when needed.
 * Defaults fill address, two phone groups, email, and map query if unset.
 *
 * Optional:
 * - NEXT_PUBLIC_CONTACT_MAP_EMBED_URL — full iframe `src from Google Maps → Share → Embed
 * - NEXT_PUBLIC_CONTACT_MAP_QUERY — place string for embed when using GOOGLE_MAPS_API_KEY
 * - NEXT_PUBLIC_CONTACT_OFFICE_PHONES / NEXT_PUBLIC_CONTACT_CUSTOMER_SERVICE_PHONES (comma-separated)
 * - NEXT_PUBLIC_CONTACT_OFFICE_LABEL / NEXT_PUBLIC_CONTACT_SERVICE_LABEL
 */
 
export type SiteContact = {
    email: string;
    addressLines: string[];
    officeLabel: string;
    officePhones: string[];
    serviceLabel: string;
    servicePhones: string[];
    calendlyUrl: string;
    /** Full iframe src URL for Google Maps embed */
    mapEmbedUrl: string;
  };
   
  function getEnv(key: string): string {
    return process.env[key]?.trim() || "";
  }
   
  function splitPhones(raw: string): string[] {
    return raw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
  }
   
  function splitAddress(raw: string): string[] {
    return raw
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
  }
   
  /** Default map: prefer explicit embed URL, else Maps Embed API if key exists, else legacy output=embed */
  function resolveMapEmbedUrl(): string {
    const custom = getEnv("NEXT_PUBLIC_CONTACT_MAP_EMBED_URL");
    if (custom) return custom;
   
    const q = encodeURIComponent(
      getEnv("NEXT_PUBLIC_CONTACT_MAP_QUERY") ||
        "6/7 Hansen Court, Coomera QLD 4209, Australia"
    );
   
    const gKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
    if (gKey) {
      return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(gKey)}&q=${q}`;
    }
   
    return `https://maps.google.com/maps?q=${q}&hl=en&z=15&output=embed`;
  }
   
  const DEFAULT_EMAIL = "info@joyamedicalsupplies.com.au";
  const DEFAULT_OFFICE_PHONES = "07 5564 6628,1300 005 032";
  const DEFAULT_SERVICE_PHONES = "07 5564 6628,0430 393 124,1300 005 032";
  const DEFAULT_ADDRESS_LINES = ["6/7 Hansen Court, Coomera", "4209, QLD"];
   
  export function getSiteContact(): SiteContact {
    const email = getEnv("NEXT_PUBLIC_CONTACT_EMAIL") || DEFAULT_EMAIL;
   
    const addressRaw = getEnv("NEXT_PUBLIC_CONTACT_ADDRESS");
    const addressLines = addressRaw
      ? splitAddress(addressRaw)
      : DEFAULT_ADDRESS_LINES;
   
    const officePhonesRaw =
      getEnv("NEXT_PUBLIC_CONTACT_OFFICE_PHONES") || DEFAULT_OFFICE_PHONES;
    const servicePhonesRaw =
      getEnv("NEXT_PUBLIC_CONTACT_CUSTOMER_SERVICE_PHONES") || DEFAULT_SERVICE_PHONES;
   
    return {
      email,
      addressLines,
      officeLabel:
        getEnv("NEXT_PUBLIC_CONTACT_OFFICE_LABEL") || "Joya Medical Supplies",
      officePhones: splitPhones(officePhonesRaw),
      serviceLabel:
        getEnv("NEXT_PUBLIC_CONTACT_SERVICE_LABEL") || "Customer Service",
      servicePhones: splitPhones(servicePhonesRaw),
      calendlyUrl: getEnv("NEXT_PUBLIC_CONTACT_CALENDLY_URL"),
      mapEmbedUrl: resolveMapEmbedUrl(),
    };
  }