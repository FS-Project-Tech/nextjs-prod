// D:\nextjs\components\MarketingUpdatesSection.tsx

import { getMarketingUpdates } from "@/lib/api";
import { mapWpToFrontendUrl } from "@/lib/urlMapper";
import MarketingUpdatesDisplay, {
  type MarketingSectionItem,
} from "@/components/MarketingUpdatesDisplay";

export default async function MarketingUpdatesSection() {
  const data = await getMarketingUpdates();
  const updates = data?.acf?.marketing_updates;

  if (!updates || updates.length === 0) return null;

  const items: MarketingSectionItem[] = updates
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

  if (!items.length) return null;

  return (
    <section className="mb-10 marketing-section">
      <MarketingUpdatesDisplay items={items} />
    </section>
  );
}
