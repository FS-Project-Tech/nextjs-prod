import { NextRequest, NextResponse } from "next/server";
import { getWpBaseUrl } from "@/lib/auth";
import { getToken } from "next-auth/jwt";
import {
  updateAddress as updateMemoryAddress,
  deleteAddress as deleteMemoryAddress,
  upsertAddress,
  addDeletedId,
  removeDeletedId,
} from "@/lib/addresses-memory-store";
import { normalizeAddressFromWp } from "@/lib/addresses-normalize";

async function getUserId(token: string): Promise<string | null> {
  const wpBase = getWpBaseUrl();
  if (!wpBase) return null;
  const userResponse = await fetch(`${wpBase}/wp-json/wp/v2/users/me`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!userResponse.ok) return null;
  const user = await userResponse.json();
  return user?.id != null ? String(user.id) : (user?.slug ?? null);
}

const ADDRESS_KEYS = [
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

/** Normalize body to a flat object with only address fields so merge never misses a key */
function normalizePutBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  const o = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of ADDRESS_KEYS) {
    const v = o[key];
    out[key] = v === undefined || v === null ? "" : v;
  }
  return out;
}

/**
 * PUT /api/dashboard/addresses/[id]
 * Update an address
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const noStore = { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" as const } };
  try {
    const nextAuthToken = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    const token = (nextAuthToken as any)?.wpToken;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id: addressId } = await params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, ...noStore });
    }
    const normalizedBody = normalizePutBody(body);
    const wpBase = getWpBaseUrl();
    if (!wpBase) {
      return NextResponse.json({ error: "WordPress URL not configured" }, { status: 500 });
    }

    const userId = await getUserId(token);
    const fileStoreKey =
      userId != null && String(userId).trim() !== ""
        ? String(userId)
        : (nextAuthToken as any)?.sub != null
          ? String((nextAuthToken as any).sub)
          : "";
    // Treat as local address if id looks like our in-memory id (case-insensitive)
    const isLocalId = addressId.toLowerCase().startsWith("local-");
    if (isLocalId) {
      if (!fileStoreKey)
        return NextResponse.json({ error: "Failed to get user data" }, { status: 401 });
      let updated = updateMemoryAddress(fileStoreKey, addressId, normalizedBody);
      // If not found (e.g. server restarted), upsert so the edit still succeeds
      if (!updated) {
        updated = upsertAddress(fileStoreKey, addressId, normalizedBody);
      }
      removeDeletedId(fileStoreKey, addressId);
      const addr = (updated ?? {}) as Record<string, unknown>;
      return NextResponse.json(
        {
          address: normalizeAddressFromWp(addr, addressId),
          message: "Address updated successfully",
        },
        { status: 200, ...noStore }
      );
    }

    const isSecondaryId = addressId === "billing2" || addressId === "shipping2";
    if (isSecondaryId) {
      const secondaryPut = await fetch(
        `${wpBase}/wp-json/customers/v1/addresses-secondary/${addressId}`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(normalizedBody),
          cache: "no-store",
        }
      );
      if (secondaryPut.ok) {
        const result = await secondaryPut.json();
        const addr = (result.address ?? {}) as Record<string, unknown>;
        const normalized = normalizeAddressFromWp(addr, addressId);
        if (fileStoreKey) upsertAddress(fileStoreKey, addressId, addr);
        removeDeletedId(fileStoreKey, addressId);
        return NextResponse.json(
          {
            address: normalized,
            message: result.message || "Address updated successfully",
          },
          { status: 200, ...noStore }
        );
      }
    }

    const updateResponse = await fetch(`${wpBase}/wp-json/customers/v1/addresses/${addressId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(normalizedBody),
      cache: "no-store",
    });

    if (updateResponse.ok) {
      const result = await updateResponse.json();
      const addr = (result.address ?? {}) as Record<string, unknown>;
      if (fileStoreKey) upsertAddress(fileStoreKey, addressId, addr);
      removeDeletedId(fileStoreKey, addressId);
      return NextResponse.json(
        {
          address: normalizeAddressFromWp(addr, addressId),
          message: result.message || "Address updated successfully",
        },
        { status: 200, ...noStore }
      );
    }

    // WordPress endpoint missing or failed – save update in our memory store so edit still works
    if (!fileStoreKey)
      return NextResponse.json({ error: "Failed to get user data" }, { status: 401 });
    const updated = upsertAddress(fileStoreKey, addressId, normalizedBody);
    removeDeletedId(fileStoreKey, addressId);
    const addr = (updated ?? {}) as Record<string, unknown>;
    return NextResponse.json(
      {
        address: normalizeAddressFromWp(addr, addressId),
        message: "Address updated successfully",
      },
      { status: 200, ...noStore }
    );
  } catch (error) {
    console.error("Update address error:", error);
    return NextResponse.json(
      { error: "An error occurred while updating address" },
      { status: 500, ...noStore }
    );
  }
}

/**
 * DELETE /api/dashboard/addresses/[id]
 * Delete an address
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const nextAuthToken = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    const token = (nextAuthToken as any)?.wpToken;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id: addressId } = await params;
    const wpBase = getWpBaseUrl();
    if (!wpBase) {
      return NextResponse.json({ error: "WordPress URL not configured" }, { status: 500 });
    }

    const userId = await getUserId(token);
    const fileStoreKey =
      userId != null && String(userId).trim() !== ""
        ? String(userId)
        : (nextAuthToken as any)?.sub != null
          ? String((nextAuthToken as any).sub)
          : "";
    const isLocalId = addressId.toLowerCase().startsWith("local-");
    if (isLocalId) {
      if (!fileStoreKey)
        return NextResponse.json({ error: "Failed to get user data" }, { status: 401 });
      const removed = deleteMemoryAddress(fileStoreKey, addressId);
      if (!removed) addDeletedId(fileStoreKey, addressId);
      return NextResponse.json(
        { message: "Address deleted successfully" },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const isSecondaryId = addressId === "billing2" || addressId === "shipping2";
    if (isSecondaryId) {
      const secondaryDelete = await fetch(
        `${wpBase}/wp-json/customers/v1/addresses-secondary/${addressId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          cache: "no-store",
        }
      );
      if (secondaryDelete.ok) {
        const result = await secondaryDelete.json().catch(() => ({}));

        if (fileStoreKey) {
          addDeletedId(fileStoreKey, addressId);
        }

        return NextResponse.json(
          { message: (result as { message?: string }).message || "Address deleted successfully" },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
    }

    const deleteResponse = await fetch(`${wpBase}/wp-json/customers/v1/addresses/${addressId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!deleteResponse.ok) {
      if (deleteResponse.status === 404) {
        if (fileStoreKey) {
          deleteMemoryAddress(fileStoreKey, addressId);
          addDeletedId(fileStoreKey, addressId);
          return NextResponse.json(
            { message: "Address deleted successfully" },
            { headers: { "Cache-Control": "no-store" } }
          );
        }
      }
      let errorMessage = "Failed to delete address";
      try {
        const err = await deleteResponse.json();
        if (err?.error)
          errorMessage =
            typeof err.error === "string" ? err.error : err.error.message || errorMessage;
      } catch {
        // ignore
      }
      return NextResponse.json({ error: errorMessage }, { status: deleteResponse.status });
    }

    const result = await deleteResponse.json();

    if (fileStoreKey) {
      addDeletedId(fileStoreKey, addressId); // ⭐ IMPORTANT
    }

    return NextResponse.json(
      { message: result.message || "Address deleted successfully" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Delete address error:", error);
    return NextResponse.json(
      { error: "An error occurred while deleting address" },
      { status: 500 }
    );
  }
}
