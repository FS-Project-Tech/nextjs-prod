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

/** Next/Image layout hints only; rendered size is `w-full` × `h-auto` (natural aspect). */
const HERO_IMG_WIDTH = 2400;
const HERO_IMG_HEIGHT = 900;

/* ---------------- COMPONENT ---------------- */

export default function HeroDualSlider({
  leftImages = [],
  rightImages = [],
  /** ACF `mobile_left_side_banner`; if empty, uses desktop left slides on small screens */
  mobileLeftImages = [],
  /** ACF `mobile_right_side_banner`; if empty, uses desktop right slides when shown */
  mobileRightImages = [],
}: {
  leftImages?: SliderImage[];
  rightImages?: SliderImage[];
  mobileLeftImages?: SliderImage[];
  mobileRightImages?: SliderImage[];
}) {
  /* ---- Normalize data ---- */
  const { leftData, rightData, mobileLeftData, mobileRightOnly } = useMemo(() => {
    const normalize = (images: SliderImage[]): SliderImage[] =>
      Array.isArray(images)
        ? images
            .map((img) => ({
              src: img?.src || (img as { url?: string })?.url || "",
              alt: img?.alt || "",
              link: img?.link || undefined,
            }))
            .filter((img) => img.src.trim())
        : [];

    const leftNorm = normalize(leftImages);
    const rightNorm = normalize(rightImages);
    const mLeftNorm = normalize(mobileLeftImages);
    const mRightNorm = normalize(mobileRightImages);

    const leftData = leftNorm.length ? leftNorm : defaultLeft;
    const rightData = rightNorm.length ? rightNorm : defaultRight;

    return {
      leftData,
      rightData,
      /** Falls back to desktop left when mobile repeater empty */
      mobileLeftData: mLeftNorm.length ? mLeftNorm : leftData,
      /** Only ACF mobile-right slides (no fallback) so we don’t stack duplicate defaults */
      mobileRightOnly: mRightNorm,
    };
  }, [leftImages, rightImages, mobileLeftImages, mobileRightImages]);

  /* ---- Slide renderer ---- */
  const renderSlide = (img: SliderImage, index: number, sizes: string) => {
    const image = (
      <div className="relative w-full overflow-hidden rounded-none bg-white">
        <Image
          src={img.src}
          alt={img.alt || `Slide ${index + 1}`}
          width={HERO_IMG_WIDTH}
          height={HERO_IMG_HEIGHT}
          sizes={sizes}
          className="h-auto w-full max-w-full object-contain object-center"
          priority={index === 0}
        />
      </div>
    );

    return img.link ? (
      <PrefetchLink href={img.link} critical className="block w-full">
        {image}
      </PrefetchLink>
    ) : (
      image
    );
  };

  const paginationStyles = (
    <style jsx global>{`
      .hero-banner-root .hero-slider-left .swiper-pagination,
      .hero-banner-root .hero-slider-right .swiper-pagination,
      .hero-banner-root .hero-slider-mobile-left .swiper-pagination,
      .hero-banner-root .hero-slider-mobile-right .swiper-pagination {
        bottom: 20px !important;
      }
    
      .hero-banner-root .swiper-pagination-bullet {
        width: 10px;
        height: 10px;
        margin: 0 4px !important;
        background: #5d8d88;
        border: none;
        opacity: 1;
        border-radius: 50%;
        transition: width 0.3s ease, border-radius 0.3s ease, background-color 0.3s ease,
          box-shadow 0.3s ease;
      }
    
      .hero-banner-root .swiper-pagination-bullet-active {
        width: 32px;
        border-radius: 9999px;
        background: #58d2c1;
        box-shadow: 0 2px 12px rgba(88, 210, 193, 0.65);
      }
    `}</style>
  );

  return (
    <div className="hero-banner-root min-w-0">
      {/* ---- Mobile / tablet: &lt; md — ACF mobile repeaters (fallback = desktop) ---- */}
      <div className="md:hidden w-full space-y-4">
        <Swiper
          modules={[Pagination, Autoplay]}
          pagination={{ clickable: true }}
          autoplay={{ delay: 4000, disableOnInteraction: false }}
          autoHeight
          className="hero-slider-mobile-left w-full max-w-full"
        >
          {mobileLeftData.map((img, i) => (
            <SwiperSlide key={`m-l-${i}`}>
              {renderSlide(img, i, "100vw")}
            </SwiperSlide>
          ))}
        </Swiper>

        {mobileRightOnly.length > 0 && (
          <Swiper
            modules={[Pagination, Autoplay]}
            pagination={{ clickable: true }}
            autoplay={{ delay: 4500, disableOnInteraction: false }}
            autoHeight
            className="hero-slider-mobile-right w-full max-w-full"
          >
            {mobileRightOnly.map((img, i) => (
              <SwiperSlide key={`m-r-${i}`}>
                {renderSlide(img, i, "100vw")}
              </SwiperSlide>
            ))}
          </Swiper>
        )}
      </div>

      {/* ---- Desktop: md+ — desktop ACF only ---- */}
      <div className="hidden w-full md:block">
        <div className="grid w-full max-w-none grid-cols-1 gap-4">
          <div className="w-full min-w-0 md:col-span-3">
            <Swiper
              modules={[Pagination, Autoplay]}
              pagination={{ clickable: true }}
              autoplay={{ delay: 4000, disableOnInteraction: false }}
              autoHeight
              className="hero-slider-left w-full max-w-full"
            >
              {leftData.map((img, i) => (
                <SwiperSlide key={i}>
                  {renderSlide(img, i, "100vw")}
                </SwiperSlide>
              ))}
            </Swiper>
          </div>

          {/* -------- RIGHT BANNER (desktop) -------- */}
          {/* <div className="md:col-span-1">
            <Swiper
              modules={[Pagination, Autoplay]}
              pagination={{ clickable: true }}
              autoplay={{ delay: 4500, disableOnInteraction: false }}
              className="hero-slider-right"
            >
              {rightData.map((img, i) => (
                <SwiperSlide key={i}>
                  {renderSlide(
                    img,
                    i,
                    "(max-width: 768px) 100vw, 25vw",
                    "h-56 w-full sm:h-72 md:h-80 lg:h-96"
                  )}
                </SwiperSlide>
              ))}
            </Swiper>
          </div> */}
        </div>
      </div>

      {paginationStyles}
    </div>
  );
}
