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
            <h2 className="text-3xl md:text-3xl font-bold text-gray-900 mb-6">The JOYA Promise</h2>
            <div className="space-y-4 text-gray-700 leading-relaxed">
                <p>
                  At Joya Medical Supplies, we provide trusted products to healthcare professionals, families and individuals across Australia.
                </p>
                <p>
                  As a proudly Australian, family-owned business, JOYA was born from firsthand experience supporting our daughter, Joya, through her healthcare journey. That experience shapes everything we do - from the products we select to the way we support you.
                </p>
                <p>
                  Our carefully curated range of over 10,000 products makes it easier to find what you need in one place. We focus on quality, reliability, and fair pricing - because accessing essential care shouldn’t be complicated.
                </p>
                <p>
                  Choose Australia-wide delivery or convenient store pick-up. 
                </p>
                <p>
                  Most importantly, when you contact us, you’ll speak to a real person who genuinely wants to help - no automated systems, just knowledgeable support when you need it. 
                </p>
                <p>
                  We’re here to make accessing medical supplies simpler, more supportive, and stress-free - so you can focus on what matters most.
                </p>
                <p>The JOYA Care Team</p>
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
                allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media;"
                allowFullScreen
                className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-300 ${
                  isVideoLoaded ? "opacity-100" : "opacity-0"
                }`}
                onLoad={() => setIsVideoLoaded(true)}
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