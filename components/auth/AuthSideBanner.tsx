"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { useEffect, useState } from "react";
import Link from "next/link";

/** CMS images use <img> so WordPress host always works without next/image remotePatterns. */

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1556740758-90de374c12ad?w=800&h=1200&fit=crop&q=80";

/**
 * Banner bounds — embedded layout;-size with login/register right column (min 54%, max 640px).
 */
const BANNER_BOX_CLASS =
  "flex h-[min(580px,58vh)] w-full max-w-[560px] items-center justify-center sm:h-[min(620px,60vh)] sm:max-w-[580px] lg:h-[min(640px,62vh)] lg:max-w-full lg:min-w-0";

const CMS_IMG_CLASS = "max-h-full max-w-full object-contain object-center drop-shadow-sm";

const FALLBACK_BOX_INNER =
  "relative h-full w-full min-h-[280px] max-h-[580px] sm:max-h-[620px] lg:max-h-[640px]";

type BannerResponse = {
  imageUrl: string | null;
  linkUrl: string | null;
  fromCms: boolean;
};

interface AuthSideBannerProps {
  variant?: "login" | "register";
  /**
   * Use inside the split login/register card: no extra aside chrome, fixed-height image box.
   */
  embedded?: boolean;
}

const FALLBACK_COPY = {
  login: {
    title: "Secure & Fast Access",
    description: "Sign in to access your account and manage your orders and more",
  },
  register: {
    title: "Join Us Today",
    description: "Create an account to start shopping and enjoy exclusive benefits",
  },
} as const;

export function AuthSideBanner({ variant = "login", embedded = false }: AuthSideBannerProps) {
  const [data, setData] = useState<BannerResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cms/login-register-banner")
      .then((r) => r.json())
      .then((json: BannerResponse) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData({ imageUrl: null, linkUrl: null, fromCms: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cmsUrl = data?.imageUrl?.trim() || "";
  const imageSrc = cmsUrl || FALLBACK_IMAGE;
  const linkHref = data?.linkUrl?.trim() || null;
  const fromCms = data?.fromCms === true && Boolean(cmsUrl);
  const copy = FALLBACK_COPY[variant];

  const cmsImg = (
    <img
      src={cmsUrl}
      alt=""
      className={`${CMS_IMG_CLASS} rounded-xl`}
      loading="eager"
      decoding="async"
      referrerPolicy="no-referrer-when-downgrade"
    />
  );

  const fallbackImg = (
    <div className={FALLBACK_BOX_INNER}>
      <Image
        src={imageSrc}
        alt=""
        fill
        priority
        className="rounded-xl object-contain object-center"
        sizes="(min-width: 1024px) 640px, 100vw"
      />
    </div>
  );

  const graphicInner = fromCms ? wrapOptionalLink(linkHref, cmsImg, true) : fallbackImg;

  const graphic = (
    <div
      className={`relative overflow-hidden rounded-xl ${BANNER_BOX_CLASS} ${embedded ? "" : "max-w-[min(28rem,90vw)]"}`}
    >
      {graphicInner}
    </div>
  );

  if (embedded) {
    return (
      <div className="flex h-full min-h-0 w-full max-w-full flex-col items-center justify-center">
        <div className="relative w-full">{graphic}</div>
        {!fromCms && (
          <div className="mt-6 max-w-sm px-2 text-center">
            <h2 className="mb-1 text-lg font-semibold text-slate-900">{copy.title}</h2>
            <p className="text-sm leading-relaxed text-slate-600">{copy.description}</p>
            {linkHref && fallbackExtraLink(linkHref)}
          </div>
        )}
      </div>
    );
  }

  return (
    <aside className="hidden h-full min-h-0 w-auto max-w-[min(34rem,46vw)] shrink-0 flex-col bg-slate-50 lg:flex">
      <div className="flex min-h-0 flex-1 items-center justify-center py-8 sm:py-10">
        <div className="relative inline-block max-w-full">{graphic}</div>
      </div>

      {!fromCms && (
        <div className="mx-auto max-w-md px-6 pb-10 text-center lg:px-8">
          <h2 className="mb-2 text-2xl font-bold text-gray-900">{copy.title}</h2>
          <p className="text-base leading-relaxed text-gray-600">{copy.description}</p>
          {linkHref && fallbackExtraLink(linkHref)}
        </div>
      )}
    </aside>
  );
}

function fallbackExtraLink(linkHref: string) {
  return (
    <p className="mt-4">
      {isInternalHref(linkHref) ? (
        <Link href={linkHref} className="text-sm font-medium text-teal-600 hover:text-teal-500">
          Learn more
        </Link>
      ) : (
        <a
          href={linkHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-teal-600 hover:text-teal-500"
        >
          Learn more
        </a>
      )}
    </p>
  );
}

function wrapOptionalLink(
  linkHref: string | null | undefined,
  node: ReactNode,
  isCms: boolean
): ReactNode {
  if (!linkHref || !isCms) return node;
  if (isInternalHref(linkHref)) {
    return (
      <Link
        href={linkHref}
        className="inline-flex max-h-full max-w-full items-center justify-center rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
        aria-label="Promotional banner link"
      >
        {node}
      </Link>
    );
  }
  return (
    <a
      href={linkHref}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-h-full max-w-full items-center justify-center rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
      aria-label="Opens promotional link in a new tab"
    >
      {node}
    </a>
  );
}

function isInternalHref(href: string): boolean {
  if (!href.startsWith("/")) return false;
  if (href.startsWith("//")) return false;
  return true;
}
