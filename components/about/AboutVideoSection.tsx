"use client";

import { useState } from "react";

export default function AboutVideoSection() {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  
  // Replace with your actual YouTube video ID or local video path
  const youtubeVideoId = process.env.NEXT_PUBLIC_ABOUT_VIDEO_ID || "dQw4w9WgXcQ";
  const videoUrl = `https://www.youtube.com/embed/${youtubeVideoId}`;

  return (
    <section className="py-16 md:py-20 bg-gradient-to-br from-gray-50 to-white">
      <div className="mx-auto w-[85vw] px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Left: About Us Text */}
          <div className="order-2 lg:order-1">
            <h2 className="text-3xl md:text-3xl font-bold text-gray-900 mb-6">
              About Us
            </h2>
            <div className="space-y-4 text-gray-700 leading-relaxed">
              <p>
                JOYA was founded with a simple yet powerful mission: to make quality healthcare 
                products accessible to everyone across Australia. We understand that healthcare 
                needs are deeply personal, and we're committed to providing solutions that respect 
                dignity, promote independence, and enhance quality of life.
              </p>
              <p>
                Our journey began when we recognized a gap in the market for reliable, affordable, 
                and easily accessible medical supplies and continence care products. Today, we're 
                proud to serve thousands of customers, including NDIS participants, healthcare 
                professionals, and families seeking quality healthcare solutions.
              </p>
              <p>
                What sets us apart is our unwavering commitment to quality, customer service, and 
                understanding the unique needs of our community. We work closely with healthcare 
                professionals, NDIS participants, and families to ensure our product range meets 
                the highest standards of care and comfort.
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
                title="About JOYA"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
                onLoad={() => setIsVideoLoaded(true)}
                style={{ display: isVideoLoaded ? 'block' : 'none' }}
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

