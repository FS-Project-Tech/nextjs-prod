"use client";

import { SessionProvider } from "next-auth/react";
import { AuthProvider } from "@/contexts/AuthContext";
import QueryProvider from "@/components/QueryProvider";
import dynamic from "next/dynamic";

const AnalyticsInitializer = dynamic(() => import("@/components/AnalyticsInitializer"), {
  ssr: false,
});

export default function CoreProviders({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
      <AuthProvider>
        <QueryProvider>
          <AnalyticsInitializer />
          {children}
        </QueryProvider>
      </AuthProvider>
    </SessionProvider>
  );
}
