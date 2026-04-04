"use client";

import dynamic from "next/dynamic";
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import SubcategoryDigitalCatalogue from "./SubcategoryDigitalCatalogue";
import { generateCataloguePDF } from "@/lib/catalogue-pdf";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";

const HTMLFlipBook = dynamic(() => import("react-pageflip"), { ssr: false });

type SubcategoryInfo = {
  id: number;
  slug: string;
  name: string;
};

type CategorySubcategoryBookProps = {
  parentName: string;
  subcategories: SubcategoryInfo[];
};

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
Page.displayName = "CategorySubcategoryBookPage";

const BOOK_PAGE_WIDTH = 600;
const COVER_HEIGHT = 560; // main category cover page – keep fixed
const BOOK_SPREAD_HEIGHT = 760; // open book (spread) – taller so product table shows more rows
const COVER_WIDTH = 300;
const FLIP_DURATION_MS = 600;

export default function CategorySubcategoryBook({
  parentName,
  subcategories,
}: CategorySubcategoryBookProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [bookOpen, setBookOpen] = useState(false);
  const [isFlippingOpen, setIsFlippingOpen] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const bookRef = useRef<{ pageFlip: () => { flipNext: () => void; flipPrev: () => void } }>(null);

  const handleDownloadPdf = useCallback(async () => {
    setPdfDownloading(true);
    try {
      const blob = await generateCataloguePDF(
        parentName,
        subcategories.map((s) => ({ slug: s.slug, name: s.name }))
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `catalogue-${parentName.replace(/\s+/g, "-").toLowerCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Could add toast on error
    } finally {
      setPdfDownloading(false);
    }
  }, [parentName, subcategories]);

  if (!subcategories.length) {
    return (
      <div className="flex items-center justify-center min-h-[360px] bg-white rounded-xl shadow-sm">
        <p className="text-gray-500 text-sm">No subcategories found for this category.</p>
      </div>
    );
  }

  const totalPages = subcategories.length * 2;

  const handleFlip = useCallback((e: { data: number }) => {
    setCurrentPage(e.data);
  }, []);

  const openWithFlip = useCallback(() => {
    setIsFlippingOpen(true);
    setTimeout(() => {
      setBookOpen(true);
      setIsFlippingOpen(false);
    }, FLIP_DURATION_MS);
  }, []);

  const goNext = useCallback(() => {
    bookRef.current?.pageFlip?.()?.flipNext?.();
  }, []);

  const goPrev = useCallback(() => {
    if (currentPage === 0) {
      setBookOpen(false);
      return;
    }
    bookRef.current?.pageFlip?.()?.flipPrev?.();
  }, [currentPage]);

  const canGoNext = currentPage < totalPages - 1;
  const canGoPrev = true;
  const activeTableSubcategoryIndex = Math.floor((currentPage - 1) / 2);

  // First view: only the main category cover; open via arrow (no click on cover so product clicks work later)
  if (!bookOpen) {
    return (
      <div className="flex flex-col items-center gap-4 max-h-[100vh] min-h-0">
        <div className="flex items-center gap-3 w-full max-w-[400px] justify-end shrink-0">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={pdfDownloading}
            className="flex items-center gap-1.5 rounded-lg border border-teal-600 bg-white px-3 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-400"
            aria-label="Download catalogue as PDF"
          >
            <Download className="h-4 w-4" />
            {pdfDownloading ? "Generating…" : "Download PDF"}
          </button>
        </div>
        <div className="bg-gradient-to-b from-gray-200 to-gray-300 p-4 rounded-2xl shadow-inner flex items-center gap-2 shrink-0">
          <div
            className="relative overflow-hidden"
            style={{
              width: COVER_WIDTH,
              height: COVER_HEIGHT,
              perspective: "1200px",
            }}
          >
            <div
              className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-teal-700 to-teal-900 text-white p-8 text-center rounded-r-lg shadow-inner transition-transform duration-[600ms] ease-in-out origin-left"
              style={{
                transform: isFlippingOpen ? "rotateY(-180deg)" : "rotateY(0deg)",
                backfaceVisibility: "hidden",
              }}
            >
              <h1 className="text-3xl font-bold">{parentName}</h1>
              <p className="text-teal-200 text-sm mt-3">Digital catalogue</p>
              <p className="text-teal-300 text-xs mt-2">Use arrow to open — flip to browse</p>
            </div>
          </div>
          <button
            type="button"
            onClick={openWithFlip}
            disabled={isFlippingOpen}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-400"
            aria-label="Open catalogue (next)"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center justify-end gap-3 w-full max-w-[600px]">
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={pdfDownloading}
          className="flex items-center gap-1.5 rounded-lg border border-teal-600 bg-white px-3 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-400"
          aria-label="Download catalogue as PDF"
        >
          <Download className="h-4 w-4" />
          {pdfDownloading ? "Generating…" : "Download PDF"}
        </button>
        <span className="text-sm text-gray-600">
          Page {currentPage + 1} of {totalPages}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={goPrev}
          disabled={!canGoPrev}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-teal-400"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="bg-gradient-to-b from-gray-200 to-gray-300 p-4 rounded-2xl shadow-inner">
          <HTMLFlipBook
            ref={bookRef}
            width={BOOK_PAGE_WIDTH}
            height={BOOK_SPREAD_HEIGHT}
            size="fixed"
            minWidth={0}
            maxWidth={0}
            minHeight={0}
            maxHeight={0}
            showCover={false}
            startPage={0}
            drawShadow
            flippingTime={FLIP_DURATION_MS}
            usePortrait={false}
            startZIndex={0}
            autoSize
            maxShadowOpacity={0.5}
            mobileScrollSupport
            clickEventForward
            useMouseEvents
            swipeDistance={30}
            showPageCorners
            disableFlipByClick={true}
            className=""
            style={{}}
            onFlip={handleFlip}
          >
            {subcategories.flatMap((sub, index) => {
              const introPageNumber = index * 2 + 1;
              const tablePageNumber = index * 2 + 2;
              return [
                <Page key={`intro-${sub.id}`} number={introPageNumber}>
                  <div className="h-full flex flex-col items-center justify-center bg-gradient-to-b from-teal-700 to-teal-900 text-white p-8 text-center">
                    <h1 className="text-2xl font-bold mb-2">{sub.name}</h1>
                    <p className="text-sm text-teal-100 mb-1">{parentName}</p>
                    <p className="text-xs text-teal-100/80">
                      Flip the page to view SKU, product name, size and price for this subcategory.
                    </p>
                  </div>
                </Page>,
                <Page key={`table-${sub.id}`} number={tablePageNumber}>
                  <div className="h-full flex flex-col bg-gray-50">
                    <div className="px-4 py-2 border-b border-gray-200 bg-white text-xs font-semibold text-gray-700 uppercase tracking-wide">
                      {sub.name} — Digital Catalogue
                    </div>
                    <div className="flex-1 overflow-auto p-3">
                      <SubcategoryDigitalCatalogue
                        subcategorySlug={sub.slug}
                        subcategoryName={sub.name}
                        parentName={parentName}
                        shouldLoad={index === activeTableSubcategoryIndex}
                      />
                    </div>
                  </div>
                </Page>,
              ];
            })}
          </HTMLFlipBook>
        </div>
        <button
          type="button"
          onClick={goNext}
          disabled={!canGoNext}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-teal-400"
          aria-label="Next page"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
