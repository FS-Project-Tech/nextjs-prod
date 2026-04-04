"use client";

import dynamic from "next/dynamic";
import { forwardRef, useCallback, useState } from "react";
import SubcategoryDigitalCatalogue from "./SubcategoryDigitalCatalogue";

const HTMLFlipBook = dynamic(() => import("react-pageflip"), { ssr: false });

type SubcategoryBookProps = {
  subcategorySlug: string;
  subcategoryName: string;
  parentName: string;
};

// Simple page wrapper for react-pageflip
const Page = forwardRef<HTMLDivElement, { number: number; children: React.ReactNode }>(
  ({ number, children }, ref) => (
    <div
      ref={ref}
      data-page={number}
      className="h-full w-full bg-white shadow-inner overflow-hidden flex flex-col"
    >
      {children}
    </div>
  )
);
Page.displayName = "SubcategoryBookPage";

export default function SubcategoryBook({
  subcategorySlug,
  subcategoryName,
  parentName,
}: SubcategoryBookProps) {
  // For now: 2 pages – left intro, right full table.
  const totalPages = 2;

  const [currentPage, setCurrentPage] = useState(0);

  const handleFlip = useCallback((e: { data: number }) => {
    setCurrentPage(e.data);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="self-end text-sm text-gray-600">
        Page {currentPage + 1} of {totalPages}
      </div>
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
          onFlip={handleFlip}
        >
          {/* Left page: intro / cover for this subcategory */}
          <Page number={1}>
            <div className="h-full flex flex-col items-center justify-center bg-gradient-to-b from-teal-700 to-teal-900 text-white p-8 text-center">
              <h1 className="text-2xl font-bold mb-2">{subcategoryName}</h1>
              <p className="text-sm text-teal-100 mb-1">{parentName}</p>
              <p className="text-xs text-teal-100/80">
                Digital product catalogue. Flip the page to view SKU, name, size and price.
              </p>
            </div>
          </Page>

          {/* Right page: existing table-based digital catalogue */}
          <Page number={2}>
            <div className="h-full flex flex-col bg-gray-50">
              <div className="px-4 py-2 border-b border-gray-200 bg-white text-xs font-semibold text-gray-700 uppercase tracking-wide">
                {subcategoryName} — Digital Catalogue
              </div>
              <div className="flex-1 overflow-auto p-3">
                <SubcategoryDigitalCatalogue
                  subcategorySlug={subcategorySlug}
                  subcategoryName={subcategoryName}
                  parentName={parentName}
                />
              </div>
            </div>
          </Page>
        </HTMLFlipBook>
      </div>
    </div>
  );
}
