// "use client";

// import type { WooCommerceProduct, WooCommerceVariation } from "@/lib/woocommerce";
// import { useMemo, useState, useEffect } from "react";
// import { useSearchParams } from "next/navigation";
// import { useProductVariationGallery } from "@/components/product/ProductVariationGalleryProvider";
// import ProductVariations from "@/components/ProductVariations";
// import RecurringSelect, { RecurringPlan } from "@/components/RecurringSelect";
// import { useCart } from "@/components/CartProvider";
// import { useToast } from "@/components/ToastProvider";
// import { WishlistButton } from "@/components/WishlistButton";
// import { formatPriceWithLabel } from "@/lib/format-utils";
// import {
//   matchVariation,
//   findBrand,
//   extractProductBrands,
//   selectedAttributesForVariationId,
// } from "@/lib/utils/product";
// import { useViewedProduct } from "@/hooks/useViewedProducts";
// import ConsultationFormModal from "@/components/ConsultationFormModal";
// import EmpowerCampaignBox from "@/components/EmpowerCampaignBox";
// import UnitSelector from "@/components/product/UnitSelector";
// import { normalizeProduct, type WooMetaRow } from "@/lib/transform/normalizeProduct";
// import type { ParsedUnit } from "@/lib/utils/bulkUnits";
// import Image from "next/image";
// import Link from "next/link";

// function hasEmpowerTag(product: WooCommerceProduct): boolean {
//   const tags = product.tags || [];
//   return tags.some(
//     (t: { name?: string; slug?: string }) =>
//       (t.name || "").toLowerCase() === "empower" || (t.slug || "").toLowerCase() === "empower"
//   );
// }

// function showProductTerms(product: WooCommerceProduct): boolean {
//   const meta = product.meta_data?.find(
//     (m: { key?: string; value?: unknown }) => m.key === "show_terms_conditions"
//   );

//   if (meta?.value == null) return false;

//   if (Array.isArray(meta.value)) {
//     return meta.value.some((v: unknown) => String(v).toLowerCase().includes("yes"));
//   }

//   return String(meta.value).toLowerCase().includes("yes");
// }

// export default function ProductDetailPanel({
//   product,
//   variations,
// }: {
//   product: WooCommerceProduct;
//   variations: WooCommerceVariation[];
// }) {
//   const searchParams = useSearchParams();
//   const variationIdFromUrl = useMemo(() => {
//     const raw = searchParams.get("variation_id");
//     if (!raw) return null;
//     const n = parseInt(raw, 10);
//     return Number.isFinite(n) && n > 0 ? n : null;
//   }, [searchParams]);

//   const [plan, setPlan] = useState<RecurringPlan>("none");
//   const [selected, setSelected] = useState<{ [name: string]: string }>({});
//   const [selectedSimpleAttributes, setSelectedSimpleAttributes] = useState<{ [name: string]: string }>(
//     {}
//   );
//   const [currentSku, setCurrentSku] = useState<string | null>(product.sku || null);
//   const [matchedVariation, setMatchedVariation] = useState<WooCommerceVariation | null>(null);
//   const matched = useMemo(() => matchVariation(variations, selected), [variations, selected]);
//   const resolvedVariation = matchedVariation ?? matched;

//   const normalizedProduct = useMemo(
//     () =>
//       normalizeProduct({
//         id: product.id,
//         type: product.type,
//         price: product.price,
//         meta_data: product.meta_data as WooMetaRow[],
//         variations: variations.map((v) => ({
//           id: v.id,
//           price: v.price,
//           meta_data: v.meta_data,
//         })),
//       }),
//     [product.id, product.type, product.price, product.meta_data, variations],
//   );

//   const selectedVariation = useMemo(() => {
//     const v = resolvedVariation;
//     if (!v) return null;
//     const row = normalizedProduct.variations.find((x) => x.id === v.id);
//     if (row) return row;
//     return { id: v.id, price: v.price, bulk_units: [] as ParsedUnit[] };
//   }, [resolvedVariation, normalizedProduct.variations]);

//   const [selectedBulk, setSelectedBulk] = useState<ParsedUnit | null>(null);

//   const variationGallery = useProductVariationGallery();
//   useEffect(() => {
//     if (!variationGallery) return;
//     const v = matchedVariation ?? matched;
//     const raw = v?.image;
//     if (
//       raw &&
//       typeof raw === "object" &&
//       "src" in raw &&
//       String((raw as { src?: unknown }).src || "").trim() !== ""
//     ) {
//       variationGallery.setVariationImage(raw as { id?: number; src: string; name?: string; alt?: string });
//     } else {
//       variationGallery.setVariationImage(null);
//     }
//   }, [matchedVariation, matched, variationGallery]);

//   const cartLineImageUrl = useMemo(() => {
//     const vi = matchedVariation?.image;
//     if (vi && typeof vi === "object" && String(vi.src || "").trim()) return vi.src;
//     const mi = matched?.image;
//     if (mi && typeof mi === "object" && String(mi.src || "").trim()) return mi.src;
//     return product.images?.[0]?.src;
//   }, [matchedVariation, matched, product.images]);

//   // variable attribute definitions for swatches
//   const attributes = useMemo(() => {
//     return (product.attributes || [])
//       .filter((a: any) => (a?.variation ?? false) && Array.isArray(a.options))
//       .map((a: any) => ({ name: a.name as string, options: a.options as string[] }));
//   }, [product.attributes]);

