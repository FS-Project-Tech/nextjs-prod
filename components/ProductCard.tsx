"use client";

import Image from "next/image";
import Link from "next/link";
import { memo, useState, useCallback, useMemo, type MouseEvent } from "react";
import { useCart } from "@/components/CartProvider";
import { useToast } from "@/components/ToastProvider";
import { WishlistButton } from "@/components/WishlistButton";
import { formatPriceWithLabel } from "@/lib/format-utils";

// ============================================================================
// Types
// ============================================================================

export interface ProductCardProps {
  id: number;
  slug: string;
  name: string;
  sku?: string | null;
  price: string;
  sale_price?: string;
  regular_price?: string;
  on_sale?: boolean;
  imageUrl?: string;
  imageAlt?: string;
  tax_class?: string;
  tax_status?: string;
  average_rating?: string;
  rating_count?: number;
  /** Priority loading for above-the-fold cards */
  priority?: boolean;
  /** Compact mode for smaller displays */
  compact?: boolean;
  /** Sale/discount % from backend; shown in corner badge when on sale */
  sale_percentage?: number | null;
  tags?: { id: number; name: string; slug: string }[];
  brands?: { id: number; name: string; slug: string }[];
}

interface PriceData {
  regular: number;
  current: number;
  isOnSale: boolean;
  discount: number;
  savings: string;
  formattedRegular: string;
  formattedRegularExcl: string;
  formattedCurrent: string;
  label: string;
  exclPrice: string | null;
  isGstFree: boolean;
}

interface RatingData {
  avg: number;
  count: number;
}

// ============================================================================
// Constants
// ============================================================================

const PLACEHOLDER_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Crect fill='%23f3f4f6' width='400' height='400'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-family='system-ui' font-size='14'%3ENo Image%3C/text%3E%3C/svg%3E";

// SVG paths as constants to avoid recreation
const CART_ICON_PATH =
  "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-1.5 6h12.2M7 13L5 5m2 14a1 1 0 110-2 1 1 0 010 2zm9 0a1 1 0 110-2 1 1 0 010 2z";
const STAR_ICON_PATH =
  "M10 15l-5.878 3.09 1.123-6.545L.49 6.91l6.564-.954L10 0l2.946 5.956 6.564.954-4.755 4.635 1.123 6.545z";

// ============================================================================
// Helper Functions (outside component to avoid recreation)
// ============================================================================

function calculatePriceData(
  price: string,
  salePrice?: string,
  regularPrice?: string,
  onSale?: boolean,
  taxClass?: string,
  taxStatus?: string
): PriceData {
  const regular = regularPrice ? parseFloat(regularPrice) : 0;
  const sale = salePrice ? parseFloat(salePrice) : 0;

  const current = sale > 0 ? sale : parseFloat(price || "0");

  const isOnSale = regular > 0 && sale > 0 && sale < regular;

  const discount = isOnSale ? Math.round(((regular - sale) / regular) * 100) : 0;

  const savingsAmount = isOnSale ? regular - sale : 0;
  const savings = savingsAmount > 0 ? `$${savingsAmount.toFixed(2)}` : "";

  let formattedPrice = `$${current.toFixed(2)}`;
  let label = "Price";
  let exclPrice: string | null = null;
  let isGstFree = false;

  const formattedRegularExcl = `$${regular.toFixed(2)}`;
  try {
    const priceInfo = formatPriceWithLabel(current, taxClass, taxStatus);
    formattedPrice = priceInfo.price;
    label = priceInfo.label || label;
    exclPrice = priceInfo.exclPrice || null;
    isGstFree = priceInfo.taxType === "gst_free";
  } catch {}

  return {
    regular,
    current,
    isOnSale,
    discount,
    savings,
    formattedRegular: `$${regular.toFixed(2)}`,
    formattedRegularExcl,
    formattedCurrent: formattedPrice,
    label,
    exclPrice,
    isGstFree,
  };
}

function calculateRatingData(ratingCount?: number, averageRating?: string): RatingData | null {
  const count = Number(ratingCount || 0);
  if (count <= 0) return null;

  const avg = parseFloat(averageRating || "0") || 0;
  const clampedAvg = Math.max(0, Math.min(5, avg));

  return isNaN(clampedAvg) ? null : { avg: Math.round(clampedAvg), count };
}

// ============================================================================
// Sub-components (memoized for performance)
// ============================================================================

