"use client";

import type { UnifiedCategoriesPayload } from "@/lib/categories-unified";

/** One browser session fetch shared by drawer + all-categories page. */
let sessionPayload: UnifiedCategoriesPayload | null = null;
let sessionInflight: Promise<UnifiedCategoriesPayload> | null = null;

export async function fetchUnifiedCategoriesClient(
  init?: RequestInit
): Promise<UnifiedCategoriesPayload> {
  if (sessionPayload) return sessionPayload;
  if (sessionInflight) return sessionInflight;

  sessionInflight = (async () => {
    const res = await fetch("/api/categories", {
      cache: "force-cache",
      ...init,
    });
    if (!res.ok) {
      throw new Error("Failed to load categories");
    }
    const data = (await res.json()) as UnifiedCategoriesPayload;
    if (!Array.isArray(data.categories)) {
      throw new Error("Invalid categories response");
    }
    sessionPayload = data;
    return data;
  })();

  try {
    return await sessionInflight;
  } finally {
    sessionInflight = null;
  }
}
