// D:\nextjs\components\MarketingUpdatesSection.tsx

import { unstable_noStore } from "next/cache";
import { getMarketingUpdates } from "@/lib/api";
import { mapWpToFrontendUrl } from "@/lib/urlMapper";
import MarketingUpdatesDisplay, {
  type MarketingSectionItem,
} from "@/components/MarketingUpdatesDisplay";

export default async function MarketingUpdatesSection() {
  unstable_noStore();

  const data = await getMarketingUpdates();
  const raw = data?.acf?.marketing_updates;
  const updates = Array.isArray(raw) ? raw : [];

  if (updates.length === 0) return null;

  const parsedItems: MarketingSectionItem[] = updates
    .map((item: Record<string, unknown>) => {
      const marketing_link = item.marketing_link as
        | { url?: string; target?: string }
        | undefined;
      const marketing_image = item.marketing_image as
        | { url?: string; alt?: string }
        | undefined;
      const url = marketing_image?.url;
      if (!url) return null;
      return {
        href: mapWpToFrontendUrl(marketing_link?.url) || "#",
        target: marketing_link?.target || "_self",
        src: url,
        alt: marketing_image?.alt || "Marketing",
      };
    })
    .filter((x): x is MarketingSectionItem => x !== null);

  /** Keep ACF repeater order (was shuffleAndTake — random order every request). */
  if (!parsedItems.length) return null;

  return (
    <section className="mb-10 marketing-section">
      <MarketingUpdatesDisplay items={parsedItems} />
    </section>
  );
}