//   const urlVariationSelected = useMemo(() => {
//     if (!variationIdFromUrl || !attributes.length || !variations.length) return {};
//     return (
//       selectedAttributesForVariationId(variationIdFromUrl, variations, attributes) ?? {}
//     );
//   }, [variationIdFromUrl, variations, attributes]);

//   const simpleAttributes = useMemo(() => {
//     return (product.attributes || [])
//       .filter((a: any) => !(a?.variation ?? false) && Array.isArray(a.options) && a.options.length > 0)
//       .map((a: any) => ({
//         name: String(a?.name || "").trim(),
//         values: (a.options as unknown[])
//           .map((v) => String(v || "").trim())
//           .filter((v) => v.length > 0),
//       }))
//       .filter((a: { name: string; values: string[] }) => a.name.length > 0 && a.values.length > 0);
//   }, [product.attributes]);

//   const brandList = useMemo(() => extractProductBrands(product), [product]);
//   const brand =
//     brandList.length > 0
//       ? brandList
//           .map((b) => b.name)
//           .filter(Boolean)
//           .join(", ")
//       : findBrand(product);

//   // Check if product has resources (downloads or meta_data with resource)
//   const hasResources = useMemo(() => {
//     // Check downloads array
//     if (product.downloads && Array.isArray(product.downloads) && product.downloads.length > 0) {
//       return true;
//     }
//     // Check meta_data for resource fields
//     if (product.meta_data && Array.isArray(product.meta_data)) {
//       const resourceKeys = [
//         "resource",
//         "resources",
//         "resource_url",
//         "resource_file",
//         "download_resource",
//       ];
//       return product.meta_data.some((meta: any) => {
//         const key = String(meta.key || "").toLowerCase();
//         return resourceKeys.some((rk) => key.includes(rk)) && meta.value;
//       });
//     }
//     return false;
//   }, [product.downloads, product.meta_data]);

//   const displayPrice = resolvedVariation?.price || product.price;
//   const displayRegularRaw =
//     resolvedVariation?.regular_price || product.regular_price;
//   const onSale = resolvedVariation ? resolvedVariation.on_sale : product.on_sale;
//   const regularFromProduct =
//     product.regular_price && String(product.regular_price).trim() ? product.regular_price : "";
//   const regularFromFirstVariation =
//     variations?.[0]?.regular_price && String(variations[0].regular_price).trim()
//       ? variations[0].regular_price
//       : "";
//   const displayRegular =
//     displayRegularRaw && String(displayRegularRaw).trim() !== ""
//       ? displayRegularRaw
//       : onSale && regularFromProduct && String(regularFromProduct) !== String(displayPrice)
//         ? regularFromProduct
//         : onSale &&
//             regularFromFirstVariation &&
//             String(regularFromFirstVariation) !== String(displayPrice)
//           ? regularFromFirstVariation
//           : displayRegularRaw;
//   const hasResolvedVariation = attributes.length === 0 || Boolean(matchedVariation || matched);
//   const { addItem, open: openCart } = useCart();
//   const { success, error: showError } = useToast();
//   const [quantity, setQuantity] = useState<number>(1);
//   const [addingToCart, setAddingToCart] = useState(false);
//   const [isConsultationModalOpen, setIsConsultationModalOpen] = useState(false);

//   const basePriceStr = resolvedVariation?.price || product.price || "0";
//   const basePriceNum = Number(basePriceStr) || 0;
//   const bulkMultiplier = selectedBulk ? selectedBulk.multiplier : 1;
//   const finalPriceNum = selectedBulk != null ? basePriceNum * selectedBulk.multiplier : basePriceNum;
//   const scaledSaleNum = (Number(displayPrice) || 0) * bulkMultiplier;
//   const scaledRegularNum = (Number(displayRegular) || 0) * bulkMultiplier;

//   useEffect(() => {
//     if (attributes.length > 0 || simpleAttributes.length === 0) return;
//     setSelectedSimpleAttributes((prev) => {
//       const next = { ...prev };
//       let changed = false;
//       simpleAttributes.forEach((attr) => {
//         if (!next[attr.name] && attr.values.length > 0) {
//           next[attr.name] = attr.values[0];
//           changed = true;
//         }
//       });
//       return changed ? next : prev;
//     });
//   }, [attributes.length, simpleAttributes]);

//   // Track viewed product
//   const categoryIds = (product.categories || []).map((c) => c.id);
//   useViewedProduct(product.id, categoryIds);

//   return (
//     <div className="space-y-8">
//       {/* Title & meta */}
//       <div>
//         <h1
//           id="product-details-heading"
//           className="text-md font-medium tracking-tight text-gray-900 sm:text-3xl"
//         >
//           {product.name}
//         </h1>
//         <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
//           {currentSku || product.sku ? (
//             <span>
//               SKU: <span className="font-medium text-gray-700">{currentSku || product.sku}</span>
//             </span>
//           ) : null}
//           {brandList.length > 0 && (
//             <span>
//               Brand:{" "}
//               <span className="font-medium text-gray-700">
//                 {brandList.map((b, idx) => (
//                   <span key={b.slug || `${b.name}-${idx}`}>
//                     {idx > 0 ? ", " : ""}
//                     {b.slug ? (
//                       <Link
//                         href={`/brands/${encodeURIComponent(b.slug)}`}
//                         className="hover:text-teal-700 hover:underline"
//                       >
//                         {b.name}
//                       </Link>
//                     ) : (
//                       <span>{b.name}</span>
//                     )}
//                   </span>
//                 ))}
//               </span>
//             </span>
//           )}
//           {product.categories && product.categories.length > 0 && (
//             <span>
//               Category:{" "}
//               <span className="font-medium text-gray-700">
//                 {product.categories.map((c, idx) => (
//                   <span key={c.id || `${c.slug}-${idx}`}>
//                     {idx > 0 ? ", " : ""}
//                     <Link
//                       href={`/product-category/${encodeURIComponent(c.slug)}`}
//                       className="hover:text-teal-700 hover:underline"
//                     >
//                       {c.name}
//                     </Link>
//                   </span>
//                 ))}
//               </span>
//             </span>
//           )}
//         </div>
//       </div>

