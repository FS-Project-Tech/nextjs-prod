"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  Building2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Star,
  Trash2,
} from "lucide-react";
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

function addressInitials(address: Address): string {
  const a = String(address.first_name ?? "").trim().charAt(0);
  const b = String(address.last_name ?? "").trim().charAt(0);
  const pair = `${a}${b}`.toUpperCase();
  return pair || "?";
}

export default function DashboardAddresses() {
  const { user, loading: userLoading, sessionStatus } = useUser();
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
    <div className="space-y-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Your account</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Address book</h1>
          <p className="mt-2 text-base leading-relaxed text-slate-600">
            Saved billing and shipping profiles for checkout. Use the{" "}
            <span className="font-medium text-slate-800">Orders</span> control on a profile to see order
            history for that contact name.
          </p>
        </div>
        {!showAddForm && !editingAddress && (
          <div className="flex flex-shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => {
                setAddType("billing");
                setShowAddForm(true);
              }}
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Add billing address
            </button>
            <button
              type="button"
              onClick={() => {
                setAddType("shipping");
                setShowAddForm(true);
              }}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            >
              Add shipping address
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
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Add new address</h2>
          <p className="mb-4 text-sm text-slate-600">Details are used at checkout and on invoices.</p>
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
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Edit address</h2>
          <p className="mb-4 text-sm text-slate-600">Update this profile for checkout and documents.</p>
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
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Add billing address
            </button>
            <button
              type="button"
              onClick={() => {
                setAddType("shipping");
                setShowAddForm(true);
              }}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              Add shipping address
            </button>
            </div>
          </div>
        </div>
      )}

      {addresses.length > 0 && !showAddForm && !editingAddress && (
        <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {addresses.map((address) => {
            const isDefault = address.id === "default-billing" || address.id === "default-shipping";
            const hasId = Boolean(address.id);
            const canSetDefaultBilling =
              address.type === "billing" && address.id !== "default-billing" && hasId;
            const canSetDefaultShipping =
              address.type === "shipping" && address.id !== "default-shipping" && hasId;
            const fnTrim = String(address.first_name ?? "").trim();
            const lnTrim = String(address.last_name ?? "").trim();
            const fullName = [fnTrim, lnTrim].filter(Boolean).join(" ");
            const ordersByNameHref =
              fnTrim && lnTrim
                ? `/dashboard/orders?first_name=${encodeURIComponent(fnTrim)}&last_name=${encodeURIComponent(lnTrim)}`
                : null;
            const labelTrim = String(address.label ?? "").trim();
            const cardTitle = labelTrim || fullName || "Saved address";
            const showNameSubtitle = Boolean(labelTrim && fullName && labelTrim !== fullName);
            const busy = isUpdating || isDeleting || isSettingDefault;

            return (
              <article
                key={String(address.id)}
                className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/5 transition hover:border-teal-200/90 hover:shadow-md"
              >
                <div
                  className="h-1.5 w-full shrink-0 bg-gradient-to-r from-teal-500 via-teal-600 to-cyan-500"
                  aria-hidden
                />
                <div className="flex flex-1 flex-col p-5 sm:p-6">
                  <div className="flex gap-3 sm:gap-4">
                    <div
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 text-base font-bold text-slate-700 shadow-inner"
                      aria-hidden
                    >
                      {addressInitials(address)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="min-w-0 flex-1 break-words text-lg font-semibold leading-snug text-slate-900">
                          {cardTitle}
                        </h2>
                        {hasId ? (
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingAddress(address)}
                              disabled={busy}
                              title="Edit"
                              aria-label="Edit this address"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Pencil className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(address.id!)}
                              disabled={busy}
                              title={isDefault ? "Remove default" : "Delete"}
                              aria-label={
                                isDefault
                                  ? "Remove this address as default for checkout"
                                  : "Delete this saved address"
                              }
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-800 transition hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            address.type === "billing"
                              ? "bg-blue-100 text-blue-900"
                              : "bg-emerald-100 text-emerald-900"
                          }`}
                        >
                          {address.type === "billing" ? "Billing" : "Shipping"}
                        </span>
                        {isDefault ? (
                          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-900">
                            <Star className="h-3 w-3 text-teal-800" aria-hidden />
                            Default
                          </span>
                        ) : address.type === "billing" ? (
                          <span className="text-xs font-medium text-slate-500">Saved</span>
                        ) : null}
                      </div>
                      {showNameSubtitle ? (
                        <p className="mt-1 text-sm font-medium text-slate-600">{fullName}</p>
                      ) : !labelTrim && fullName ? (
                        <p className="mt-1 text-sm text-slate-500">Contact on file</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-1 flex-col rounded-xl border border-slate-100 bg-slate-50/90 px-4 py-3.5">
                    <div className="flex gap-2 text-sm text-slate-700">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                      <div className="min-w-0 space-y-1">
                        {fullName ? (
                          <p className="font-medium text-slate-900">{fullName}</p>
                        ) : null}
                        {address.company != null && String(address.company).trim() !== "" && (
                          <p className="flex items-start gap-1.5 text-slate-600">
                            <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                            <span>{String(address.company).trim()}</span>
                          </p>
                        )}
                        <p>{address.address_1}</p>
                        {address.address_2 ? <p>{address.address_2}</p> : null}
                        <p>
                          {address.city}, {address.state} {address.postcode}
                        </p>
                        <p className="text-slate-600">{address.country}</p>
                      </div>
                    </div>
                    {(address.phone || address.email) && (
                      <div className="mt-3 flex flex-col gap-1.5 border-t border-slate-200/80 pt-3 text-sm text-slate-600">
                        {address.phone ? (
                          <p className="flex items-center gap-2">
                            <Phone className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                            <span>{address.phone}</span>
                          </p>
                        ) : null}
                        {address.email ? (
                          <p className="flex min-w-0 items-center gap-2">
                            <Mail className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                            <span className="truncate">{address.email}</span>
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>

                  {hasId ? (
                    <div className="mt-5 min-w-0 space-y-2">
                      {!ordersByNameHref ? (
                        <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-[11px] leading-snug text-slate-600">
                          Add first and last name to link orders.
                        </p>
                      ) : null}
                      <div
                        role="toolbar"
                        aria-label="More address actions"
                        className="flex flex-wrap items-center gap-2"
                      >
                        {ordersByNameHref ? (
                          <Link
                            href={ordersByNameHref}
                            aria-label={`View orders for ${fullName || "this contact"}`}
                            className="inline-flex min-h-8 items-center justify-center rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-900 shadow-sm transition hover:bg-teal-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1"
                          >
                            View Orders
                          </Link>
                        ) : null}
                        {(canSetDefaultBilling || canSetDefaultShipping) && (
                          <button
                            type="button"
                            onClick={() => handleSetDefaultAddress(address)}
                            disabled={busy}
                            aria-label={
                              address.type === "shipping"
                                ? "Set as default shipping address"
                                : "Set as default billing address"
                            }
                            className="inline-flex min-h-8 items-center justify-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Set as Default
                          </button>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
