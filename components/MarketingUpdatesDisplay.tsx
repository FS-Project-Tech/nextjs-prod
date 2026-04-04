// D:\nextjs\components\MarketingUpdatesDisplay.tsx

"use client";

import Image from "next/image";
import Link from "next/link";
import { Swiper, SwiperSlide } from "swiper/react";
import { Pagination, Autoplay } from "swiper/modules";

import "swiper/css";
import "swiper/css/pagination";

export type MarketingSectionItem = {
  href: string;
  target: string;
  src: string;
  alt: string;
};

const paginationStyles = (
  <style jsx global>{`
    .acf-marketing-slider .swiper-pagination {
      bottom: 16px !important;
    }
    .acf-marketing-slider .swiper-pagination-bullet {
      width: 12px;
      height: 12px;
      background: rgba(255, 255, 255, 0.5);
      border: 2px solid rgba(255, 255, 255, 0.85);
      opacity: 1;
      transition: all 0.3s ease;
    }
    .acf-marketing-slider .swiper-pagination-bullet-active {
      width: 32px;
      border-radius: 6px;
      background: rgb(20, 184, 166);
      border-color: rgb(20, 184, 166);
      box-shadow: 0 2px 8px rgba(20, 184, 166, 0.6);
    }
  `}</style>
);

export default function MarketingUpdatesDisplay({
  items,
}: {
  items: MarketingSectionItem[];
}) {
  if (!items.length) return null;

  return (
    <>
      {/* Mobile: full-width slides like main dual banner */}
      <div className="md:hidden">
        <div className="container mx-auto px-4">
          <Swiper
            modules={[Pagination, Autoplay]}
            pagination={{ clickable: true }}
            autoplay={{ delay: 4000, disableOnInteraction: false }}
            slidesPerView={1}
            spaceBetween={12}
            className="acf-marketing-slider !pb-11"
          >
            {items.map((item, i) => (
              <SwiperSlide key={`${item.src}-${i}`}>
                <Link
                  href={item.href}
                  target={item.target}
                  className="block overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100"
                >
                  <div className="relative h-52 w-full sm:h-60">
                    <Image
                      src={item.src}
                      alt={item.alt}
                      fill
                      sizes="100vw"
                      className="object-contain object-center bg-slate-50"
                      priority={i === 0}
                    />
                  </div>
                </Link>
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
      </div>

      {/* md+: original grid */}
      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-5 container mx-auto px-4">
        {items.map((item, index) => (
          <Link
            key={`${item.src}-${index}`}
            href={item.href}
            target={item.target}
            className="block"
          >
            <Image
              src={item.src}
              alt={item.alt}
              className="w-full h-full object-cover rounded-lg"
              width={600}
              height={400}
            />
          </Link>
        ))}
      </div>

      {paginationStyles}
    </>
  );
}