//       {/* ✅ FIXED SPACING HERE */}
//       {showProductTerms(product) && (
//         <div className="mt-5">
//           <Image
//             src="/images/product-terms-conditions.png"
//             alt="Product Terms"
//             width={1200}
//             height={200}
//             className="w-full max-w-[600px] h-auto rounded-md"
//           />
//         </div>
//       )}

//       {/* Price — same treatment as product card: strikethrough original + Save $X when on sale */}
//       <div className="space-y-2">
//   {(() => {
//     const raw = scaledSaleNum;
//     const regularNum = scaledRegularNum;

//     const taxClass =
//       resolvedVariation?.tax_class || product.tax_class;
//     const taxStatus =
//       resolvedVariation?.tax_status || product.tax_status;

//     const isOnSale = onSale && regularNum > 0 && raw > 0 && raw < regularNum;

//     const discountPercent =
//   isOnSale && regularNum > raw
//     ? Math.round(((regularNum - raw) / regularNum) * 100)
//     : 0;

//     if (!Number.isFinite(raw) || raw <= 0) {
//       const fallback =
//         bulkMultiplier !== 1
//           ? (Number(displayPrice || 0) * bulkMultiplier).toFixed(2)
//           : displayPrice;
//       return (
//         <span className="text-2xl font-semibold text-[#1f605f]">
//           ${fallback}
//         </span>
//       );
//     }

//     const priceInfo = formatPriceWithLabel(raw, taxClass, taxStatus);
//     const regularPrice = isOnSale
//           ? `$${Number(regularNum).toFixed(2)}`
//           : "";

//     const savingsAmount =
//       isOnSale && regularNum > raw ? regularNum - raw : 0;
//     const savings =
//       savingsAmount > 0 ? `$${savingsAmount.toFixed(2)}` : "";

//     return (
//       <div className="space-y-1 text-gray-900">

//         {/* 💰 Price Row */}
//         <div className="flex items-center gap-2 text-lg font-semibold">
//           <span className="text-[#1f605f]">
//             {priceInfo.exclPrice || priceInfo.price}
//           </span>

//            {/* 🔥 SALE TAG */}
//             {isOnSale && (
//               <span className="bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded">
//                 {discountPercent}% Discount
//               </span>
//             )}

//           {isOnSale && regularPrice && (
//             <span className="text-sm text-gray-500 line-through">
//               {regularPrice}
//             </span>
//           )}

//           {savings && (
//             <span className="text-green-600 text-sm font-medium">
//               Save {savings}
//             </span>
//           )}
//         </div>

//         {/* 📊 GST Breakdown */}
//         {priceInfo.taxType !== "gst_free" && (
//           <div className="text-sm text-gray-600 leading-tight">
//             <div className="text-dark">Ex. GST : {priceInfo.exclPrice || priceInfo.price}</div>
//             <div className="text-teal text-xl font-bold">Inc. GST : {priceInfo.price}</div>
//           </div>
//         )}

//         {/* 🟢 GST FREE */}
//         {priceInfo.taxType === "gst_free" && (
//           <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
//             GST FREE
//           </span>
//         )}

//         {selectedBulk != null && (
//           <p className="mt-2 text-sm text-gray-600">
//             ₹{basePriceNum.toFixed(2)} × {selectedBulk.multiplier} = ₹{finalPriceNum.toFixed(2)}
//           </p>
//         )}
//       </div>
//     );
//   })()}
// </div>

//       {/* Simple product attributes (non-variation attributes from Woo) */}
//       {attributes.length === 0 && simpleAttributes.length > 0 && (
//         <div>
//           <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
//             Packaging
//           </p>
//           <div className="space-y-3">
//             {simpleAttributes.map((attr) => (
//               <div key={attr.name} className="flex flex-wrap gap-2">
//                 {attr.values.map((value) => {
//                   const isSelected = selectedSimpleAttributes[attr.name] === value;
//                   return (
//                     <button
//                       key={`${attr.name}-${value}`}
//                       type="button"
//                       onClick={() =>
//                         setSelectedSimpleAttributes((prev) => ({ ...prev, [attr.name]: value }))
//                       }
//                       className={`rounded-md border px-4 py-2 text-sm font-medium transition-all ${
//                         isSelected
//                           ? "border-black bg-black text-white"
//                           : "border-black bg-transparent text-black hover:bg-gray-50"
//                       }`}
//                     >
//                       {value}
//                     </button>
//                   );
//                 })}
//               </div>
//             ))}
//           </div>
//         </div>
//       )}

