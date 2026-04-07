"use client";

import { useState, useMemo, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useAddresses, type Address } from "@/hooks/useAddresses";
import { useToast } from "@/components/ToastProvider";
import AddressForm from "@/components/dashboard/AddressForm";
import { useUser } from "@/hooks/useUser";

const NDIS_HCP_ROLES_EXACT = [
  "ndis_approved",
  "NDIS Approved",
  "support_coordinator",
  "Support Co-ordinator",
  "Support Coordinator",
];

function hasNdisOrSupportCoordinatorRole(roles: string[] | undefined): boolean {
  if (!roles?.length) return false;
  return roles.some((r) => {
    const lower = String(r).toLowerCase();
    return (
      NDIS_HCP_ROLES_EXACT.includes(r) || lower.includes("ndis") || lower.includes("support co")
    );
  });
}

export default function DashboardAddresses() {
  const { data: session, status: sessionStatus } = useSession();
  const { user, loading: userLoading } = useUser();
  // Run addresses query when session is authenticated (not just !!user) so it runs reliably after refresh in regular mode
  const sessionReady = sessionStatus === "authenticated";
  const {
    addresses,
    isLoading,
    error,
    addAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
    isAdding,
    isUpdating,
    isDeleting,
    isSettingDefault,
    refetch,
  } = useAddresses({ enabled: sessionReady });
  const { success, error: showError } = useToast();
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addType, setAddType] = useState<"billing" | "shipping">("billing");

  // Refetch addresses when session becomes authenticated (e.g. after refresh) so the request runs with the cookie
  useEffect(() => {
    if (sessionStatus === "authenticated") {
      refetch();
    }
  }, [sessionStatus, refetch]);
  const showNdisHcp = useMemo(() => {
    if (hasNdisOrSupportCoordinatorRole(user?.roles)) return true;
    const email = user?.email ?? "";
    return String(email).toLowerCase().includes("ndis");
  }, [user?.roles, user?.email]);

  const handleAdd = async (payload: Omit<Address, "id">) => {
    try {
      await addAddress(payload);
      // Do not refetch here: the hook already adds the new address to the cache.
      // A refetch can return before WordPress has the new data and overwrite the list.
      success("Address added successfully");
      setShowAddForm(false);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to add address");
    }
  };

  const handleUpdate = async (id: string, payload: Partial<Address>) => {
    try {
      await updateAddress(id, payload);
      success("Address updated successfully");
      setEditingAddress(null);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to update address");
    }
  };

  const handleDelete = async (id: string) => {
    if (!id) return;
    const isPrimary = id === "default-billing" || id === "default-shipping";
    const msg = isPrimary
      ? "Remove this default address from checkout and wp-admin? Your saved address cards below are not deleted."
      : "Are you sure you want to delete this address?";
    if (!confirm(msg)) return;
    try {
      await deleteAddress(id);
      success("Address deleted successfully");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to delete address");
    }
  };

  const handleSetDefaultAddress = async (address: Address) => {
    try {
      await setDefaultAddress(address);
      success(
        address.type === "shipping"
          ? "Default shipping updated for checkout"
          : "Default billing updated for checkout"
      );
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to set default address");
    }
  };

  if (userLoading || isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
          <p className="mt-4 text-gray-600">{userLoading ? "Loading…" : "Loading addresses…"}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="font-medium text-red-800">Could not load addresses</p>
        <p className="mt-2 text-sm text-red-700">{error.message}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Addresses</h1>
          <p className="mt-1 text-gray-600">
            Manage multiple billing and shipping addresses. You can add as many addresses as you
            need.
          </p>
        </div>
        {!showAddForm && !editingAddress && (
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => {
                setAddType("billing");
                setShowAddForm(true);
              }}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Add Billing Address
            </button>
            <button
              type="button"
              onClick={() => {
                setAddType("shipping");
                setShowAddForm(true);
              }}
              className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700"
            >
              Add Shipping Address
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error.message}</p>
        </div>
      )}

      {showAddForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Add New Address</h2>
          <AddressForm
            key={`add-${addType}`}
            defaultType={addType}
            onSubmit={handleAdd}
            onCancel={() => setShowAddForm(false)}
            isLoading={isAdding}
            submitLabel="Add address"
            showNdisHcp={showNdisHcp}
          />
        </div>
      )}

      {editingAddress && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Edit Address</h2>
          <AddressForm
            key={`edit-${editingAddress.id ?? "new"}`}
            address={editingAddress}
            onSubmit={(payload) => {
              const id = editingAddress?.id != null ? String(editingAddress.id) : undefined;
              if (id) handleUpdate(id, payload);
            }}
            onCancel={() => setEditingAddress(null)}
            isLoading={isUpdating}
            submitLabel="Update address"
            showNdisHcp={showNdisHcp}
          />
        </div>
      )}

      {addresses.length === 0 && !showAddForm && !editingAddress && (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <span className="mb-4 text-5xl" aria-hidden>
              📍
            </span>
            <h3 className="text-lg font-semibold text-gray-900">No addresses yet</h3>
            <p className="mt-2 text-gray-600">Add your first address to get started.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setAddType("billing");
                  setShowAddForm(true);
                }}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Add Billing Address
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddType("shipping");
                  setShowAddForm(true);
                }}
                className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700"
              >
                Add Shipping Address
              </button>
            </div>
          </div>
        </div>
      )}

      {addresses.length > 0 && !showAddForm && !editingAddress && (
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {addresses.map((address) => {
            const isDefault = address.id === "default-billing" || address.id === "default-shipping";
            const hasId = Boolean(address.id);
            const canSetDefaultBilling =
              address.type === "billing" && address.id !== "default-billing" && hasId;
            const canSetDefaultShipping =
              address.type === "shipping" && address.id !== "default-shipping" && hasId;
            return (
              <div
                key={String(address.id)}
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md"
              >
                {address.label && (
                  <p className="mb-2 text-lg font-bold text-gray-900">{address.label}</p>
                )}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                        address.type === "billing"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-green-100 text-green-800"
                      }`}
                    >
                      {address.type === "billing" ? "Billing" : "Shipping"}
                    </span>
                    {isDefault && (
                      <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-800">
                        Default
                      </span>
                    )}
                    {!isDefault && address.type === "billing" && (
                      <span className="text-xs text-gray-500">Saved address</span>
                    )}
                  </div>
                  {hasId && (
                    <div className="flex flex-wrap items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setEditingAddress(address)}
                        disabled={isUpdating || isDeleting || isSettingDefault}
                        className="text-sm font-medium text-teal-600 hover:text-teal-700 disabled:opacity-50"
                      >
                        Edit
                      </button>
                      {(canSetDefaultBilling || canSetDefaultShipping) && (
                        <button
                          type="button"
                          onClick={() => handleSetDefaultAddress(address)}
                          disabled={isUpdating || isDeleting || isSettingDefault}
                          className="text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                        >
                          Set as Default
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(address.id!)}
                        disabled={isUpdating || isDeleting || isSettingDefault}
                        className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                      >
                        {isDefault ? "Remove default" : "Delete"}
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-4 space-y-1.5 text-sm">
                  <p className="font-medium text-gray-900">
                    {address.first_name} {address.last_name}
                  </p>
                  {address.company != null && String(address.company).trim() !== "" && (
                    <p className="text-gray-600">
                      <span className="text-gray-500">Company:</span> {address.company}
                    </p>
                  )}
                  <p className="text-gray-600">{address.address_1}</p>
                  {address.address_2 && <p className="text-gray-600">{address.address_2}</p>}
                  <p className="text-gray-600">
                    {address.city}, {address.state} {address.postcode}
                  </p>
                  <p className="text-gray-600">{address.country}</p>
                  {address.phone && <p className="text-gray-600">Phone: {address.phone}</p>}
                  {address.email && <p className="text-gray-600">Email: {address.email}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
