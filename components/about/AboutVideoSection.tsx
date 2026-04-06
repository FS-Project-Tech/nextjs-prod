"use client";
 
import { useState } from "react";
 
export default function AboutVideoSection() {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
 
  /** Vimeo: https://vimeo.com/{id}/{hash} → player URL with ?h= for unlisted/private. */
  const vimeoId = process.env.NEXT_PUBLIC_ABOUT_VIMEO_ID?.trim() || "1074525533";
  const vimeoHash = process.env.NEXT_PUBLIC_ABOUT_VIMEO_HASH?.trim() || "49fa13a9eb";
  const videoUrl =
    process.env.NEXT_PUBLIC_ABOUT_VIDEO_EMBED_URL?.trim() ||
    (vimeoHash
      ? `https://player.vimeo.com/video/${vimeoId}?h=${encodeURIComponent(vimeoHash)}`
      : `https://player.vimeo.com/video/${vimeoId}`);
 
  return (
    <section className="py-16 md:py-20 bg-gradient-to-br from-gray-50 to-white">
      <div className="mx-auto w-[85vw] px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Left: About Us Text */}
          <div className="order-2 lg:order-1">
            <h2 className="text-3xl md:text-3xl font-bold text-gray-900 mb-6">About Us</h2>
            <div className="space-y-4 text-gray-700 leading-relaxed">
                <p className="text-lg">
                  Here at Joya Medical Supplies, we are a trusted and reliable supplier of a wide
                  range of medical products to professionals and the general public. We are proud to
                  be an Australian family-owned and operated company. Our comprehensive inventory
                  allows you to choose from a huge range and presents you with the most suitable
                  medical supplies at modest rates.
                </p>
                <p>
                  Not only that, but we also provide a store pick-up option, and with that motive,
                  Joya Medical Supplies wanted to give our customers the freedom of availability.
                </p>
                <p>
                  We want to stay in touch with our customers and make them believe that we are
                  always here for them. That&apos;s why whenever you ring us, you won&apos;t hear an
                  automated voice but our experts helping you.
                </p>
                <p className="font-medium text-gray-900">
                  We aim to fulfil your medical needs by providing the right consumables to you at
                  the right time. With more than 7,000 products in stock right now, we aim to be
                  your one-stop-shop solution for your medical requirements.
                </p>
              </div>
          </div>
 
          {/* Right: Video */}
          <div className="order-1 lg:order-2">
            <div className="relative aspect-video rounded-xl overflow-hidden shadow-xl bg-gray-100">
              {!isVideoLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
                </div>
              )}
              <iframe
                src={videoUrl}
                title="About JOYA on Vimeo"
                allow="autoplay; fullscreen; picture-in-picture; clipboard-write"
                allowFullScreen
                className="absolute inset-0 h-full w-full border-0"
                onLoad={() => setIsVideoLoaded(true)}
                style={{ display: isVideoLoaded ? "block" : "none" }}
              />
            </div>
            <p className="text-sm text-gray-500 mt-4 text-center">
              Watch our story and learn more about our commitment to you
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}