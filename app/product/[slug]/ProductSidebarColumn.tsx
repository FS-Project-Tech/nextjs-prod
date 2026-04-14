import Image from "next/image";
import {
  fetchCategoryBannersWithInheritance,
  getBannerLinkUrl,
  bannerRowHasImage,
  resolveBannerRowImageUrl,
  resolvePromoImageUrl,
} from "@/lib/detail-banner";
import { getWordPressRestBaseUrl } from "@/lib/cms-pages";
import {
  DEFAULT_PRODUCT_SIDEBAR_BANNER_ALT,
  DEFAULT_PRODUCT_SIDEBAR_BANNER_SRC,
} from "@/lib/product-detail-defaults";
import { fetchGlobalPromotions } from "@/lib/promotions";
import { getActivePromotions } from "@/lib/getActivePromotions";
import type { WooCommerceProduct } from "@/lib/woocommerce";

export default async function ProductSidebarColumn({ product }: { product: WooCommerceProduct }) {
  const firstCategoryId = product.categories?.[0]?.id;
  const categoryIds = product.categories?.map((c) => c.id) || [];

  const [promotions, categoryBanners] = await Promise.all([
    fetchGlobalPromotions(),
    firstCategoryId ? fetchCategoryBannersWithInheritance(firstCategoryId) : Promise.resolve([]),
  ]);

  const activePromotions = getActivePromotions(promotions, categoryIds);
  const safeCategoryBanners = Array.isArray(categoryBanners) ? categoryBanners : [];
  const hasCategoryBanners = safeCategoryBanners.some((row) => bannerRowHasImage(row));
  const bannersToShow = hasCategoryBanners ? safeCategoryBanners : [];

  const wpRestBase = getWordPressRestBaseUrl();
  const resolvedSidebarBanners = await Promise.all(
    bannersToShow.map(async (row, i) => ({
      key: `banner-${i}`,
      link: getBannerLinkUrl(row),
      imgUrl: wpRestBase ? await resolveBannerRowImageUrl(row, wpRestBase) : null,
    }))
  );
  const visibleSidebarBanners = resolvedSidebarBanners.filter((b) => b.imgUrl);

  const resolvedPromos = await Promise.all(
    activePromotions.map(async (promo: any, i: number) => ({
      key: `promo-${i}`,
      promo,
      imgUrl: wpRestBase ? await resolvePromoImageUrl(promo, wpRestBase) : null,
      href: promo.link?.url || "#",
      alt:
        (promo.image &&
        typeof promo.image === "object" &&
        promo.image !== null &&
        "alt" in promo.image
          ? String((promo.image as { alt?: string }).alt || "")
          : "") || "",
    }))
  );
  const visiblePromos = resolvedPromos.filter((p) => p.imgUrl);

  const showDefaultStaticSidebarBanner = visibleSidebarBanners.length === 0;

  return (
    <aside className="flex flex-col lg:col-span-1 gap-6">
      {visibleSidebarBanners.map(({ key, link, imgUrl }) => (
        <a
          key={key}
          href={link}
          className="block overflow-hidden transition hover:opacity-95 h-[600px]"
        >
          <Image
            src={imgUrl!}
            alt="Banner"
            width={320}
            height={800}
            className="w-full h-full object-contain"
            sizes="320px"
          />
        </a>
      ))}
      {showDefaultStaticSidebarBanner ? (
        <div className="block h-[600px] w-full overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
          <Image
            src={DEFAULT_PRODUCT_SIDEBAR_BANNER_SRC}
            alt={DEFAULT_PRODUCT_SIDEBAR_BANNER_ALT}
            width={290}
            height={800}
            className="h-full w-full object-contain object-top"
            sizes="(max-width: 1024px) 100vw, 20vw"
            priority={false}
          />
        </div>
      ) : null}
      {visiblePromos.map(({ key, href, imgUrl, alt }) => (
        <a
          key={key}
          href={href}
          className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
        >
          <Image
            src={imgUrl!}
            alt={alt}
            width={320}
            height={520}
            className="h-[590px] w-full object-cover"
          />
        </a>
      ))}
    </aside>
  );
}
