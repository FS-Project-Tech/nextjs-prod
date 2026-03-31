"use client";

import { useEffect, useState } from "react";

export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const validate = async () => {
      try {
        const res = await fetch("/api/auth/validate", {
          credentials: "include",
        });

        if (res.status === 401) {
          setUser(null);
          return;
        }

        if (!res.ok) return;

        const data = await res.json();
        setUser(data.user || null);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    validate();
  }, []);

  return { user, loading };
}