//       {/* Packaging / Variations */}
//       {attributes.length > 0 && (
//         <div>
//           <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
//             Packaging
//           </p>
//           <ProductVariations
//             attributes={attributes}
//             variations={variations}
//             defaultSelected={urlVariationSelected}
//             onVariationChange={(variation, selectedAttributes) => {
//               setMatchedVariation(variation);
//               setSelected(selectedAttributes);
//               if (!variation) setCurrentSku(product.sku || null);
//             }}
//             onSkuChange={(sku) => setCurrentSku(sku || product.sku || null)}
//             style="swatches"
//           />
//         </div>
//       )}

//       <UnitSelector
//         product={normalizedProduct}
//         selectedVariation={selectedVariation}
//         onSelect={setSelectedBulk}
//       />

//       {/* Delivery plan */}
//       <div>
//         {/* <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Delivery</p> */}
//         <RecurringSelect onChange={setPlan} value={plan} />
//       </div>

//       {/* Quantity */}
//       <div>
//         <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
//           Quantity
//         </label>
//         <input
//           type="number"
//           min={1}
//           value={quantity}
//           onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
//           className="w-24 rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
//         />
//       </div>

//       {/* Resource */}
//       {hasResources && (
//         <div>
//           <button
//             onClick={() => {
//               if (product.downloads && product.downloads.length > 0) {
//                 const firstDownload = product.downloads[0] as { file?: string };
//                 if (firstDownload.file) window.open(firstDownload.file, "_blank");
//               } else if (product.meta_data) {
//                 const resourceMeta = product.meta_data.find((meta: { key?: string; value?: unknown }) => {
//                   const key = String(meta.key || "").toLowerCase();
//                   return (
//                     ["resource", "resource_url", "resource_file"].some((rk) => key.includes(rk)) &&
//                     meta.value != null &&
//                     String(meta.value).trim() !== ""
//                   );
//                 });
//                 if (resourceMeta?.value != null) {
//                   window.open(String(resourceMeta.value), "_blank");
//                 }
//               }
//             }}
//             className="w-full rounded-lg border-2 border-teal-600 bg-transparent px-4 py-3 text-sm font-semibold text-teal-600 transition hover:bg-teal-600 hover:text-white"
//           >
//             Resource
//           </button>
//         </div>
//       )}

//       {/* Add to Cart */}
//       <div className="space-y-3">
//         <div className="flex items-stretch gap-3">
//           <button
//             onClick={async () => {
//               if (addingToCart) return;
//               if (!hasResolvedVariation) return;
//               setAddingToCart(true);
//               try {
//                 const variationId = matchedVariation?.id || matched?.id;
//                 const variationTaxClass =
//                   matchedVariation?.tax_class ||
//                   matched?.tax_class ||
//                   product.tax_class ||
//                   undefined;
//                 const variationTaxStatus =
//                   matchedVariation?.tax_status ||
//                   matched?.tax_status ||
//                   product.tax_status ||
//                   undefined;
//                 addItem({
//                   productId: product.id,
//                   variationId,
//                   name: product.name,
//                   slug: product.slug,
//                   imageUrl: cartLineImageUrl,
//                   price: finalPriceNum.toFixed(2),
//                   qty: quantity,
//                   sku: matchedVariation?.sku || matched?.sku || product.sku || undefined,
//                   attributes:
//                     attributes.length > 0 ? selected : { ...selectedSimpleAttributes },
//                   deliveryPlan: plan,
//                   tax_class: variationTaxClass,
//                   tax_status: variationTaxStatus,
//                 });
//                 openCart();
//                 success("Product added to cart");
//               } catch (error) {
//                 console.error("Error adding to cart:", error);
//               } finally {
//                 setAddingToCart(false);
//               }
//             }}
//             disabled={!hasResolvedVariation || addingToCart}
//             className="btn-brand flex-1 rounded-lg px-5 py-3.5 text-base font-semibold text-white shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 cursor-pointer"
//           >
//             {addingToCart ? (
//               <>
//                 <svg
//                   className="h-5 w-5 animate-spin"
//                   xmlns="http://www.w3.org/2000/svg"
//                   fill="none"
//                   viewBox="0 0 24 24"
//                 >
//                   <circle
//                     className="opacity-25"
//                     cx="12"
//                     cy="12"
//                     r="10"
//                     stroke="currentColor"
//                     strokeWidth="4"
//                   />
//                   <path
//                     className="opacity-75"
//                     fill="currentColor"
//                     d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
//                   />
//                 </svg>
//                 <span>Adding...</span>
//               </>
//             ) : (
//               <span>Add to Cart</span>
//             )}
//           </button>
//           <WishlistButton
//             productId={product.id}
//             size="lg"
//             variant="icon"
//             className="!h-[52px] !w-12 shrink-0 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
//           />
//         </div>
//         {attributes.length > 0 && !hasResolvedVariation && (
//           <p className="text-sm font-medium text-red-600" role="alert">
//             Please select a valid variation combination before adding to cart.
//           </p>
//         )}
//       </div>

//       {/* Empower Campaign - only for Empower-tagged products */}
//       {hasEmpowerTag(product) && (
//         <EmpowerCampaignBox
//           price={scaledSaleNum > 0 ? scaledSaleNum.toFixed(2) : displayPrice}
//           taxClass={resolvedVariation?.tax_class || product.tax_class}
//           taxStatus={resolvedVariation?.tax_status || product.tax_status}
//         />
//       )}

