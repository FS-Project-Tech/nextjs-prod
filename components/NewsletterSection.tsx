"use client";

import SubscribeForm from "@/components/SubscribeForm";
import Image from "next/image";

export default function NewsletterSection() {
  return (
    <section className="mt-10">
      <div className="container mx-auto">
        <div className="grid sm:grid-cols-2 items-center rounded-2xl overflow-hidden bg-[#1f605f]">
          {/* LEFT CONTENT */}
          <div className="p-8 md:p-12 text-left">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">Stay Updated</h2>
            <p className="text-white/80 mb-6 text-lg max-w-md">
              Subscribe to our Newsletter and never miss an update!
            </p>
            <div className="relative h-64 md:h-full w-full">
              <SubscribeForm />
            </div>
          </div>

          {/* RIGHT IMAGE */}
        </div>
      </div>
    </section>
  );
}