const StarRating = memo(function StarRating({ rating }: { rating: RatingData }) {
  return (
    <div
      className="mt-1 flex w-full items-center gap-1 md:mt-2"
      role="img"
      aria-label={`Rated ${rating.avg} out of 5 stars`}
    >
      <div className="flex gap-0.5 text-amber-400">
        {[0, 1, 2, 3, 4].map((i) => (
          <svg
            key={i}
            className={`h-4 w-4 ${i < rating.avg ? "fill-current" : "fill-gray-200"}`}
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path d={STAR_ICON_PATH} />
          </svg>
        ))}
      </div>
      <span className="text-xs text-gray-600">({rating.count})</span>
    </div>
  );
});

const DiscountBadge = memo(function DiscountBadge({
  discount,
  saleOnly,
}: {
  discount: number;
  saleOnly?: boolean;
}) {
  const showPercent = discount > 0;
  const showSale = saleOnly && discount <= 0;
  if (!showPercent && !showSale) return null;
  return (
    <span
      className="absolute bottom-2 right-2 hidden rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white md:inline-flex"
      aria-label={showPercent ? `${discount}% off` : "On sale"}
    >
      {showPercent ? `${discount}% OFF` : "Sale"}
    </span>
  );
});

/** Amazon-style promo strip — mobile only; desktop uses corner badge on image */
const MobilePromoBadge = memo(function MobilePromoBadge({
  discount,
  saleOnly,
}: {
  discount: number;
  saleOnly?: boolean;
}) {
  const showPercent = discount > 0;
  const showSale = saleOnly && discount <= 0;
  if (!showPercent && !showSale) return null;
  return (
    <div className="mb-1.5 md:hidden">
      <span
        className="inline-block rounded-sm bg-red-600 px-2 py-1 text-xs font-bold uppercase tracking-wide text-white"
        aria-label={showPercent ? `${discount}% off` : "On sale"}
      >
        {showPercent ? `${discount}% off` : "Sale"}
      </span>
    </div>
  );
});

