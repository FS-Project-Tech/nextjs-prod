"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperType } from "swiper";
import { Navigation } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import { useProductVariationGallery } from "@/components/product/ProductVariationGalleryProvider";

interface ProductImage {
  id: number;
  src: string;
  alt?: string;
  name?: string;
}

interface ProductGalleryProps {
  /** When omitted, images come from {@link ProductVariationGalleryProvider} (variation-aware). */
  images?: ProductImage[];
}

export default function ProductGallery({ images: imagesProp }: ProductGalleryProps) {
  const galleryBridge = useProductVariationGallery();
  const images = galleryBridge?.mergedImages ?? imagesProp ?? [];

  const mainSwiperRef = useRef<SwiperType | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const validImages = images.filter((img) => img.src && img.src.trim() !== "");

  const gallerySignature = validImages.map((i) => i.src).join("|");

  useEffect(() => {
    setSelectedIndex(0);
    const s = mainSwiperRef.current;
    if (s && !s.destroyed) {
      try {
        s.slideTo(0, 0);
      } catch {
        /* swiper may be mid-teardown */
      }
    }
  }, [gallerySignature]);

  if (validImages.length === 0) {
    return (
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
        <div className="flex h-full w-full items-center justify-center text-gray-600">
          No Image Available
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" suppressHydrationWarning>
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <Swiper
          modules={[Navigation]}
          navigation
          onSwiper={(swiper) => {
            mainSwiperRef.current = swiper;
          }}
          onSlideChange={(swiper) => setSelectedIndex(swiper.activeIndex)}
          className="h-full w-full"
        >
          {validImages.map((img, index) => (
            <SwiperSlide key={`${img.src}-${img.id || index}`}>
              <div className="relative h-full w-full">
                <Image
                  src={img.src}
                  alt={img.alt || img.name || `Product image ${index + 1}`}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-contain"
                  priority={index === 0}
                />
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>

      {validImages.length > 1 && (
        <div className="flex w-full flex-wrap gap-2">
          {validImages.map((img, index) => (
            <button
              key={`${img.src}-${img.id || index}-thumb`}
              type="button"
              onClick={() => {
                const s = mainSwiperRef.current;
                if (s && !s.destroyed) {
                  try {
                    s.slideTo(index);
                  } catch {
                    /* ignore */
                  }
                }
              }}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-all sm:h-20 sm:w-20 ${
                selectedIndex === index
                  ? "border-gray-900 opacity-100 ring-2 ring-gray-900 ring-offset-1"
                  : "border-gray-200 opacity-70 hover:opacity-100"
              }`}
              aria-label={`Show image ${index + 1}`}
              aria-current={selectedIndex === index ? "true" : undefined}
            >
              <Image
                src={img.src}
                alt={img.alt || img.name || `Thumbnail ${index + 1}`}
                fill
                sizes="80px"
                className="object-cover"
                loading="lazy"
                unoptimized
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
