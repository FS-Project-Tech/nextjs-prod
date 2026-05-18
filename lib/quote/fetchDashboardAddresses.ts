import type { Address } from "@/hooks/useAddresses";

/** Loads saved addresses without React Query (safe on shop routes without QueryClientProvider). */
export async function fetchDashboardAddresses(): Promise<Address[]> {
  try {
    const res = await fetch("/api/dashboard/addresses", {
      credentials: "include",
      cache: "no-store",
      headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { addresses?: Address[] };
    return Array.isArray(data.addresses) ? data.addresses : [];
  } catch {
    return [];
  }
}
