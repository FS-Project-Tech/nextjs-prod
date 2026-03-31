"use client";

import Image from "next/image";
import { Swiper, SwiperSlide } from "swiper/react";
import { Pagination, Autoplay } from "swiper/modules";
import PrefetchLink from "@/components/PrefetchLink";
import { useMemo } from "react";

import "swiper/css";
import "swiper/css/pagination";

export interface SliderImage {
  src: string;
  alt?: string;
  link?: string;
}

/* ---------------- FALLBACK IMAGES ---------------- */

const defaultLeft: SliderImage[] = [
  { src: "https://picsum.photos/1200/500?random=1", alt: "Placeholder 1" },
  { src: "https://picsum.photos/1200/500?random=2", alt: "Placeholder 2" },
  { src: "https://picsum.photos/1200/500?random=3", alt: "Placeholder 3" },
];

const defaultRight: SliderImage[] = [
  { src: "https://picsum.photos/600/500?random=11", alt: "Placeholder A" },
  { src: "https://picsum.photos/600/500?random=12", alt: "Placeholder B" },
  { src: "https://picsum.photos/600/500?random=13", alt: "Placeholder C" },
];

/* ---------------- COMPONENT ---------------- */

export default function HeroDualSlider({
  leftImages = [],
  rightImages = [],
}: {
  leftImages?: SliderImage[];
  rightImages?: SliderImage[];
}) {
  /* ---- Normalize data ---- */
  const { leftData, rightData } = useMemo(() => {
    const normalize = (images: any[]): SliderImage[] =>
      Array.isArray(images)
        ? images
            .map((img) => ({
              src: img?.src || img?.url || "",
              alt: img?.alt || "",
              link: img?.link || undefined,
            }))
            .filter((img) => img.src.trim())
        : [];

    return {
      leftData: normalize(leftImages).length
        ? normalize(leftImages)
        : defaultLeft,
      rightData: normalize(rightImages).length
        ? normalize(rightImages)
        : defaultRight,
    };
  }, [leftImages, rightImages]);

  /* ---- Slide renderer ---- */
  const renderSlide = (
    img: SliderImage,
    index: number,
    sizes: string,
    objectPosition: "left" | "center" = "center"
  ) => {
    const image = (
      <div className="relative h-56 w-full overflow-hidden rounded-xl sm:h-72 md:h-80 lg:h-96">
        <Image
          src={img.src}
          alt={img.alt || `Slide ${index + 1}`}
          fill
          sizes={sizes}
          className="object-cover"
          priority={index === 0}
        />
      </div>
    );

    return img.link ? (
      <PrefetchLink href={img.link} critical>
        {image}
      </PrefetchLink>
    ) : (
      image
    );
  };

  /* ---------------- UI ---------------- */

  return (
    <div className="container mx-auto">
      {/* 
        Mobile & Tablet: 1 column (stacked)
        Desktop (md+): 4 columns (3 + 1 layout)
      */}
      <div className="grid gap-4 grid-cols-1 ">
        {/* -------- LEFT BANNER -------- */}
        <div className="md:col-span-3">
          <Swiper
            modules={[Pagination, Autoplay]}
            pagination={{ clickable: true }}
            autoplay={{ delay: 4000, disableOnInteraction: false }}
            className="hero-slider-left"
          >
            {leftData.map((img, i) => (
              <SwiperSlide key={i}>
                {renderSlide(img, i, "(max-width: 768px) 100vw, 75vw", "left")}
              </SwiperSlide>
            ))}
          </Swiper>
        </div>

        {/* -------- RIGHT BANNER -------- */}
        {/* <div className="md:col-span-1">
          <Swiper
            modules={[Pagination, Autoplay]}
            pagination={{ clickable: true }}
            autoplay={{ delay: 4500, disableOnInteraction: false }}
            className="hero-slider-right"
          >
            {rightData.map((img, i) => (
              <SwiperSlide key={i}>
                {renderSlide(img, i, "(max-width: 768px) 100vw, 25vw", "center")}
              </SwiperSlide>
            ))}
          </Swiper>
        </div> */}
      </div>

      {/* -------- Pagination styles -------- */}
      <style jsx global>{`
        .hero-slider-left .swiper-pagination,
        .hero-slider-right .swiper-pagination {
          bottom: 20px !important;
        }

        .swiper-pagination-bullet {
          width: 12px;
          height: 12px;
          background: rgba(255, 255, 255, 0.5);
          border: 2px solid rgba(255, 255, 255, 0.8);
          transition: all 0.3s ease;
        }

        .swiper-pagination-bullet-active {
          width: 32px;
          border-radius: 6px;
          background: rgb(20, 184, 166);
          border-color: rgb(20, 184, 166);
          box-shadow: 0 2px 8px rgba(20, 184, 166, 0.6);
        }
      `}</style>
    </div>
  );
}
