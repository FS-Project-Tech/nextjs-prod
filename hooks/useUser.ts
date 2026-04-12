"use client";

import { useSession, signOut } from "next-auth/react";

export function useUser() {
  const { data: session, status } = useSession();
  const user = session?.user ?? null;

  return {
    user,
    loading: status === "loading",
    /** `"unauthenticated"` | `"authenticated"` | `"loading"` — use for guest-only UI (e.g. on-account gate). */
    sessionStatus: status,
    logout: async () => {
      await signOut({ callbackUrl: "/login" });
    },
    refresh: () => {},
    isAuthenticated: !!user,
  };
}
