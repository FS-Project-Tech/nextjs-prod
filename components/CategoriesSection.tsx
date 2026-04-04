// D:\nextjs\components\CategoriesSection.tsx
import { getFeaturedCategories } from "@/lib/api";
import { mapWpToFrontendUrl } from "@/lib/urlMapper";
import CategoriesSectionDisplay, {
  type CategorySectionItem,
} from "@/components/CategoriesSectionDisplay";

export default async function CategoriesSection() {
  const data = await getFeaturedCategories();
  const updates = data?.acf?.featured_category;

  if (!updates || updates.length === 0) return null;

  const items: CategorySectionItem[] = updates
    .map((item: Record<string, unknown>) => {
      const category_link = item.category_link as { url?: string; target?: string } | undefined;
      const category_image = item.category_image as { url?: string; alt?: string } | undefined;
      const url = category_image?.url;
      if (!url) return null;
      return {
        href: mapWpToFrontendUrl(category_link?.url) || "#",
        target: category_link?.target || "_self",
        src: url,
        alt: category_image?.alt || "Featured Category",
      };
    })
    .filter((x): x is CategorySectionItem => x !== null);

  if (!items.length) return null;

  return (
    <section className="mb-10 marketing-section">
      <CategoriesSectionDisplay items={items} />
    </section>
  );
}
