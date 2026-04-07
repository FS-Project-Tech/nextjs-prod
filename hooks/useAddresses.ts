//D:\nextjs\hooks\useAddresses.ts

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Note: address deletions are now persisted server-side (in WordPress and the
// fallback file store via addresses-memory-store). We no longer filter by a
// per-browser localStorage deleted list so deletions are consistent across
// browsers/devices for the same user. The clearAddressesDeletedIds helper is
// kept as a no-op so existing calls from AuthContext remain safe.

export function clearAddressesDeletedIds(): void {
  // no-op – server-side deletedIds are used instead of localStorage
}

export interface Address {
  id?: string;
  type: "billing" | "shipping";
  label?: string;
  first_name: string;
  last_name: string;
  company?: string;
  address_1: string;
  address_2?: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  email?: string;
  phone?: string;
  // NDIS / HCP (optional; saved with address when present)
  ndis_participant_name?: string;
  ndis_number?: string;
  ndis_dob?: string;
  ndis_funding_type?: string;
  ndis_approval?: boolean;
  ndis_invoice_email?: string;
  hcp_participant_name?: string;
  hcp_number?: string;
  hcp_provider_email?: string;
  hcp_approval?: boolean;
}

interface UseAddressesOptions {
  /** When false, the query does not run. Set to true only after session/user is ready so refresh doesn't get 401. */
  enabled?: boolean;
}

interface UseAddressesResult {
  addresses: Address[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
  addAddress: (address: Omit<Address, "id">) => Promise<void>;
  updateAddress: (id: string, address: Partial<Address>) => Promise<void>;
  deleteAddress: (id: string) => Promise<void>;
  /** Copies this row into WooCommerce billing or shipping (checkout + wp-admin). */
  setDefaultAddress: (address: Address) => Promise<void>;
  /** @deprecated use setDefaultAddress */
  setDefaultBilling: (address: Address) => Promise<void>;
  isAdding: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  isSettingDefault: boolean;
}

export function useAddresses(options?: UseAddressesOptions): UseAddressesResult {
  const { enabled = true } = options ?? {};
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["addresses"],
    enabled,
    queryFn: async () => {
      const response = await fetch("/api/dashboard/addresses", {
        credentials: "include",
        cache: "no-store",
        headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch addresses");
      }

      const result = await response.json();
      const list = result.addresses || [];
      return list as Address[];
    },
    // Keep data fresh for 2 min so checkout/dashboard use cache after adding an address
    // instead of refetching and sometimes getting empty before WordPress is ready
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const addMutation = useMutation({
    mutationFn: async (address: Omit<Address, "id">) => {
      const response = await fetch("/api/dashboard/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(address),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to add address");
      }

      return response.json();
    },
    onSuccess: (data: { address?: Address; message?: string }) => {
      const newAddress = data?.address;
      if (newAddress && newAddress.id != null) {
        queryClient.setQueryData<Address[]>(["addresses"], (old) => {
          const list = old ?? [];
          const idStr = String(newAddress.id);
          const exists = list.some((a) => String(a.id) === idStr);
          if (exists) {
            return list.map((a) =>
              String(a.id) === idStr ? { ...newAddress, id: newAddress.id } : a
            );
          }
          return [...list, { ...newAddress, id: newAddress.id }];
        });
        // Do not invalidate here: refetch can run before WordPress has the new data
        // and overwrite the cache with an empty list. The new address is already in
        // the cache above; list will stay in sync on next natural refetch (e.g. revisit).
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, address }: { id: string; address: Partial<Address> }) => {
      const idStr = String(id);
      const response = await fetch(`/api/dashboard/addresses/${encodeURIComponent(idStr)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(address),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error((error as { error?: string }).error || "Failed to update address");
      }

      const result = await response.json();
      const updatedAddr = result.address as Address;
      return { id: idStr, updated: updatedAddr, result };
    },
    onSuccess: (data) => {
      const updated = data.updated as unknown as Record<string, unknown> | undefined;
      const idStr = String(data.id);
      if (updated) {
        queryClient.setQueryData<Address[]>(["addresses"], (old) => {
          if (!old) return old;
          return old.map((a) => {
            if (String(a.id) !== idStr) return a;
            const keys = [
              "type",
              "label",
              "first_name",
              "last_name",
              "company",
              "address_1",
              "address_2",
              "city",
              "state",
              "postcode",
              "country",
              "email",
              "phone",
              "ndis_participant_name",
              "ndis_number",
              "ndis_dob",
              "ndis_funding_type",
              "ndis_approval",
              "ndis_invoice_email",
              "hcp_participant_name",
              "hcp_number",
              "hcp_provider_email",
              "hcp_approval",
            ] as const;
            const merged = { ...a } as unknown as Record<string, unknown>;
            for (const key of keys) {
              if (Object.prototype.hasOwnProperty.call(updated, key)) {
                merged[key] = updated[key] ?? "";
              }
            }
            if (updated.id != null) merged.id = updated.id as string;
            return merged as unknown as Address;
          });
        });
      }
      // Do not invalidate: refetch can overwrite cache with stale/different data and make the address disappear
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (address: Address) => {
      const response = await fetch("/api/dashboard/addresses/set-default", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: address.type === "shipping" ? "shipping" : "billing",
          sourceAddressId: address.id != null ? String(address.id) : undefined,
          first_name: address.first_name,
          last_name: address.last_name,
          company: address.company ?? "",
          address_1: address.address_1,
          address_2: address.address_2 ?? "",
          city: address.city,
          state: address.state,
          postcode: address.postcode,
          country: address.country,
          email: address.email ?? "",
          phone: address.phone ?? "",
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const fallback =
          address.type === "shipping"
            ? "Failed to set default shipping"
            : "Failed to set default billing";
        throw new Error((err as { error?: string }).error || fallback);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/dashboard/addresses/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete address");
      }

      return response.json();
    },
    onSuccess: (_data, deletedId) => {
      const idStr = String(deletedId);
      queryClient.setQueryData<Address[]>(["addresses"], (old) =>
        old ? old.filter((a) => String(a.id) !== idStr) : old
      );
      // Invalidate so next refetch gets fresh data from API (prevents address reappearing after refresh)
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
    },
  });

  return {
    addresses: data || [],
    isLoading,
    error: error as Error | null,
    refetch: () => refetch(),
    addAddress: async (address) => {
      await addMutation.mutateAsync(address);
    },
    updateAddress: async (id, address) => {
      await updateMutation.mutateAsync({ id, address });
    },
    deleteAddress: async (id) => {
      await deleteMutation.mutateAsync(id);
    },
    setDefaultAddress: async (address) => {
      await setDefaultMutation.mutateAsync(address);
    },
    setDefaultBilling: async (address) => {
      await setDefaultMutation.mutateAsync(address);
    },
    isAdding: addMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isSettingDefault: setDefaultMutation.isPending,
  };
}
