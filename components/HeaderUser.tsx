"use client";

import { useAuth } from "@/hooks/useAuth";

export default function HeaderUser() {
  const { user, loading } = useAuth();

  if (loading) return null;

  return (
    <div>
      {user ? (
        <p>Welcome, {user.name}</p>
      ) : (
        <a href="/login">Login</a>
      )}
    </div>
  );
}