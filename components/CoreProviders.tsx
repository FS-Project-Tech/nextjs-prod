"use client";

import { SessionProvider } from "next-auth/react";
import { AuthProvider } from "@/contexts/AuthContext";

/**
 * React Query is NOT mounted globally — it lives only under:
 * `app/dashboard/layout`, `app/my-account/layout`, `app/checkout/layout`
 * so shop/home/product bundles exclude `@tanstack/react-query`.
 */
export default function CoreProviders({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
      <AuthProvider>{children}</AuthProvider>
    </SessionProvider>
  );
}
