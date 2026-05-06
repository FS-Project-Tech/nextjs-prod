"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/components/CartProvider";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import AllCategoriesDrawer from "@/components/AllCategoriesDrawer";

const TABS = [
  {
    key: "home",
    label: "Home",
    href: "/",
    icon: (
      <path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-4H9v4a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-9z" />
    ),
  },
  {
    key: "categories",
    label: "Categories",
    href: "#",
    icon: (
      <>
        <path d="M4 4h7v7H4z" />
        <path d="M13 4h7v7h-7z" />
        <path d="M4 13h7v7H4z" />
        <path d="M13 13h7v7h-7z" />
      </>
    ),
  },
  {
    key: "wishlist",
    label: "Wishlist",
    href: "/dashboard/wishlist",
    icon: (
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    ),
  },
  {
    key: "me",
    label: "Me",
    href: "/dashboard",
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
      </>
    ),
  },
  {
    key: "cart",
    label: "Cart",
    href: "#",
    icon: (
      <>
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 12.39a2 2 0 0 0 2 1.61h7.72a2 2 0 0 0 2-1.61L23 6H6" />
      </>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { open, items } = useCart();
  const { data: session, status } = useSession();
  const [visible, setVisible] = useState(true);
  const [lastY, setLastY] = useState(0);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const meHref = session?.user ? "/dashboard" : "/login";
  const meActive = pathname === "/dashboard" || pathname.startsWith("/dashboard/");

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setVisible(y < 10 || y < lastY);
      setLastY(y);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [lastY]);

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-50 block lg:hidden`}
      aria-label="Bottom navigation"
      suppressHydrationWarning
    >
      <div
        className={`mx-auto w-full max-w-[64rem] bg-white/95 backdrop-blur border-t border-gray-200 transition-transform duration-200 ${visible ? "translate-y-0" : "translate-y-full"} pb-[env(safe-area-inset-bottom)]`}
        suppressHydrationWarning
      >
        <ul className="grid grid-cols-5" suppressHydrationWarning>
          {TABS.map((tab) => {
            const tabHref = tab.key === "me" ? meHref : tab.href;
            const active =
              tab.key === "me"
                ? meActive
                : tabHref !== "#" && (pathname === tabHref || pathname.startsWith(`${tabHref}/`));
            const content = (
              <div
                className={`flex flex-col items-center justify-center py-2 ${active ? "text-teal-700" : "text-gray-700"}`}
                suppressHydrationWarning
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {tab.icon}
                </svg>
                <span className="mt-0.5 text-[11px] leading-none">{tab.label}</span>
              </div>
            );

            if (tab.key === "cart") {
              return (
                <li key={tab.key} className="relative" suppressHydrationWarning>
                  <button type="button" onClick={() => open()} className="w-full">
                    {content}
                  </button>
                  {items.length > 0 && (
                    <span
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-3 ml-4 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white"
                      suppressHydrationWarning
                    >
                      {items.length > 99 ? "99+" : items.length}
                    </span>
                  )}
                </li>
              );
            }

            if (tab.key === "categories") {
              /** Square gradient CTA — no shadows (flat). */
              const categoriesContent = (
                <div
                  className={`relative flex flex-col items-center justify-center rounded-none px-2.5 py-2 transition-colors duration-200 ${
                    categoriesOpen
                      ? "bg-gradient-to-br from-teal-700 via-teal-800 to-emerald-900 text-white ring-2 ring-teal-300/90"
                      : "bg-gradient-to-br from-teal-500 via-teal-600 to-emerald-700 text-white ring-2 ring-white/95"
                  }`}
                  suppressHydrationWarning
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-6 w-6 text-white"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.35}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    {tab.icon}
                  </svg>
                  <span className="mt-0.5 max-w-[5rem] truncate text-center text-[11px] font-bold leading-none tracking-tight text-white">
                    {tab.label}
                  </span>
                </div>
              );
              return (
                <li
                  key={tab.key}
                  className="relative flex items-center justify-center pb-0.5 pt-0.5"
                  suppressHydrationWarning
                >
                  <button
                    type="button"
                    onClick={() => setCategoriesOpen(true)}
                    className="relative block w-full max-w-[6rem] transition-transform duration-150 ease-out active:scale-[0.94] motion-safe:hover:scale-[1.04] motion-safe:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                    aria-expanded={categoriesOpen}
                    aria-haspopup="dialog"
                  >
                    {categoriesContent}
                  </button>
                </li>
              );
            }

            return (
              <li key={tab.key} suppressHydrationWarning>
                <Link href={tabHref} className="block w-full">
                  {content}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      <AllCategoriesDrawer open={categoriesOpen} onOpenChange={setCategoriesOpen} hideTrigger />
    </nav>
  );
}