const LoadingSpinner = memo(function LoadingSpinner() {
  return (
    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
});

// ============================================================================
// Main Component
// ============================================================================

function ProductCardComponent({
  id,
  slug,
  name,
  sku,
  price,
  sale_price,
  regular_price,
  on_sale,
  imageUrl,
  imageAlt,
  tax_class,
  tax_status,
  average_rating,
  rating_count,
  priority = false,
  compact = false,
  sale_percentage: salePercentageFromBackend,
}: ProductCardProps) {
  // Hooks
  const { addItem, open: openCart } = useCart();
  const { success, error: showError } = useToast();

  // Local state
  const [addingToCart, setAddingToCart] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Memoized calculations
  const priceData = useMemo(
    () => calculatePriceData(price, sale_price, regular_price, on_sale, tax_class, tax_status),
    [price, sale_price, regular_price, on_sale, tax_class, tax_status]
  );

  const ratingData = useMemo(
    () => calculateRatingData(rating_count, average_rating),
    [rating_count, average_rating]
  );

  const productUrl = useMemo(() => `/product/${slug}`, [slug]);

  // Stable image source
  const imageSrc = useMemo(() => {
    if (!imageUrl || imageUrl.trim() === "" || imageError) return PLACEHOLDER_IMAGE;
    return imageUrl;
  }, [imageUrl, imageError]);

  // Event handlers (useCallback for stable references)
  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);

  const handleAddToCart = useCallback(async () => {
    if (addingToCart) return;

    setAddingToCart(true);
    try {
      addItem({
        productId: id,
        name,
        slug,
        imageUrl: imageUrl || undefined,
        price: sale_price || price || "0",
        qty: 1,
        sku: sku || undefined,
        tax_class: tax_class || undefined,
        tax_status: tax_status || undefined,
      });

      openCart();
      success("Added to cart");
    } catch (err) {
      console.error("Cart error:", err);
      showError("Failed to add to cart");
    } finally {
      setAddingToCart(false);
    }
  }, [
    id,
    name,
    slug,
    imageUrl,
    price,
    sale_price,
    sku,
    tax_class,
    tax_status,
    addingToCart,
    addItem,
    openCart,
    success,
    showError,
  ]);

  const saleDiscountForBadge =
    salePercentageFromBackend != null && salePercentageFromBackend > 0
      ? salePercentageFromBackend
      : priceData.discount;
  const saleBadgeSaleOnly =
    on_sale &&
    !priceData.isOnSale &&
    (salePercentageFromBackend == null || salePercentageFromBackend <= 0);
  const showSaleBadge =
    (salePercentageFromBackend != null && salePercentageFromBackend > 0) ||
    priceData.isOnSale ||
    on_sale;

  return (
    <article
      className="grid h-full grid-cols-2 gap-3 rounded-xl border border-gray-200 bg-white p-3 transition hover:shadow-md md:grid-cols-1"
      style={{ contain: "layout style paint" }}
    >
      {/* Image column — 50% width on mobile; mobile wishlist under image (desktop: heart on image top-left) */}
      <div className="flex min-w-0 flex-col items-stretch gap-2">
        <Link
          href={productUrl}
          className="relative block w-full overflow-hidden rounded-lg bg-white"
          aria-label={`View ${name}`}
          prefetch={false}
        >
          <div className="relative aspect-square">
            <Image
              src={imageSrc}
              alt={imageAlt || name}
              fill
              sizes="(max-width: 768px) 45vw, (max-width: 1200px) 33vw, 25vw"
              className="object-contain p-2 md:p-4"
              onError={handleImageError}
            />

            <div className="absolute top-2 left-2 z-10 hidden md:block">
              <WishlistButton
                productId={id}
                size="sm"
                variant="icon"
                className="rounded-full bg-white shadow-sm transition hover:scale-110"
              />
            </div>

            {showSaleBadge ? (
              <DiscountBadge discount={saleDiscountForBadge} saleOnly={saleBadgeSaleOnly} />
            ) : null}
          </div>
        </Link>

        <div className="flex w-full justify-start md:hidden">
          <WishlistButton
            productId={id}
            size="sm"
            variant="icon"
            className="rounded-md border border-gray-200 bg-white shadow-sm transition hover:scale-105"
          />
        </div>
      </div>

      {/* Details column */}
      <div className="flex min-w-0 flex-col md:pt-3">
        <div className="min-h-0 flex-1">
          <Link
            href={productUrl}
            className="text-sm line-clamp-4 font-medium text-gray-900 md:line-clamp-2"
          >
            {name}
          </Link>

          <p className="mt-1 min-h-[18px] text-sm text-grey py-2">
            {sku ? `SKU: ${sku}` : "\u00A0"}
          </p>

          {ratingData ? <StarRating rating={ratingData} /> : null}
        </div>

        <div className="mt-auto min-h-[2.5rem] space-y-1 pt-2 sm:min-h-[3.5rem] md:pt-0">
          {showSaleBadge ? (
            <MobilePromoBadge discount={saleDiscountForBadge} saleOnly={saleBadgeSaleOnly} />
          ) : null}

          {priceData.isOnSale && (
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              <p className="text-sm text-gray-500 line-through">{priceData.formattedRegularExcl}</p>
              <span className="text-xs font-semibold text-green-600">Save {priceData.savings}</span>
            </div>
          )}

          <div className={priceData.isGstFree ? "text-emerald-700" : undefined}>
            {priceData.exclPrice ? (
              <p className="text-sm text-gray-600">Excl. GST: {priceData.exclPrice}</p>
            ) : null}
            <p className="text-lg font-bold text-teal md:text-[16px]">
              {priceData.label}: {priceData.formattedCurrent}
            </p>

            {priceData.isOnSale && (
              <div className="mt-0.5 text-xs text-gray-600 md:hidden">
                <span className="line-through">{priceData.formattedRegularExcl}</span>
                {priceData.discount > 0 ? (
                  <span className="ml-1 font-medium text-gray-800">({priceData.discount}% off)</span>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

// ============================================================================
// Export with memo + custom comparison
// ============================================================================

function propsAreEqual(prev: ProductCardProps, next: ProductCardProps): boolean {
  // Compare only props that affect rendering
  return (
    prev.id === next.id &&
    prev.slug === next.slug &&
    prev.name === next.name &&
    prev.sku === next.sku &&
    prev.price === next.price &&
    prev.sale_price === next.sale_price &&
    prev.regular_price === next.regular_price &&
    prev.on_sale === next.on_sale &&
    prev.imageUrl === next.imageUrl &&
    prev.tax_class === next.tax_class &&
    prev.tax_status === next.tax_status &&
    prev.average_rating === next.average_rating &&
    prev.rating_count === next.rating_count &&
    prev.priority === next.priority &&
    prev.compact === next.compact &&
    prev.sale_percentage === next.sale_percentage
  );
}

const ProductCard = memo(ProductCardComponent, propsAreEqual);

export default ProductCard;
