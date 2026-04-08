"use client";

import PrefetchLink from "@/components/PrefetchLink";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/CartProvider";
import { useWishlist } from "@/contexts/WishlistContext";
import { useToast } from "@/components/ToastProvider";
import { useSession, signOut } from "next-auth/react";
import { apiFetchJson } from "@/lib/api";
import { safeLogoUrl } from "@/lib/api-fallbacks";
import HeaderUser from "@/components/HeaderUser";
import HeaderSearch from "@/components/HeaderSearch";

export default function Header() {
  const [open, setOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const userMenuRef = useRef<HTMLDivElement>(null);
  const userMenuButtonRef = useRef<HTMLButtonElement>(null);

  const { open: openCart, items } = useCart();
  const { items: wishlistItems } = useWishlist();
  const { info } = useToast();

  const { data: session, status } = useSession();
  const user = session?.user || null;
  const loading = status === "loading";

  const [logoUrl, setLogoUrl] = useState<string | null>(
    process.env.NEXT_PUBLIC_HEADER_LOGO || null
  );
  const [tagline, setTagline] = useState<string | null>(
    process.env.NEXT_PUBLIC_HEADER_TAGLINE || null
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const cartCount = items.reduce((sum, item) => sum + item.qty, 0);

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
  }, []);

  return (
    <header className="bg-white">
      {/* Site migration / improvement notice — above tagline */}
      <div className="border-b border-amber-200 bg-amber-50 py-2 px-3 sm:px-4 md:px-5 lg:px-0">
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
      </div>

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
                  priority
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
            onClick={() => setOpen(!open)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-100"
            aria-label="Open menu"
          >
            <span className="text-xl leading-none">☰</span>
          </button>
        </div>

        {/* Desktop Search — wide bar (~2/3 row); overflow-visible for dropdown */}
        <div className="hidden min-w-0 overflow-visible lg:flex lg:col-span-8 justify-center px-1">
          <HeaderSearch />
        </div>

        {/* Right Icons */}
        <div className="hidden lg:flex lg:col-span-2 items-center justify-end gap-2 xl:gap-3">
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
              href="tel:+1234567890"
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
        <HeaderSearch />
      </div>

      {/* Mobile Menu */}
      {open && (
        <div className="lg:hidden border-t px-4 py-4 space-y-3 bg-white">
          <a href="tel:+1234567890" className="block text-sm text-gray-700">
            Hotline: +1 234 567 890
          </a>

          <PrefetchLink href="/" className="block rounded-lg px-2 py-2 hover:bg-gray-50">
            Home
          </PrefetchLink>
          <PrefetchLink href="/shop" className="block rounded-lg px-2 py-2 hover:bg-gray-50">
            Shop
          </PrefetchLink>
          <PrefetchLink href="/catalogue" className="block rounded-lg px-2 py-2 hover:bg-gray-50">
            Catalogue
          </PrefetchLink>

          {loading ? (
            <div className="h-5 w-24 bg-gray-200 rounded animate-pulse"></div>
          ) : user ? (
            <>
              <PrefetchLink
                href="/dashboard"
                className="block rounded-lg px-2 py-2 hover:bg-gray-50"
              >
                Dashboard
              </PrefetchLink>

              <button
                onClick={async () => {
                  await signOut({ callbackUrl: "/login" });
                }}
                className="rounded-lg px-2 py-2 text-red-600 hover:bg-red-50"
              >
                Sign Out
              </button>
            </>
          ) : (
            <PrefetchLink href="/login" className="block rounded-lg px-2 py-2 hover:bg-gray-50">
              Login
            </PrefetchLink>
          )}
        </div>
      )}
    </header>
  );
}
