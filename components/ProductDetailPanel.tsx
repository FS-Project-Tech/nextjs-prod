"use client";

import type { WooCommerceProduct, WooCommerceVariation } from "@/lib/woocommerce";
import { useMemo, useState, useEffect } from "react";
import { useProductVariationGallery } from "@/components/product/ProductVariationGalleryProvider";
import ProductVariations from "@/components/ProductVariations";
import RecurringSelect, { RecurringPlan } from "@/components/RecurringSelect";
import { useCart } from "@/components/CartProvider";
import { useToast } from "@/components/ToastProvider";
import { WishlistButton } from "@/components/WishlistButton";
import { formatPriceWithLabel } from "@/lib/format-utils";
import {
  matchVariation,
  findBrand,
  extractProductBrands,
} from "@/lib/utils/product";
import { useViewedProduct } from "@/hooks/useViewedProducts";
import ConsultationFormModal from "@/components/ConsultationFormModal";
import EmpowerCampaignBox from "@/components/EmpowerCampaignBox";
import Image from "next/image";
import Link from "next/link";

function hasEmpowerTag(product: WooCommerceProduct): boolean {
  const tags = product.tags || [];
  return tags.some(
    (t: { name?: string; slug?: string }) =>
      (t.name || "").toLowerCase() === "empower" || (t.slug || "").toLowerCase() === "empower"
  );
}

function showProductTerms(product: WooCommerceProduct): boolean {
  const meta = product.meta_data?.find(
    (m: { key?: string; value?: unknown }) => m.key === "show_terms_conditions"
  );

  if (meta?.value == null) return false;

  if (Array.isArray(meta.value)) {
    return meta.value.some((v: unknown) => String(v).toLowerCase().includes("yes"));
  }

  return String(meta.value).toLowerCase().includes("yes");
}

