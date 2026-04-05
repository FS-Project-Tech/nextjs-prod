"use client";

import { useEffect, useMemo, useState, forwardRef } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";

const HTMLFlipBook = dynamic(() => import("react-pageflip"), { ssr: false });

type Product = {
  id: number;
  name: string;
  slug: string;
  sku?: string;
  price: string;
  images?: Array<{ src: string; alt?: string }>;
};

type CategoryBookClientProps = {
  categorySlug: string;
  categoryName: string;
};

const PRODUCTS_PER_PAGE = 6;
const MAX_PRODUCTS = 48; // first 48 products per catalogue for now

export default function CategoryBookClient({
  categorySlug,
  categoryName,
}: CategoryBookClientProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          category_slug: categorySlug,
          per_page: String(MAX_PRODUCTS),
          page: "1",
          sortBy: "popularity",
          q: "*",
        });
        const res = await fetch(`/api/typesense/search?${params.toString()}`);
        const json = await res.json();
        if (!cancelled) {
          setProducts(Array.isArray(json.products) ? json.products : []);
        }
      } catch {
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [categorySlug]);

  const productPages = useMemo(() => {
    const pages: Product[][] = [];
    for (let i = 0; i < products.length; i += PRODUCTS_PER_PAGE) {
      pages.push(products.slice(i, i + PRODUCTS_PER_PAGE));
    }
    return pages;
  }, [products]);

  const totalPages = 1 /* intro */ + productPages.length;

  const Page = forwardRef<HTMLDivElement, { number: number; children: React.ReactNode }>(
    ({ number, children }, ref) => (
      <div
        ref={ref}
        className="h-full w-full bg-white shadow-inner overflow-hidden flex flex-col"
        data-page={number}
      >
        {children}
      </div>
    )
  );
  Page.displayName = "Page";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[480px] bg-gray-50 rounded-xl">
        <p className="text-gray-500 text-sm">Loading catalogue…</p>
      </div>
    );
  }

  if (!products.length) {
    return (
      <div className="flex items-center justify-center min-h-[480px] bg-gray-50 rounded-xl">
        <p className="text-gray-500 text-sm">No products found for this category.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-sm text-gray-600 self-end">Page 1 of {totalPages}</div>
      <div className="bg-gradient-to-b from-gray-200 to-gray-300 p-4 rounded-2xl shadow-inner">
        <HTMLFlipBook
          width={600}
          height={420}
          size="fixed"
          minWidth={0}
          maxWidth={0}
          minHeight={0}
          maxHeight={0}
          showCover
          startPage={0}
          drawShadow
          flippingTime={600}
          usePortrait={false}
          startZIndex={0}
          autoSize
          maxShadowOpacity={0.5}
          mobileScrollSupport
          clickEventForward
          useMouseEvents
          swipeDistance={30}
          showPageCorners
          disableFlipByClick={false}
          className=""
          style={{}}
        >
          {/* Intro page */}
          <Page number={1}>
            <div className="h-full flex flex-col items-center justify-center bg-gradient-to-b from-teal-700 to-teal-900 text-white p-8 text-center">
              <h1 className="text-2xl font-bold mb-2">{categoryName}</h1>
              <p className="text-teal-100 text-sm">
                Digital catalogue – browse key products with a book-style experience.
              </p>
            </div>
          </Page>

          {/* Product pages */}
          {productPages.map((pageProducts, pageIndex) => (
            <Page key={pageIndex + 2} number={pageIndex + 2}>
              <div className="h-full flex flex-col bg-white">
                <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  {categoryName} — Products (Page {pageIndex + 1})
                </div>
                <div className="flex-1 p-3 overflow-auto">
                  <div className="grid grid-cols-2 gap-3">
                    {pageProducts.map((p) => (
                      <Link
                        key={p.id}
                        href={`/product/${p.slug}`}
                        className="group flex flex-col rounded-lg border border-gray-200 p-2 hover:border-teal-500 hover:shadow-sm transition-all"
                      >
                        <div className="relative aspect-square rounded-md bg-gray-100 overflow-hidden mb-2">
                          {p.images?.[0]?.src ? (
                            <Image
                              src={p.images[0].src}
                              alt={p.images[0].alt || p.name}
                              fill
                              className="object-contain group-hover:scale-105 transition-transform"
                              sizes="150px"
                            />
                          ) : (
                            <span className="absolute inset-0 flex items-center justify-center text-gray-600 text-xs">
                              No image
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 line-clamp-2 group-hover:text-teal-700">
                            {p.name}
                          </p>
                          {p.sku && (
                            <p className="text-[10px] text-gray-500 mt-0.5">SKU: {p.sku}</p>
                          )}
                          <p className="text-xs font-semibold text-teal-700 mt-0.5">
                            {p.price || "Price on request"}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
                <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-500 text-center bg-gray-50/60">
                  Digital catalogue · Page {pageIndex + 2} of {totalPages}
                </div>
              </div>
            </Page>
          ))}
        </HTMLFlipBook>
      </div>
      {products.length >= MAX_PRODUCTS && (
        <p className="text-xs text-gray-500">
          Showing first {MAX_PRODUCTS} products. Use the normal category page for the full list.
        </p>
      )}
    </div>
  );
}
