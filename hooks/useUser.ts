"use client";

import { useSession, signOut } from "next-auth/react";

export function useUser() {
  const { data: session, status } = useSession();
  const user = session?.user ?? null;

  return {
    user,
    loading: status === "loading",
    logout: async () => {
      await signOut({ callbackUrl: "/login" });
    },
    refresh: () => {},
    isAuthenticated: !!user,
  };
}
