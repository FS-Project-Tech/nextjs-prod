"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";

export type NursingServiceCardProps = {
  title: string;
  description: string;
  image: string;
  href: string;
};

/**
 * Client component so the CTA always hydrates as a real Next.js navigation target.
 * useRouter fallback avoids rare cases where the default link click doesn’t navigate.
 */
const PLACEHOLDER_IMAGE = "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&q=80";

export default function NursingServiceCard({
  title,
  description,
  image,
  href,
}: NursingServiceCardProps) {
  const router = useRouter();
  const imgSrc = image?.trim() ? image.trim() : PLACEHOLDER_IMAGE;
  const safeHref =
    href && href !== "#" && !href.startsWith("javascript:") ? href : "/our-nursing-services";

  return (
    <article className="relative isolate flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-white border-b-4 border-[#D15E91] shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-[0_12px_40px_rgba(0,0,0,0.1)]">
      <div className="relative z-0 aspect-[5/4] w-full shrink-0 overflow-hidden sm:aspect-[4/3]">
        <Image
          src={imgSrc}
          alt={title}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 50vw"
        />
      </div>

      <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col items-center px-6 pb-8 pt-6 text-center sm:px-8">
        <h3 className="font-serif text-xl font-semibold leading-snug text-gray-900 sm:text-2xl">
          {title}
        </h3>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-gray-600 sm:text-base">
          {description}
        </p>
        <div className="mt-auto flex justify-center pt-6">
          <Link
            href={safeHref}
            prefetch={true}
            scroll={true}
            className="group relative z-20 inline-flex cursor-pointer items-center gap-2 font-serif text-base font-semibold text-[#D15E91] transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[#D15E91] focus:ring-offset-2 rounded-full"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              if (e.button !== 0) return;
              e.preventDefault();
              router.push(safeHref);
            }}
          >
            <span>Read more</span>
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#D15E91] text-white transition-transform group-hover:translate-x-0.5"
              aria-hidden
            >
              <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
            </span>
          </Link>
        </div>
      </div>
    </article>
  );
}
