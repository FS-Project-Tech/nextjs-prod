"use client";

import { useState } from "react";
import Image from "next/image";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperType } from "swiper";
import { Navigation, Thumbs, FreeMode } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/thumbs";
import "swiper/css/free-mode";

interface ProductImage {
  id: number;
  src: string;
  alt?: string;
  name?: string;
}

interface ProductGalleryProps {
  images: ProductImage[];
}

export default function ProductGallery({ images }: ProductGalleryProps) {
  const [thumbsSwiper, setThumbsSwiper] = useState<SwiperType | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter out empty images
  const validImages = images.filter((img) => img.src && img.src.trim() !== "");

  // Fallback if no images
  if (validImages.length === 0) {
    return (
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
        <div className="flex h-full w-full items-center justify-center text-gray-400">
          No Image Available
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" suppressHydrationWarning>
      {/* Main Image Swiper */}
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <Swiper
          modules={[Navigation, Thumbs]}
          navigation
          thumbs={{ swiper: thumbsSwiper && !thumbsSwiper.destroyed ? thumbsSwiper : null }}
          onSlideChange={(swiper) => setSelectedIndex(swiper.activeIndex)}
          className="h-full w-full"
        >
          {validImages.map((img, index) => (
            <SwiperSlide key={img.id || index}>
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

      {/* Thumbnail Swiper */}
      {validImages.length > 1 && (
        <div className="w-full">
          <Swiper
            modules={[Thumbs, FreeMode]}
            onSwiper={setThumbsSwiper}
            freeMode
            watchSlidesProgress
            slidesPerView={4}
            spaceBetween={8}
            breakpoints={{
              640: { slidesPerView: 5 },
              768: { slidesPerView: 6 },
            }}
            className="!px-0"
          >
            {validImages.map((img, index) => (
              <SwiperSlide
                key={img.id || index}
                className={`cursor-pointer rounded-lg border-2 transition-all ${
                  selectedIndex === index
                    ? "border-gray-900 opacity-100"
                    : "border-gray-200 opacity-60 hover:opacity-100"
                }`}
              >
                <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-gray-100">
                  <Image
                    src={img.src}
                    alt={img.alt || img.name || `Thumbnail ${index + 1}`}
                    fill
                    sizes="(max-width: 768px) 25vw, 12vw"
                    className="object-cover"
                    loading="lazy"
                    unoptimized
                  />
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
      )}
    </div>
  );
}
