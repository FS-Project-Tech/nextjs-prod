"use client";

import Image from "next/image";
import Link from "next/link";
import { memo, useMemo, useState, useCallback } from "react";
import type { TypesenseSearchProduct } from "@/lib/typesense-products";
import { WishlistButton } from "@/components/WishlistButton";
import { formatPriceWithLabel, getTaxDisplayType } from "@/lib/format-utils";
import { cleanAttributeValuesForDisplay, cleanSearchResultTitle } from "@/lib/search-display-name";

const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Crect fill='%23f3f4f6' width='400' height='400'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-family='system-ui' font-size='14'%3ENo Image%3C/text%3E%3C/svg%3E";

export interface SearchProductCardProps {
  product: TypesenseSearchProduct;
  /** Current search string — used to highlight matching SKU substrings. */
  highlightQuery: string;
  priority?: boolean;
}

function SkuWithHighlight({ sku, query }: { sku: string; query: string }) {
  const q = query.trim();
  if (!sku) {
    return <span className="text-sm text-gray-500">SKU: —</span>;
  }
  if (!q) {
    return <span className="text-sm text-gray-600">SKU: {sku}</span>;
  }
  const lowerSku = sku.toLowerCase();
  const lowerQ = q.toLowerCase();
  const idx = lowerSku.indexOf(lowerQ);
  if (idx === -1) {
    return <span className="text-sm text-gray-600">SKU: {sku}</span>;
  }
  const before = sku.slice(0, idx);
  const match = sku.slice(idx, idx + q.length);
  const after = sku.slice(idx + q.length);
  return (
    <span className="text-sm text-gray-600">
      SKU: {before}
      <mark className="rounded bg-amber-200 px-0.5 font-medium text-gray-900">{match}</mark>
      {after}
    </span>
  );
}

function attributeSummary(attrs: Record<string, string>): string {
  const parts = cleanAttributeValuesForDisplay(
    Object.values(attrs).map((v) => v.trim()).filter(Boolean)
  );
  return parts.join(" / ");
}

