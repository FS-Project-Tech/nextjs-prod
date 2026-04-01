"use client";

import { useSession } from "next-auth/react";

/** Login entry when the header has no NextAuth user (parent handles loading / authenticated UI). */
export default function HeaderUser() {
  const { status } = useSession();

  if (status === "loading") return null;

  return (
    <div>
      <a href="/login">Login</a>
    </div>
  );
}