export default function ProductDetailPanel({
  product,
  variations,
}: {
  product: WooCommerceProduct;
  variations: WooCommerceVariation[];
}) {
  const [plan, setPlan] = useState<RecurringPlan>("none");
  const [selected, setSelected] = useState<{ [name: string]: string }>({});
  const [selectedSimpleAttributes, setSelectedSimpleAttributes] = useState<{ [name: string]: string }>(
    {}
  );
  const [currentSku, setCurrentSku] = useState<string | null>(product.sku || null);
  const [matchedVariation, setMatchedVariation] = useState<WooCommerceVariation | null>(null);
  const matched = useMemo(() => matchVariation(variations, selected), [variations, selected]);

  const variationGallery = useProductVariationGallery();
  useEffect(() => {
    if (!variationGallery) return;
    const v = matchedVariation ?? matched;
    const raw = v?.image;
    if (
      raw &&
      typeof raw === "object" &&
      "src" in raw &&
      String((raw as { src?: unknown }).src || "").trim() !== ""
    ) {
      variationGallery.setVariationImage(raw as { id?: number; src: string; name?: string; alt?: string });
    } else {
      variationGallery.setVariationImage(null);
    }
  }, [matchedVariation, matched, variationGallery]);

  const cartLineImageUrl = useMemo(() => {
    const vi = matchedVariation?.image;
    if (vi && typeof vi === "object" && String(vi.src || "").trim()) return vi.src;
    const mi = matched?.image;
    if (mi && typeof mi === "object" && String(mi.src || "").trim()) return mi.src;
    return product.images?.[0]?.src;
  }, [matchedVariation, matched, product.images]);

  // variable attribute definitions for swatches
  const attributes = useMemo(() => {
    return (product.attributes || [])
      .filter((a: any) => (a?.variation ?? false) && Array.isArray(a.options))
      .map((a: any) => ({ name: a.name as string, options: a.options as string[] }));
  }, [product.attributes]);
  const simpleAttributes = useMemo(() => {
    return (product.attributes || [])
      .filter((a: any) => !(a?.variation ?? false) && Array.isArray(a.options) && a.options.length > 0)
      .map((a: any) => ({
        name: String(a?.name || "").trim(),
        values: (a.options as unknown[])
          .map((v) => String(v || "").trim())
          .filter((v) => v.length > 0),
      }))
      .filter((a: { name: string; values: string[] }) => a.name.length > 0 && a.values.length > 0);
  }, [product.attributes]);

  const brandList = useMemo(() => extractProductBrands(product), [product]);
  const brand =
    brandList.length > 0
      ? brandList
          .map((b) => b.name)
          .filter(Boolean)
          .join(", ")
      : findBrand(product);

  // Check if product has resources (downloads or meta_data with resource)
  const hasResources = useMemo(() => {
    // Check downloads array
    if (product.downloads && Array.isArray(product.downloads) && product.downloads.length > 0) {
      return true;
    }
    // Check meta_data for resource fields
    if (product.meta_data && Array.isArray(product.meta_data)) {
      const resourceKeys = [
        "resource",
        "resources",
        "resource_url",
        "resource_file",
        "download_resource",
      ];
      return product.meta_data.some((meta: any) => {
        const key = String(meta.key || "").toLowerCase();
        return resourceKeys.some((rk) => key.includes(rk)) && meta.value;
      });
    }
    return false;
  }, [product.downloads, product.meta_data]);

  const displayPrice = matchedVariation?.price || matched?.price || product.price;
  const displayRegularRaw =
    matchedVariation?.regular_price || matched?.regular_price || product.regular_price;
  const onSale = matchedVariation
    ? matchedVariation.on_sale
    : matched
      ? matched.on_sale
      : product.on_sale;
  const regularFromProduct =
    product.regular_price && String(product.regular_price).trim() ? product.regular_price : "";
  const regularFromFirstVariation =
    variations?.[0]?.regular_price && String(variations[0].regular_price).trim()
      ? variations[0].regular_price
      : "";
  const displayRegular =
    displayRegularRaw && String(displayRegularRaw).trim() !== ""
      ? displayRegularRaw
      : onSale && regularFromProduct && String(regularFromProduct) !== String(displayPrice)
        ? regularFromProduct
        : onSale &&
            regularFromFirstVariation &&
            String(regularFromFirstVariation) !== String(displayPrice)
          ? regularFromFirstVariation
          : displayRegularRaw;
  const hasResolvedVariation = attributes.length === 0 || Boolean(matchedVariation || matched);
  const { addItem, open: openCart } = useCart();
  const { success, error: showError } = useToast();
  const [quantity, setQuantity] = useState<number>(1);
  const [addingToCart, setAddingToCart] = useState(false);
  const [isConsultationModalOpen, setIsConsultationModalOpen] = useState(false);

  useEffect(() => {
    if (attributes.length > 0 || simpleAttributes.length === 0) return;
    setSelectedSimpleAttributes((prev) => {
      const next = { ...prev };
      let changed = false;
      simpleAttributes.forEach((attr) => {
        if (!next[attr.name] && attr.values.length > 0) {
          next[attr.name] = attr.values[0];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [attributes.length, simpleAttributes]);

  // Track viewed product
  const categoryIds = (product.categories || []).map((c) => c.id);
  useViewedProduct(product.id, categoryIds);

  return (
    <div className="space-y-8">
      {/* Title & meta */}
      <div>
        <h1
          id="product-details-heading"
          className="text-md font-medium tracking-tight text-gray-900 sm:text-3xl"
        >
          {product.name}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
          {currentSku || product.sku ? (
            <span>
              SKU: <span className="font-medium text-gray-700">{currentSku || product.sku}</span>
            </span>
          ) : null}
          {brandList.length > 0 && (
            <span>
              Brand:{" "}
              <span className="font-medium text-gray-700">
                {brandList.map((b, idx) => (
                  <span key={b.slug || `${b.name}-${idx}`}>
                    {idx > 0 ? ", " : ""}
                    {b.slug ? (
                      <Link
                        href={`/brands/${encodeURIComponent(b.slug)}`}
                        className="hover:text-teal-700 hover:underline"
                      >
                        {b.name}
                      </Link>
                    ) : (
                      <span>{b.name}</span>
                    )}
                  </span>
                ))}
              </span>
            </span>
          )}
          {product.categories && product.categories.length > 0 && (
            <span>
              Category:{" "}
              <span className="font-medium text-gray-700">
                {product.categories.map((c, idx) => (
                  <span key={c.id || `${c.slug}-${idx}`}>
                    {idx > 0 ? ", " : ""}
                    <Link
                      href={`/product-category/${encodeURIComponent(c.slug)}`}
                      className="hover:text-teal-700 hover:underline"
                    >
                      {c.name}
                    </Link>
                  </span>
                ))}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* ✅ FIXED SPACING HERE */}
      {showProductTerms(product) && (
        <div className="mt-5">
          <Image
            src="/images/product-terms-conditions.png"
            alt="Product Terms"
            width={1200}
            height={200}
            className="w-full max-w-[600px] h-auto rounded-md"
          />
        </div>
      )}

      {/* Price — same treatment as product card: strikethrough original + Save $X when on sale */}
      <div className="space-y-2">
  {(() => {
    const raw = Number(displayPrice || 0);
    const regularNum = Number(displayRegular || 0);

    const taxClass =
      matchedVariation?.tax_class || matched?.tax_class || product.tax_class;
    const taxStatus =
      matchedVariation?.tax_status || matched?.tax_status || product.tax_status;

    const isOnSale = onSale && regularNum > 0 && raw > 0 && raw < regularNum;

    const discountPercent =
  isOnSale && regularNum > raw
    ? Math.round(((regularNum - raw) / regularNum) * 100)
    : 0;

    if (isNaN(raw) || raw <= 0) {
      return (
        <span className="text-2xl font-semibold text-[#1f605f]">
          ${displayPrice}
        </span>
      );
    }

    const priceInfo = formatPriceWithLabel(raw, taxClass, taxStatus);
    const regularPrice = isOnSale
          ? `$${Number(regularNum).toFixed(2)}`
          : "";

    const savingsAmount =
      isOnSale && regularNum > raw ? regularNum - raw : 0;
    const savings =
      savingsAmount > 0 ? `$${savingsAmount.toFixed(2)}` : "";

    return (
      <div className="space-y-1 text-gray-900">

        {/* 💰 Price Row */}
        <div className="flex items-center gap-2 text-lg font-semibold">
          <span className="text-[#1f605f]">
            {priceInfo.exclPrice || priceInfo.price}
          </span>

           {/* 🔥 SALE TAG */}
            {isOnSale && (
              <span className="bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded">
                {discountPercent}% Discount
              </span>
            )}

          {isOnSale && regularPrice && (
            <span className="text-sm text-gray-500 line-through">
              {regularPrice}
            </span>
          )}

          {savings && (
            <span className="text-green-600 text-sm font-medium">
              Save {savings}
            </span>
          )}
        </div>

        {/* 📊 GST Breakdown */}
        {priceInfo.taxType !== "gst_free" && (
          <div className="text-sm text-gray-600 leading-tight">
            <div className="text-dark">Ex. GST : {priceInfo.exclPrice || priceInfo.price}</div>
            <div className="text-teal text-xl font-bold">Inc. GST : {priceInfo.price}</div>
          </div>
        )}

        {/* 🟢 GST FREE */}
        {priceInfo.taxType === "gst_free" && (
          <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            GST FREE
          </span>
        )}
      </div>
    );
  })()}
</div>

      {/* Simple product attributes (non-variation attributes from Woo) */}
      {attributes.length === 0 && simpleAttributes.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Packaging
          </p>
          <div className="space-y-3">
            {simpleAttributes.map((attr) => (
              <div key={attr.name} className="flex flex-wrap gap-2">
                {attr.values.map((value) => {
                  const isSelected = selectedSimpleAttributes[attr.name] === value;
                  return (
                    <button
                      key={`${attr.name}-${value}`}
                      type="button"
                      onClick={() =>
                        setSelectedSimpleAttributes((prev) => ({ ...prev, [attr.name]: value }))
                      }
                      className={`rounded-md border px-4 py-2 text-sm font-medium transition-all ${
                        isSelected
                          ? "border-black bg-black text-white"
                          : "border-black bg-transparent text-black hover:bg-gray-50"
                      }`}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Packaging / Variations */}
      {attributes.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Packaging
          </p>
          <ProductVariations
            attributes={attributes}
            variations={variations}
            onVariationChange={(variation, selectedAttributes) => {
              setMatchedVariation(variation);
              setSelected(selectedAttributes);
              if (!variation) setCurrentSku(product.sku || null);
            }}
            onSkuChange={(sku) => setCurrentSku(sku || product.sku || null)}
            style="swatches"
          />
        </div>
      )}

      {/* Delivery plan */}
      <div>
        {/* <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Delivery</p> */}
        <RecurringSelect onChange={setPlan} value={plan} />
      </div>

      {/* Quantity */}
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
          Quantity
        </label>
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
          className="w-24 rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
      </div>

      {/* Resource */}
      {hasResources && (
        <div>
          <button
            onClick={() => {
              if (product.downloads && product.downloads.length > 0) {
                const firstDownload = product.downloads[0] as { file?: string };
                if (firstDownload.file) window.open(firstDownload.file, "_blank");
              } else if (product.meta_data) {
                const resourceMeta = product.meta_data.find((meta: { key?: string; value?: unknown }) => {
                  const key = String(meta.key || "").toLowerCase();
                  return (
                    ["resource", "resource_url", "resource_file"].some((rk) => key.includes(rk)) &&
                    meta.value != null &&
                    String(meta.value).trim() !== ""
                  );
                });
                if (resourceMeta?.value != null) {
                  window.open(String(resourceMeta.value), "_blank");
                }
              }
            }}
            className="w-full rounded-lg border-2 border-teal-600 bg-transparent px-4 py-3 text-sm font-semibold text-teal-600 transition hover:bg-teal-600 hover:text-white"
          >
            Resource
          </button>
        </div>
      )}

      {/* Add to Cart */}
      <div className="space-y-3">
        <div className="flex items-stretch gap-3">
          <button
            onClick={async () => {
              if (addingToCart) return;
              if (!hasResolvedVariation) return;
              setAddingToCart(true);
              try {
                await new Promise((resolve) => setTimeout(resolve, 500));
                const variationId = matchedVariation?.id || matched?.id;
                const variationTaxClass =
                  matchedVariation?.tax_class ||
                  matched?.tax_class ||
                  product.tax_class ||
                  undefined;
                const variationTaxStatus =
                  matchedVariation?.tax_status ||
                  matched?.tax_status ||
                  product.tax_status ||
                  undefined;
                addItem({
                  productId: product.id,
                  variationId,
                  name: product.name,
                  slug: product.slug,
                  imageUrl: cartLineImageUrl,
                  price: matchedVariation?.price || matched?.price || product.price || "0",
                  qty: quantity,
                  sku: matchedVariation?.sku || matched?.sku || product.sku || undefined,
                  attributes:
                    attributes.length > 0 ? selected : { ...selectedSimpleAttributes },
                  deliveryPlan: plan,
                  tax_class: variationTaxClass,
                  tax_status: variationTaxStatus,
                });
                openCart();
                success("Product added to cart");
              } catch (error) {
                console.error("Error adding to cart:", error);
              } finally {
                setAddingToCart(false);
              }
            }}
            disabled={!hasResolvedVariation || addingToCart}
            className="btn-brand flex-1 rounded-lg px-5 py-3.5 text-base font-semibold text-white shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 cursor-pointer"
          >
            {addingToCart ? (
              <>
                <svg
                  className="h-5 w-5 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>Adding...</span>
              </>
            ) : (
              <span>Add to Cart</span>
            )}
          </button>
          <WishlistButton
            productId={product.id}
            size="lg"
            variant="icon"
            className="!h-[52px] !w-12 shrink-0 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
          />
        </div>
        {attributes.length > 0 && !hasResolvedVariation && (
          <p className="text-sm font-medium text-red-600" role="alert">
            Please select a valid variation combination before adding to cart.
          </p>
        )}
      </div>

      {/* Empower Campaign - only for Empower-tagged products */}
      {hasEmpowerTag(product) && (
        <EmpowerCampaignBox
          price={displayPrice}
          taxClass={matchedVariation?.tax_class || matched?.tax_class || product.tax_class}
          taxStatus={matchedVariation?.tax_status || matched?.tax_status || product.tax_status}
        />
      )}

      {/* Need Consultation */}
      <button
        onClick={() => setIsConsultationModalOpen(true)}
        className="flex items-center gap-2 text-sm font-medium text-[#1f605f] hover:text-[#1a4d4c] transition-colors underline underline-offset-2"
      >
        <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>Need Consultation</span>
      </button>

      {/* Consultation Form Modal */}
      <ConsultationFormModal
        isOpen={isConsultationModalOpen}
        onClose={() => setIsConsultationModalOpen(false)}
        productName={product.name}
      />
    </div>
  );
}