//       {/* Need Consultation */}
//       <button
//         onClick={() => setIsConsultationModalOpen(true)}
//         className="flex items-center gap-2 text-sm font-medium text-[#1f605f] hover:text-[#1a4d4c] transition-colors underline underline-offset-2"
//       >
//         <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//           <path
//             strokeLinecap="round"
//             strokeLinejoin="round"
//             strokeWidth={2}
//             d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
//           />
//         </svg>
//         <span>Need Consultation</span>
//       </button>

//       {/* Consultation Form Modal */}
//       <ConsultationFormModal
//         isOpen={isConsultationModalOpen}
//         onClose={() => setIsConsultationModalOpen(false)}
//         productName={product.name}
//       />
//     </div>
//   );
// }
//D:\stage-joya\nextjs-stage\components\ProductDetailPanel.tsx

"use client";

import type { WooCommerceProduct, WooCommerceVariation } from "@/lib/woocommerce";
import {
  extractProductUnitOptions,
  extractVariationUnitOptions,
} from "@/lib/woocommerce/quantity-units-meta";
import { useMemo, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
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
  extractEtaDateDisplayForProduct,
  extractExpiryDateDisplayFromShortDescription,
  concretePackagingLabelFromVariation,
  overlayConcreteVariationAttributes,
  selectedAttributesForVariationId,
} from "@/lib/utils/product";
import { useViewedProduct } from "@/hooks/useViewedProducts";
import ConsultationFormModal from "@/components/ConsultationFormModal";
import EmpowerCampaignBox from "@/components/EmpowerCampaignBox";
import Image from "next/image";
import Link from "next/link";

function findVariationBySku(
  variations: WooCommerceVariation[],
  sku: string | null | undefined
): WooCommerceVariation | null {
  const normalizedSku = String(sku || "").trim().toLowerCase();
  if (!normalizedSku) return null;
  return (
    variations.find((variation) => String(variation?.sku || "").trim().toLowerCase() === normalizedSku) ||
    null
  );
}

function extractUnitMultiplier(optionLabel: string): number {
  const label = String(optionLabel || "").trim();
  if (!label) return 1;
  const match = label.match(/(\d+(?:\.\d+)?)/);
  if (!match) return 1;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return parsed;
}

