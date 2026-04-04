// D:\nextjs\components\CategoriesSectionDisplay.tsx

"use client";

import Image from "next/image";
import Link from "next/link";
import { Swiper, SwiperSlide } from "swiper/react";
import { Pagination, Autoplay } from "swiper/modules";

import "swiper/css";
import "swiper/css/pagination";

export type CategorySectionItem = {
  href: string;
  target: string;
  src: string;
  alt: string;
};

const paginationStyles = (
  <style jsx global>{`
    .acf-category-slider .swiper-pagination {
      bottom: 10px !important;
    }
    .acf-category-slider .swiper-pagination-bullet {
      width: 10px;
      height: 10px;
      background: rgba(0, 0, 0, 0.2);
      border: 2px solid rgba(255, 255, 255, 0.95);
      opacity: 1;
      transition: all 0.3s ease;
    }
    .acf-category-slider .swiper-pagination-bullet-active {
      width: 28px;
      border-radius: 6px;
      background: rgb(20, 184, 166);
      border-color: rgb(20, 184, 166);
      box-shadow: 0 2px 8px rgba(20, 184, 166, 0.5);
    }
  `}</style>
);

export default function CategoriesSectionDisplay({ items }: { items: CategorySectionItem[] }) {
  if (!items.length) return null;

  return (
    <>
      {/* Mobile: horizontal carousel (like hero dual banner) */}
      <div className="md:hidden">
        <div className="container mx-auto px-4">
          <Swiper
            modules={[Pagination, Autoplay]}
            pagination={{ clickable: true }}
            autoplay={{ delay: 3500, disableOnInteraction: false }}
            spaceBetween={12}
            slidesPerView={3.50}
            breakpoints={{
              380: { slidesPerView: 2.35, spaceBetween: 14 },
              480: { slidesPerView: 2.6, spaceBetween: 14 },
            }}
            className="acf-category-slider !pb-10"
          >
            {items.map((item, i) => (
              <SwiperSlide key={`${item.src}-${i}`}>
                <Link
                  href={item.href}
                  target={item.target}
                  className="block rounded-xl ring-1 ring-gray-100 bg-white shadow-sm transition active:opacity-90"
                >
                  <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl">
                    <Image
                      src={item.src}
                      alt={item.alt}
                      fill
                      sizes="45vw"
                      className="object-cover object-center"
                    />
                  </div>
                </Link>
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
      </div>

      {/* md+: original grid */}
      <div className="hidden md:grid md:grid-cols-5 lg:grid-cols-10 gap-4 md:gap-6 container mx-auto px-4">
        {items.map((item, index) => (
          <Link
            key={`${item.src}-${index}`}
            href={item.href}
            target={item.target}
            className="block transition hover:opacity-95"
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