function SearchProductCardComponent({
  product,
  highlightQuery,
  priority = false,
}: SearchProductCardProps) {
  const [imageError, setImageError] = useState(false);
  const isVariation = product.docType === "variation";

  const href = useMemo(() => {
    const base = `/product/${product.slug}`;
    if (isVariation) {
      return `${base}?variation_id=${product.id}`;
    }
    return base;
  }, [product.slug, product.id, isVariation]);

  const imageSrc = useMemo(() => {
    const raw = product.image?.trim() || product.images?.[0]?.src?.trim() || "";
    if (!raw || imageError) return PLACEHOLDER;
    return raw;
  }, [product.image, product.images, imageError]);

  const onImgError = useCallback(() => setImageError(true), []);

  const attrLine = useMemo(() => attributeSummary(product.attributes), [product.attributes]);

  const displayTitle = useMemo(
    () => cleanSearchResultTitle(product.name),
    [product.name]
  );

  /** Woo wishlist is keyed by parent product id for variations. */
  const wishlistProductId = useMemo(() => {
    if (isVariation) {
      const p = Number(product.parentId);
      return Number.isFinite(p) && p > 0 ? p : product.id;
    }
    return product.id;
  }, [isVariation, product.parentId, product.id]);

  const skuText = String(product.sku || "").trim();

  const stockNote = !product.inStock ? (
    <span className="text-xs font-medium text-red-600">Out of stock</span>
  ) : null;

  const { priceDisplay, regularDisplay, isGstFree } = useMemo(() => {
    const taxClass = product.tax_class ?? undefined;
    const taxStatus = product.tax_status ?? undefined;

    const regular = product.regular_price ? parseFloat(String(product.regular_price)) : 0;
    const sale = product.sale_price ? parseFloat(String(product.sale_price)) : 0;
    const listPrice = parseFloat(String(product.price || "0")) || 0;
    const current = sale > 0 ? sale : listPrice;
    const isOnSale = regular > 0 && sale > 0 && sale < regular;

    /** Same rules as PDP {@link formatPriceWithLabel} / {@link getTaxDisplayType} — not only `gst_free` index flag. */
    const gstFree =
      product.gstFree === true || getTaxDisplayType(taxClass, taxStatus) === "gst_free";

    let display = formatPriceWithLabel(current, taxClass, taxStatus);
    if (gstFree) {
      display = {
        ...display,
        price: `$${current.toFixed(2)}`,
        label: "GST Free",
        exclPrice: undefined,
        inclPrice: undefined,
        taxType: "gst_free",
      };
    }

    let regularFmt: ReturnType<typeof formatPriceWithLabel> | null = null;
    if (isOnSale && regular > 0) {
      let reg = formatPriceWithLabel(regular, taxClass, taxStatus);
      if (gstFree) {
        reg = {
          ...reg,
          price: `$${regular.toFixed(2)}`,
          label: "GST Free",
          exclPrice: undefined,
          inclPrice: undefined,
          taxType: "gst_free",
        };
      }
      regularFmt = reg;
    }

    return { priceDisplay: display, regularDisplay: regularFmt, isGstFree: gstFree };
  }, [
    product.price,
    product.sale_price,
    product.regular_price,
    product.tax_class,
    product.tax_status,
    product.gstFree,
  ]);

  return (
    <article
      className="grid h-full grid-cols-2 gap-3 rounded-xl border border-gray-200 bg-white p-3 transition hover:shadow-md md:grid-cols-1"
      style={{ contain: "layout style paint" }}
    >
      <div className="flex min-w-0 flex-col items-stretch gap-2">
        <Link
          href={href}
          className="relative block w-full overflow-hidden rounded-lg bg-white"
          aria-label={`View ${displayTitle}`}
          prefetch={false}
        >
          <div className="relative aspect-square">
            <Image
              src={imageSrc}
              alt={product.images?.[0]?.alt || displayTitle}
              fill
              sizes="(max-width: 768px) 45vw, (max-width: 1200px) 33vw, 25vw"
              className="object-contain p-2 md:p-4"
              onError={onImgError}
              priority={priority}
            />

            <div className="absolute top-2 left-2 z-10 hidden md:block">
              <WishlistButton
                productId={wishlistProductId}
                size="sm"
                variant="icon"
                className="rounded-full border border-gray-200 bg-white shadow-sm transition hover:scale-110"
              />
            </div>

            {skuText ? (
              <div className="pointer-events-none absolute top-2 right-2 z-10 hidden max-w-[55%] md:block">
                <p className="truncate text-right text-[10px] font-medium leading-tight text-gray-800 drop-shadow-sm">
                  {skuText}
                </p>
              </div>
            ) : null}

            {isVariation ? (
              <span className="absolute bottom-2 left-2 rounded-md bg-teal-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                Variant
              </span>
            ) : null}

            {/* <p className="pointer-events-none absolute bottom-2 right-2 hidden max-w-[70%] text-right text-[9px] leading-tight text-gray-500 md:block">
              Product image is for reference only
            </p> */}
          </div>
        </Link>

        <div className="flex w-full justify-start md:hidden">
          <WishlistButton
            productId={wishlistProductId}
            size="sm"
            variant="icon"
            className="rounded-md border border-gray-200 bg-white shadow-sm transition hover:scale-105"
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-col md:pt-3">
        <div className="min-h-0 flex-1">
          <div className="flex flex-wrap items-start gap-2">
            <Link
              href={href}
              className="min-w-0 flex-1 basis-full text-sm font-medium leading-snug text-gray-900 break-words md:basis-auto"
            >
              {displayTitle}
            </Link>
            {isVariation ? (
              <span className="inline-flex rounded-full border border-teal-600/35 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-800">
                Variant
              </span>
            ) : null}
          </div>

          {isVariation && attrLine ? (
            <p className="mt-1 text-sm text-gray-600">{attrLine}</p>
          ) : null}

          <div className="mt-1 min-h-[18px] py-2">
            <SkuWithHighlight sku={skuText} query={highlightQuery} />
          </div>

          {stockNote ? <div className="mt-0.5">{stockNote}</div> : null}
        </div>

        <div className="mt-auto space-y-1 pt-2 md:pt-0">
          <div className={isGstFree ? "text-emerald-700" : undefined}>
            {regularDisplay ? (
              <p className="mb-0.5 text-sm text-gray-500 line-through">
                {regularDisplay.taxType === "gst_free"
                  ? regularDisplay.price
                  : regularDisplay.exclPrice
                    ? `Excl. GST: ${regularDisplay.exclPrice}`
                    : regularDisplay.label
                      ? `${regularDisplay.label}: ${regularDisplay.price}`
                      : regularDisplay.price}
              </p>
            ) : null}
            {isGstFree ? (
              <p className="text-sm font-semibold text-emerald-700">GST Free</p>
            ) : priceDisplay.exclPrice ? (
              <p className="text-sm text-gray-600">Excl. GST: {priceDisplay.exclPrice}</p>
            ) : null}
            <p className="text-lg font-bold text-teal md:text-[16px]">
              {isGstFree
                ? priceDisplay.price
                : priceDisplay.label
                  ? `${priceDisplay.label}: ${priceDisplay.price}`
                  : priceDisplay.price}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

function cardPropsEqual(prev: SearchProductCardProps, next: SearchProductCardProps) {
  return (
    prev.highlightQuery === next.highlightQuery &&
    prev.priority === next.priority &&
    prev.product.id === next.product.id &&
    prev.product.docType === next.product.docType &&
    prev.product.name === next.product.name &&
    prev.product.slug === next.product.slug &&
    prev.product.sku === next.product.sku &&
    prev.product.price === next.product.price &&
    prev.product.sale_price === next.product.sale_price &&
    prev.product.regular_price === next.product.regular_price &&
    prev.product.on_sale === next.product.on_sale &&
    prev.product.parentId === next.product.parentId &&
    prev.product.tax_class === next.product.tax_class &&
    prev.product.tax_status === next.product.tax_status &&
    prev.product.gstFree === next.product.gstFree &&
    prev.product.image === next.product.image &&
    prev.product.inStock === next.product.inStock &&
    JSON.stringify(prev.product.attributes) === JSON.stringify(next.product.attributes)
  );
}

const SearchProductCard = memo(SearchProductCardComponent, cardPropsEqual);
export default SearchProductCard;