/** Variation description from Woo is often HTML; show as inline note beside unit options. */
function plainTextFromVariationDescription(html: string): string {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalized key for Woo attribute names (aligned with ProductVariations). */
function packagingAttributeKey(name: string): string {
  let s = String(name || "")
    .toLowerCase()
    .trim()
    .replace(/^attribute_/, "");
  if (s.startsWith("pa_")) s = s.slice(3);
  return s.replace(/[^a-z0-9]+/g, "");
}

/**
 * Woo variation attribute that represents the main sell unit (e.g. "Box (100 Pcs)"),
 * separate from colour/size. Merged with "Available Unit Options" from meta/API.
 */
function resolvePackagingUnitAttribute(
  attributes: { name: string; options: string[] }[],
  eachAttribute: { name: string; options: string[] } | null,
): { name: string; options: string[] } | null {
  if (eachAttribute) return eachAttribute;
  if (attributes.length === 0) return null;

  const exactKeys = new Set([
    "unittype",
    "packaging",
    "packsize",
    "quantityunit",
    "packagingtype",
    "unitsize",
    "saleunit",
  ]);

  for (const attr of attributes) {
    if (exactKeys.has(packagingAttributeKey(attr.name))) return attr;
  }

  for (const attr of attributes) {
    const k = packagingAttributeKey(attr.name);
    if (k.includes("unittype") || k.includes("packaging")) return attr;
    if ((k.includes("unit") || k.includes("pack")) && !k.includes("quantity")) return attr;
  }

  // Common Woo layout: colour / size / … / unit format last.
  return attributes[attributes.length - 1] ?? null;
}

type QuantityUnitApiOption = {
  option_label?: string;
};

type QuantityUnitsApiResponse = {
  has_options?: boolean;
  units?: QuantityUnitApiOption[];
};

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
  initialSkuQuantityUnits,
}: {
  product: WooCommerceProduct;
  variations: WooCommerceVariation[];
  /** Server-prefetched wc-quantity-units (and meta) keyed by lowercase SKU — instant unit row on variation change */
  initialSkuQuantityUnits?: Record<string, string[]>;
}) {
  const searchParams = useSearchParams();
  const variationIdFromUrl = useMemo(() => {
    const raw = searchParams.get("variation_id");
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [searchParams]);

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

  /** Maps `?variation_id=` to swatch keys — ProductVariations must receive this as defaultSelected or UI stays on parent. */
  const urlDerivedAttributeSelection = useMemo(() => {
    if (!variationIdFromUrl || variations.length === 0 || attributes.length === 0) return {};
    return selectedAttributesForVariationId(variationIdFromUrl, variations, attributes) ?? {};
  }, [variationIdFromUrl, variations, attributes]);

  useEffect(() => {
    if (!variationIdFromUrl || variations.length === 0 || attributes.length > 0) return;
    const v = variations.find((x) => x.id === variationIdFromUrl);
    if (!v) return;
    setMatchedVariation(v);
    const skuStr = v.sku ? String(v.sku).trim() : "";
    if (skuStr) setCurrentSku(skuStr);
  }, [product.id, variationIdFromUrl, variations, attributes.length]);

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

  const baseDisplayPrice = matchedVariation?.price || matched?.price || product.price;
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
  const displayRegularBase =
    displayRegularRaw && String(displayRegularRaw).trim() !== ""
      ? displayRegularRaw
      : onSale && regularFromProduct && String(regularFromProduct) !== String(baseDisplayPrice)
        ? regularFromProduct
        : onSale &&
            regularFromFirstVariation &&
            String(regularFromFirstVariation) !== String(baseDisplayPrice)
          ? regularFromFirstVariation
          : displayRegularRaw;
  const hasResolvedVariation = attributes.length === 0 || Boolean(matchedVariation || matched);
  const { addItem, open: openCart } = useCart();
  const { success, error: showError } = useToast();
  const [quantityInput, setQuantityInput] = useState<string>("1");
  const [addingToCart, setAddingToCart] = useState(false);
  const [isConsultationModalOpen, setIsConsultationModalOpen] = useState(false);
  const [selectedUnitOption, setSelectedUnitOption] = useState<string>("");
  const [skuUnitOptions, setSkuUnitOptions] = useState<string[]>([]);
  const [skuUnitOptionsCache, setSkuUnitOptionsCache] = useState<Record<string, string[]>>(() => {
    const init = initialSkuQuantityUnits;
    if (!init || typeof init !== "object") return {};
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(init)) {
      const key = k.trim().toLowerCase();
      if (!key) continue;
      out[key] = Array.isArray(v) ? [...v] : [];
    }
    return out;
  });

  const metaUnitOptions = useMemo(() => {
    if (variations.length > 0) {
      const picked =
        matchedVariation ||
        matched ||
        findVariationBySku(variations, currentSku) ||
        findVariationBySku(variations, product.sku) ||
        variations.find((variation) => extractVariationUnitOptions(variation).length > 0) ||
        null;
      return extractVariationUnitOptions(picked);
    }
    return extractProductUnitOptions(product);
  }, [matchedVariation, matched, variations, currentSku, product.sku, product]);

  /** SKU whose "Available Unit Options" row applies — only this one is fetched from wc-quantity-units. */
  const activeSkuForQuantityUnits = useMemo(
    () =>
      String(currentSku || matchedVariation?.sku || matched?.sku || product.sku || "").trim(),
    [currentSku, matchedVariation?.sku, matched?.sku, product.sku],
  );

  const skuUnitOptionsCacheRef = useRef(skuUnitOptionsCache);
  skuUnitOptionsCacheRef.current = skuUnitOptionsCache;

  useEffect(() => {
    const sku = activeSkuForQuantityUnits;
    if (!sku) return;

    const key = sku.toLowerCase();
    if (skuUnitOptionsCacheRef.current[key] !== undefined) return;

    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        const endpoint = `${
          process.env.NEXT_PUBLIC_WP_URL || "https://live.joyamedicalsupplies.com.au"
        }/wp-json/wc-quantity-units/v1/units?sku=${encodeURIComponent(sku)}`;
        const res = await fetch(endpoint, { signal: controller.signal });
        if (!res.ok) {
          if (!cancelled) {
            setSkuUnitOptionsCache((prev) =>
              prev[key] !== undefined ? prev : { ...prev, [key]: [] },
            );
          }
          return;
        }
        const data = (await res.json()) as QuantityUnitsApiResponse;
        const options = Array.isArray(data?.units)
          ? data.units
              .map((u) => String(u?.option_label || "").trim())
              .filter((v) => v.length > 0)
          : [];
        const next = Array.from(new Set(options));
        if (!cancelled) {
          setSkuUnitOptionsCache((prev) =>
            prev[key] !== undefined ? prev : { ...prev, [key]: next },
          );
        }
      } catch {
        if (!cancelled) {
          setSkuUnitOptionsCache((prev) =>
            prev[key] !== undefined ? prev : { ...prev, [key]: [] },
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeSkuForQuantityUnits]);

  useEffect(() => {
    const sku = String(
      currentSku || matchedVariation?.sku || matched?.sku || product.sku || "",
    )
      .trim()
      .toLowerCase();
    if (!sku) {
      setSkuUnitOptions([]);
      return;
    }
    setSkuUnitOptions(skuUnitOptionsCache[sku] || []);
  }, [currentSku, matchedVariation?.sku, matched?.sku, product.sku, skuUnitOptionsCache]);

  const unitOptions = useMemo(() => {
    const merged = [...metaUnitOptions, ...skuUnitOptions];
    const normalized = new Set<string>();
    const output: string[] = [];
    for (const value of merged) {
      const label = String(value || "").trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (normalized.has(key)) continue;
      normalized.add(key);
      output.push(label);
    }
    return output;
  }, [metaUnitOptions, skuUnitOptions]);

  const eachAttribute = useMemo(() => {
    return attributes.find((attr) => String(attr.name || "").trim().toLowerCase() === "each") || null;
  }, [attributes]);

  const eachValue = useMemo(() => {
    if (!eachAttribute) return "";
    const selectedValue = String(selected[eachAttribute.name] || "").trim();
    if (selectedValue) return selectedValue;
    const first = Array.isArray(eachAttribute.options) ? String(eachAttribute.options[0] || "").trim() : "";
    return first || "Each";
  }, [eachAttribute, selected]);

  const attributeListForPackaging = useMemo(() => {
    if (attributes.length > 0) return attributes;
    return simpleAttributes.map((s) => ({ name: s.name, options: s.values }));
  }, [attributes, simpleAttributes]);

  const packagingUnitAttribute = useMemo(
    () => resolvePackagingUnitAttribute(attributeListForPackaging, eachAttribute),
    [attributeListForPackaging, eachAttribute],
  );

  /** Main variation unit from Woo (e.g. Box (100 Pcs)); extras come from Available Unit Options. */
  const primaryUnitChipValue = useMemo(() => {
    const resolvedVar = matchedVariation || matched;
    if (attributes.length > 0) {
      const fromVariation = concretePackagingLabelFromVariation(resolvedVar, attributes);
      if (fromVariation) return fromVariation;
    }
    if (!packagingUnitAttribute) return "";
    if (eachAttribute && packagingUnitAttribute === eachAttribute) return eachValue;
    const selMap = attributes.length > 0 ? selected : selectedSimpleAttributes;
    const v = String(selMap[packagingUnitAttribute.name] || "").trim();
    if (v) return v;
    if (packagingUnitAttribute.options.length === 1) {
      return String(packagingUnitAttribute.options[0] || "").trim();
    }
    return "";
  }, [
    matchedVariation,
    matched,
    attributes,
    packagingUnitAttribute,
    eachAttribute,
    eachValue,
    selected,
    selectedSimpleAttributes,
    attributes.length,
  ]);

  const extraUnitOptions = useMemo(() => {
    const base = String(primaryUnitChipValue || "").trim().toLowerCase();
    return unitOptions.filter((opt) => String(opt || "").trim().toLowerCase() !== base);
  }, [unitOptions, primaryUnitChipValue]);

  const showMergedUnitRow = useMemo(() => {
    if (attributes.length > 0) {
      return Boolean(String(primaryUnitChipValue || "").trim()) || unitOptions.length > 0;
    }
    // Simple product: only show merged row when Quantity Units adds options beyond the attribute value.
    return extraUnitOptions.length > 0;
  }, [attributes.length, primaryUnitChipValue, unitOptions.length, extraUnitOptions.length]);

  const visibleSimpleAttributes = useMemo(() => {
    if (attributes.length > 0) return simpleAttributes;
    if (!packagingUnitAttribute || !showMergedUnitRow) return simpleAttributes;
    return simpleAttributes.filter((a) => a.name !== packagingUnitAttribute.name);
  }, [attributes.length, simpleAttributes, packagingUnitAttribute, showMergedUnitRow]);

  /** WooCommerce variation "Description" (inventory tab), e.g. "1 CTN = 8 Boxes". */
  const activeVariationDescriptionText = useMemo(() => {
    const v = matchedVariation ?? matched;
    const raw = v?.description;
    if (raw == null || String(raw).trim() === "") return "";
    return plainTextFromVariationDescription(String(raw));
  }, [matchedVariation, matched]);

  const etaDateDisplay = useMemo(
    () => extractEtaDateDisplayForProduct(product, matchedVariation ?? matched),
    [product, matchedVariation, matched],
  );

  const expiryDateDisplay = useMemo(
    () => extractExpiryDateDisplayFromShortDescription(product.short_description),
    [product.short_description],
  );

  const shouldHideSingleValueVariationRows = useMemo(() => {
    // Hide native single-value row whenever merged unit row is active.
    // Prevents temporary duplicate "Pack of 14" on slow networks.
    return showMergedUnitRow;
  }, [showMergedUnitRow]);

  const unitMultiplier = useMemo(() => {
    return selectedUnitOption ? extractUnitMultiplier(selectedUnitOption) : 1;
  }, [selectedUnitOption]);

  const quantity = useMemo(() => {
    const n = Number.parseInt(quantityInput, 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, [quantityInput]);

  const displayPrice = useMemo(() => {
    const base = Number(baseDisplayPrice || 0);
    if (!Number.isFinite(base) || base <= 0) return baseDisplayPrice;
    return (base * unitMultiplier).toFixed(2);
  }, [baseDisplayPrice, unitMultiplier]);

  const displayRegular = useMemo(() => {
    const base = Number(displayRegularBase || 0);
    if (!Number.isFinite(base) || base <= 0) return displayRegularBase;
    return (base * unitMultiplier).toFixed(2);
  }, [displayRegularBase, unitMultiplier]);

  useEffect(() => {
    if (unitOptions.length === 0) {
      setSelectedUnitOption("");
      return;
    }
    setSelectedUnitOption((prev) => (prev && unitOptions.includes(prev) ? prev : ""));
  }, [unitOptions]);

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
            {expiryDateDisplay ? (
              <div className="mt-2 inline-flex items-center rounded-md bg-amber-100 px-2 py-1 text-sm font-semibold text-amber-900 ring-1 ring-amber-300">
                Expiry Date : <span className="ml-1 font-bold">{expiryDateDisplay}</span>
              </div>
            ) : null}
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

      {/* Packaging: variable variations, simple attributes, and Quantity Units merge row */}
      {(attributes.length > 0 || visibleSimpleAttributes.length > 0 || showMergedUnitRow) && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Packaging
          </p>
          {visibleSimpleAttributes.length > 0 && (
            <div className="space-y-3">
              {visibleSimpleAttributes.map((attr) => (
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
          )}
          {attributes.length > 0 && (
            <ProductVariations
              key={`pv-${product.id}-${variationIdFromUrl ?? "base"}`}
              attributes={attributes}
              variations={variations}
              defaultSelected={urlDerivedAttributeSelection}
              onVariationChange={(variation, selectedAttributes) => {
                setMatchedVariation(variation);
                setSelected(selectedAttributes);
                if (!variation) setCurrentSku(product.sku || null);
              }}
              onSkuChange={(sku) => setCurrentSku(sku || product.sku || null)}
              style="swatches"
              hideSingleValueSecondaryAttributes={shouldHideSingleValueVariationRows}
              suppressAttributeRowLabels={
                showMergedUnitRow && packagingUnitAttribute
                  ? [packagingUnitAttribute.name]
                  : undefined
              }
            />
          )}
          {showMergedUnitRow && (
            <div className={attributes.length > 0 || visibleSimpleAttributes.length > 0 ? "mt-4" : ""}>
              <label className="mb-2 block text-sm font-semibold text-[#1f605f]">
                {packagingUnitAttribute?.name || "Unit options"}
              </label>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {primaryUnitChipValue && (
                    <button
                      type="button"
                      onClick={() => setSelectedUnitOption("")}
                      className={`rounded-lg border border-black px-4 py-2.5 text-sm font-medium transition-colors ${
                        !selectedUnitOption
                          ? "bg-black text-white"
                          : "bg-white text-black hover:bg-gray-50"
                      }`}
                    >
                      {primaryUnitChipValue}
                    </button>
                  )}
                  {extraUnitOptions.map((opt) => {
                    const isSelected = selectedUnitOption === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setSelectedUnitOption(opt)}
                        className={`rounded-lg border border-black px-4 py-2.5 text-sm font-medium transition-colors ${
                          isSelected
                            ? "bg-black text-white"
                            : "bg-white text-black hover:bg-gray-50"
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {activeVariationDescriptionText ? (
                  <p className="max-w-md text-sm font-medium leading-snug text-[#1f605f]">
                    {activeVariationDescriptionText}
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delivery plan */}
      <div>
        {/* <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Delivery</p> */}
        <RecurringSelect onChange={setPlan} value={plan} />
        {etaDateDisplay ? (
          <p className="mt-2 text-sm font-bold leading-snug text-[#1f605f]" role="status">
            ETA Date: {etaDateDisplay}
          </p>
        ) : null}
      </div>

      {/* Unit options are shown next to "Each" under Packaging */}

      {/* Quantity */}
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
          Quantity
        </label>
        <input
          type="number"
          min={1}
          inputMode="numeric"
          pattern="[0-9]*"
          value={quantityInput}
          onChange={(e) => {
            const raw = e.target.value;
            const digits = raw.replace(/\D+/g, "");
            // Allow temporary empty value while typing on mobile keyboards.
            setQuantityInput(digits);
          }}
          onBlur={() => {
            const normalized = Number.parseInt(quantityInput, 10);
            setQuantityInput(
              Number.isFinite(normalized) && normalized > 0 ? String(normalized) : "1"
            );
          }}
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
                const rawAttrs =
                  attributes.length > 0 ? { ...selected } : { ...selectedSimpleAttributes };
                const baseAttrs =
                  attributes.length > 0
                    ? overlayConcreteVariationAttributes(
                        rawAttrs,
                        matchedVariation || matched,
                        attributes,
                      )
                    : rawAttrs;
                /** Store API ignores "Available Unit Options"; map merged-row choice onto the real Woo attribute. */
                const attrsForCart =
                  packagingUnitAttribute && selectedUnitOption
                    ? { ...baseAttrs, [packagingUnitAttribute.name]: selectedUnitOption }
                    : baseAttrs;

                /** Alternate unit label (e.g. "3 PKT/CTN") → expand PDP qty into minimum-UOM line qty. */
                const uomMult = selectedUnitOption ? extractUnitMultiplier(selectedUnitOption) : 1;
                const safeUomMult =
                  Number.isFinite(uomMult) && uomMult > 0 ? Math.floor(uomMult) : 1;
                const cartQty = Math.max(1, Math.floor(Number(quantity) * safeUomMult));
                /** Per minimum-UOM unit price so (price × cartQty) matches PDP (displayPrice × quantity). */
                const displayNum = Number(displayPrice || 0);
                const linePrice =
                  selectedUnitOption &&
                  Number.isFinite(displayNum) &&
                  displayNum > 0 &&
                  safeUomMult > 0
                    ? (displayNum / safeUomMult).toFixed(2)
                    : displayPrice || "0";

                const cartItemData =
                  selectedUnitOption && String(selectedUnitOption).trim()
                    ? {
                        bulk_uom: String(selectedUnitOption).trim().slice(0, 200),
                        /** Line qty is already expanded to min UOM; Woo/plugin uses 1 unit per cart qty. */
                        bulk_multiplier: 1,
                      }
                    : undefined;

                addItem({
                  productId: product.id,
                  variationId,
                  name: product.name,
                  slug: product.slug,
                  imageUrl: cartLineImageUrl,
                  price: linePrice,
                  qty: cartQty,
                  sku: matchedVariation?.sku || matched?.sku || product.sku || undefined,
                  attributes: attrsForCart,
                  ...(cartItemData ? { cartItemData } : {}),
                  deliveryPlan: plan,
                  tax_class: variationTaxClass,
                  tax_status: variationTaxStatus,
                  empowerEligible: hasEmpowerTag(product),
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
      {/* <button
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
      </button> */}

      {/* Consultation Form Modal */}
      <ConsultationFormModal
        isOpen={isConsultationModalOpen}
        onClose={() => setIsConsultationModalOpen(false)}
        productName={product.name}
      />
    </div>
  );
}
