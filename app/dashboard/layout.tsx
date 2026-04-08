"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";

// Icon component for tabs
const TabIcon = ({ iconId, className = "h-5 w-5" }: { iconId: string; className?: string }) => {
  const iconColor = "#0f766e";

  const icons: Record<string, React.ReactElement> = {
    overview: (
      <svg className={className} fill="none" stroke={iconColor} viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
    orders: (
      <svg className={className} fill="none" stroke={iconColor} viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
        />
      </svg>
    ),
    addresses: (
      <svg className={className} fill="none" stroke={iconColor} viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
    wishlist: (
      <svg className={className} fill={iconColor} viewBox="0 0 24 24">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    ),
    quotes: (
      <svg className={className} fill="none" stroke={iconColor} viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
    settings: (
      <svg className={className} fill="none" stroke={iconColor} viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  };

  return icons[iconId] || null;
};

const tabs = [
  { id: "overview", label: "Overview", href: "/dashboard", iconId: "overview" },
  // { id: "orders", label: "Orders", href: "/dashboard/orders", iconId: "orders" },
  { id: "wishlist", label: "Wishlist", href: "/dashboard/wishlist", iconId: "wishlist" },
  { id: "addresses", label: "Addresses", href: "/dashboard/addresses", iconId: "addresses" },
  // { id: 'quotes', label: 'Quotes', href: '/dashboard/quotes', iconId: 'quotes' },
  { id: "settings", label: "My Account", href: "/dashboard/settings", iconId: "settings" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!mounted) return;

    // Allow wishlist without login
    if (!user && pathname !== "/dashboard/wishlist") {
      router.replace("/login");
    }
  }, [mounted, user, pathname, router]);

  if (!mounted) return null;

  if (!user && pathname !== "/dashboard/wishlist") {
    return null;
  }

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      await logout();
      router.push("/login");
    }
  };

  const activeTab =
    tabs.find(
      (tab) => pathname === tab.href || (tab.href !== "/dashboard" && pathname.startsWith(tab.href))
    ) || tabs[0];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile header */}
      <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-md text-gray-600 hover:bg-gray-100"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } lg:translate-x-0 fixed lg:sticky lg:top-0 inset-y-0 left-0 z-40 lg:z-30 w-64 bg-white border-r border-gray-200 transition-transform duration-200 ease-in-out lg:transition-none h-screen overflow-y-auto`}
        >
          <div className="h-full flex flex-col">
            {/* User info */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-full bg-teal-600 flex items-center justify-center text-white font-semibold">
                  {mounted && user?.name ? user.name.charAt(0).toUpperCase() : "U"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {mounted && user?.name ? user.name : "User"}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {mounted && user?.email ? user.email : ""}
                  </p>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
              {tabs.map((tab) => {
                const isActive = activeTab.id === tab.id;
                return (
                  <Link
                    key={tab.id}
                    href={tab.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? "bg-teal-50 text-teal-700" : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <TabIcon iconId={tab.iconId} />
                    <span>{tab.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Logout */}
            <div className="p-4 border-t border-gray-200">
              <button
                onClick={handleLogout}
                className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 lg:ml-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
