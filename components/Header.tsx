"use client";

import PrefetchLink from "@/components/PrefetchLink";
import Image from "next/image";
import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useCart } from "@/components/CartProvider";
import { useWishlist } from "@/contexts/WishlistContext";
import { useToast } from "@/components/ToastProvider";
import { useSession, signOut } from "next-auth/react";
import { apiFetchJson } from "@/lib/api";
import { safeLogoUrl } from "@/lib/api-fallbacks";
import HeaderUser from "@/components/HeaderUser";
import HeaderSearch from "@/components/HeaderSearch";
import type { PublicHeaderPayload } from "@/lib/cms/public-header-data";

function HeaderSearchFallback() {
  return (
    <div
      className="h-11 w-full max-w-3xl rounded-lg border border-gray-200 bg-gray-50"
      aria-hidden
    />
  );
}

function initialLogoFromCms(initialCms: PublicHeaderPayload | null | undefined): string | null {
  if (initialCms?.logo?.trim()) return safeLogoUrl(initialCms.logo);
  const env = process.env.NEXT_PUBLIC_HEADER_LOGO?.trim();
  return env ? safeLogoUrl(env) : null;
}

export default function Header({
  initialCms,
}: {
  /** From RSC layout — avoids /api/cms/header on first paint when set */
  initialCms?: PublicHeaderPayload | null;
}) {
  const pathname = usePathname();
  const logoLcpPriority = pathname === "/";
  const [open, setOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const userMenuRef = useRef<HTMLDivElement>(null);
  const userMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const { open: openCart, items } = useCart();
  const { items: wishlistItems } = useWishlist();
  const { info } = useToast();

  const { data: session, status } = useSession();
  const user = session?.user || null;
  const loading = status === "loading";

  const [logoUrl, setLogoUrl] = useState<string | null>(() => initialLogoFromCms(initialCms));
  const [tagline, setTagline] = useState<string | null>(
    initialCms?.tagline ?? process.env.NEXT_PUBLIC_HEADER_TAGLINE ?? null
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const cartCount = items.reduce((sum, item) => sum + item.qty, 0);

  const closeMobileMenu = () => setOpen(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    function handleOutsideClose(event: MouseEvent | TouchEvent) {
      if (!open) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (mobileMenuRef.current?.contains(target)) return;
      if (mobileMenuButtonRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", handleOutsideClose);
    document.addEventListener("touchstart", handleOutsideClose);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClose);
      document.removeEventListener("touchstart", handleOutsideClose);
    };
  }, [open]);

  useEffect(() => {
    if (initialCms) return;

    async function loadHeaderData() {
      try {
        const json = await apiFetchJson<{
          logo?: string;
          tagline?: string;
        }>("/api/cms/header");

        if (json.logo) setLogoUrl(safeLogoUrl(json.logo));
        if (json.tagline) setTagline(json.tagline);
      } catch {
        setLogoUrl(safeLogoUrl(null));
      }
    }

    loadHeaderData();
  }, [initialCms]);

  return (
    <header className="bg-white">
      {/* Site migration / improvement notice — above tagline */}
      {/* <div className="border-b border-amber-200 bg-amber-50 py-2 px-3 sm:px-4 md:px-5 lg:px-0">
        <div className="container mx-auto text-[11px] leading-relaxed text-amber-950 sm:text-xs">
          <p className="text-center sm:text-left">
            We are currently working on improving our website functionality and completing system
            migrations. If you experience any issues, please contact us at{" "}
            <a
              href="mailto:info@joyamedicalsupplies.com.au"
              className="font-semibold text-amber-900 underline decoration-amber-800 underline-offset-2 hover:text-amber-950"
            >
              info@joyamedicalsupplies.com.au
            </a>{" "}
            or reach out to our support team for assistance.
          </p>
        </div>
      </div> */}

      {/* Top Bar */}
      <div className="bg-teal-600 text-white py-2 px-3 sm:px-4 md:px-5 lg:px-0">
        <div className="container mx-auto flex min-h-7 items-center justify-between text-[11px] sm:text-xs">
          {tagline && <div className="text-white italic">{tagline}</div>}
        </div>
      </div>

      <nav className="container mx-auto grid grid-cols-2 lg:grid-cols-12 items-center gap-2 sm:gap-3 px-3 sm:px-4 md:px-5 lg:px-0 py-3 md:py-4">
        {/* Logo */}
        <div className="lg:col-span-2 flex items-center">
          <PrefetchLink href="/" className="flex items-center gap-2">
            {logoUrl ? (
              <div className="relative h-12 w-32 sm:h-14 sm:w-36 md:h-16 md:w-40">
                <Image
                  src={logoUrl || "/logo-placeholder.png"}
                  alt="Logo"
                  fill
                  className="object-contain"
                  priority={logoLcpPriority}
                  sizes="(max-width: 768px) 144px, 160px"
                />
              </div>
            ) : (
              <div className="h-8 w-8 rounded bg-blue-600 text-white grid place-items-center font-bold">
                Joya
              </div>
            )}
          </PrefetchLink>
        </div>

        {/* Mobile Menu Button */}
        <div className="flex lg:hidden justify-end">
          <button
            ref={mobileMenuButtonRef}
            onClick={() => setOpen(!open)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 transition-colors duration-200 hover:bg-gray-100"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            <span
              className={`text-xl leading-none transition-transform duration-200 ${
                open ? "rotate-90 scale-95" : "rotate-0 scale-100"
              }`}
              aria-hidden
            >
              {open ? "✕" : "☰"}
            </span>
          </button>
        </div>

        {/* Desktop Search — below 1480px use 7 cols so bar + ring do not crowd phone; 8 cols from 1480px up */}
        <div className="hidden min-w-0 w-full overflow-visible lg:flex lg:col-span-7 min-[1480px]:lg:col-span-8 justify-center px-1">
          <Suspense fallback={<HeaderSearchFallback />}>
            <HeaderSearch />
          </Suspense>
        </div>

        {/* Right Icons — extra column below 1480px for phone + icons; stay above search if subpixel overlap */}
        <div className="relative z-10 hidden min-w-0 shrink-0 lg:flex lg:col-span-3 min-[1480px]:lg:col-span-2 items-center justify-end gap-2 xl:gap-3">
          <div className="hidden md:flex items-center gap-2">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 text-gray-500"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 5a2 2 0 0 1 2-2h3.28l1.5 4.5-2.3 1.1a11 11 0 0 0 5.5 5.5l1.1-2.3 4.5 1.5V19a2 2 0 0 1-2 2h-1C9.7 21 3 14.3 3 6V5z" />
            </svg>
            <a
              href="tel:07 2146 3568"
              className="whitespace-nowrap text-sm text-gray-700 hover:text-teal-800"
            >
              07 2146 3568
            </a>
          </div>

          {/* Wishlist */}
          <PrefetchLink
            href="/dashboard/wishlist"
            className="relative rounded p-2 text-gray-700 hover:bg-gray-100 wishlist-button"
            role="link"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
            </svg>

            {isMounted && wishlistItems.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                {wishlistItems.length > 99 ? "99+" : wishlistItems.length}
              </span>
            )}
          </PrefetchLink>

          {/* Cart */}
          <button
            onClick={() => {
              if (items.length > 0) openCart();
              else info("Please choose product to add to cart");
            }}
            className="relative rounded p-2 text-gray-700 hover:bg-gray-100 mini-cart-button"
            aria-label="Open cart"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 12.39a2 2 0 0 0 2 1.61h7.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>

            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </button>

          {/* User Menu */}
          {loading ? (
            <div className="h-8 w-8 rounded-full bg-gray-200 animate-pulse"></div>
          ) : user ? (
            <div ref={userMenuRef} className="relative">
              <button
                ref={userMenuButtonRef}
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="h-8 w-8 rounded-full bg-teal-600 text-white font-semibold"
              >
                {user.name?.charAt(0).toUpperCase() || "U"}
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white border shadow rounded">
                  <PrefetchLink href="/dashboard" className="block px-4 py-2 hover:bg-gray-100">
                    Dashboard
                  </PrefetchLink>

                  {/* <PrefetchLink
                    href="/dashboard/orders"
                    className="block px-4 py-2 hover:bg-gray-100"
                  >
                    Orders
                  </PrefetchLink> */}

                  <button
                    onClick={async () => {
                      try {
                        await signOut({ callbackUrl: "/login" });
                      } finally {
                        setUserMenuOpen(false);
                      }
                    }}
                    className="block w-full text-left px-4 py-2 text-red-600 hover:bg-red-50"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <HeaderUser />
          )}
        </div>
      </nav>

      {/* Mobile + Tablet Search (Amazon-style top full width) */}
      <div className="lg:hidden container mx-auto overflow-visible px-3 sm:px-4 md:px-5 pb-3">
        <Suspense fallback={<HeaderSearchFallback />}>
          <HeaderSearch />
        </Suspense>
      </div>

      {/* Mobile Menu */}
      <div
        ref={mobileMenuRef}
        className={`[color-scheme:light] lg:hidden overflow-hidden border-t bg-white transition-all duration-300 ease-out ${
          open ? "max-h-[32rem] opacity-100" : "max-h-0 opacity-0"
        }`}
        aria-hidden={!open}
      >
        <div className="px-4 py-4 space-y-3 text-gray-900">
          <a
            href="tel:07 2146 3568"
            className="block text-sm text-gray-800 hover:text-gray-900"
            onClick={closeMobileMenu}
          >
             07 2146 3568
          </a>

          <PrefetchLink
            href="/"
            className="block rounded-lg px-2 py-2 text-gray-900 visited:text-gray-900 hover:bg-gray-50"
            onClick={closeMobileMenu}
          >
            Home
          </PrefetchLink>
          <PrefetchLink
            href="/shop"
            className="block rounded-lg px-2 py-2 text-gray-900 visited:text-gray-900 hover:bg-gray-50"
            onClick={closeMobileMenu}
          >
            Shop
          </PrefetchLink>
          <PrefetchLink
            href="/catalogue"
            className="block rounded-lg px-2 py-2 text-gray-900 visited:text-gray-900 hover:bg-gray-50"
            onClick={closeMobileMenu}
          >
            Catalogue
          </PrefetchLink>

          {loading ? (
            <div className="h-5 w-24 bg-gray-200 rounded animate-pulse"></div>
          ) : user ? (
            <>
              <PrefetchLink
                href="/dashboard"
                className="block rounded-lg px-2 py-2 text-gray-900 visited:text-gray-900 hover:bg-gray-50"
                onClick={closeMobileMenu}
              >
                Dashboard
              </PrefetchLink>

              <button
                type="button"
                onClick={async () => {
                  closeMobileMenu();
                  await signOut({ callbackUrl: "/login" });
                }}
                className="block w-full rounded-lg px-2 py-2 text-left text-red-600 hover:bg-red-50"
              >
                Sign Out
              </button>
            </>
          ) : (
            <PrefetchLink
              href="/login"
              className="block rounded-lg px-2 py-2 text-gray-900 visited:text-gray-900 hover:bg-gray-50"
              onClick={closeMobileMenu}
            >
              Login
            </PrefetchLink>
          )}
        </div>
      </div>
    </header>
  );
}
