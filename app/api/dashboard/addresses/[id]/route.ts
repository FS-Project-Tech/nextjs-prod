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
import { getCustomerData } from "@/lib/customer";
import wcAPI from "@/lib/woocommerce";
import { WC_PRIMARY_BILLING_ID, WC_PRIMARY_SHIPPING_ID } from "@/lib/wc-primary-addresses";

function wcCustomerUpdateErrorMessage(error: unknown): string {
  const r = error as { response?: { data?: { message?: unknown } } };
  const m = r.response?.data?.message;
  return typeof m === "string" && m.trim() ? m : "Failed to clear address in WooCommerce";
}

/** WooCommerce often rejects all-empty billing/shipping (invalid email/country). Keep account email + country. */
function buildWcClearedAddressBlock(
  field: "billing" | "shipping",
  customer: Record<string, unknown>,
  accountEmail: string
): Record<string, string> {
  const prev = (customer[field] as Record<string, unknown> | undefined) ?? {};
  const str = (v: unknown) => (v != null ? String(v).trim() : "");
  const prevCountry = str(prev.country);
  const prevEmail = str(prev.email);
  const email = prevEmail || accountEmail || "";
  return {
    first_name: "",
    last_name: "",
    company: "",
    address_1: "",
    address_2: "",
    city: "",
    state: "",
    postcode: "",
    country: prevCountry || "AU",
    email,
    phone: "",
  };
}

async function getWpUserId(token: string): Promise<string | null> {
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

/** joya_ha WordPress usermeta ids are 12 hex chars; REST meta keys are always lowercase. */
function wpBookAddressIdForRestPath(id: string): string {
  const t = id.trim();
  if (/^[a-fA-F0-9]{12}$/.test(t)) return t.toLowerCase();
  return id;
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

    const userId = await getWpUserId(token);
    const fileStoreKey =
      userId != null && String(userId).trim() !== ""
        ? String(userId)
        : (nextAuthToken as any)?.sub != null
          ? String((nextAuthToken as any).sub)
          : "";

    /** WooCommerce default billing/shipping on the customer record (WP admin + checkout). */
    const isWcPrimary =
      addressId === WC_PRIMARY_BILLING_ID || addressId === WC_PRIMARY_SHIPPING_ID;
    if (isWcPrimary) {
      const userResponse = await fetch(`${wpBase}/wp-json/wp/v2/users/me`, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        cache: "no-store",
      });
      if (!userResponse.ok) {
        return NextResponse.json({ error: "Failed to load user" }, { status: 401, ...noStore });
      }
      const wpUser = await userResponse.json();
      const email = wpUser?.email != null ? String(wpUser.email) : "";
      if (!email) {
        return NextResponse.json({ error: "No email for account" }, { status: 400, ...noStore });
      }
      const customer = await getCustomerData(email, token);
      const cid = customer?.id != null ? Number(customer.id) : NaN;
      if (!customer || !Number.isFinite(cid) || cid <= 0) {
        return NextResponse.json(
          { error: "WooCommerce customer not found" },
          { status: 404, ...noStore }
        );
      }
      const field = addressId === WC_PRIMARY_BILLING_ID ? "billing" : "shipping";
      const prev = { ...(customer[field] || {}) } as Record<string, unknown>;
      const wcKeys = [
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
      ] as const;
      for (const k of wcKeys) {
        if (Object.prototype.hasOwnProperty.call(normalizedBody, k)) {
          prev[k] = normalizedBody[k] ?? "";
        }
      }
      try {
        await wcAPI.put(`/customers/${cid}`, { [field]: prev });
      } catch (e: unknown) {
        console.error("[addresses] WC primary update failed:", e);
        return NextResponse.json(
          { error: "Failed to update address in WooCommerce" },
          { status: 502, ...noStore }
        );
      }
      const label = addressId === WC_PRIMARY_BILLING_ID ? "Primary billing" : "Primary shipping";
      const addrOut = {
        ...prev,
        type: field === "billing" ? "billing" : "shipping",
        label,
      };
      return NextResponse.json(
        {
          address: normalizeAddressFromWp(addrOut as Record<string, unknown>, addressId),
          message: "Address updated successfully",
        },
        { status: 200, ...noStore }
      );
    }

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

    const bookPathId = wpBookAddressIdForRestPath(addressId);
    const updateResponse = await fetch(`${wpBase}/wp-json/customers/v1/addresses/${encodeURIComponent(bookPathId)}`, {
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

    const userId = await getWpUserId(token);
    const fileStoreKey =
      userId != null && String(userId).trim() !== ""
        ? String(userId)
        : (nextAuthToken as any)?.sub != null
          ? String((nextAuthToken as any).sub)
          : "";

    /** Clear WooCommerce primary billing/shipping (virtual “default-*” card) — not a saved joya_ha row */
    const isWcPrimaryDelete =
      addressId === WC_PRIMARY_BILLING_ID || addressId === WC_PRIMARY_SHIPPING_ID;
    if (isWcPrimaryDelete) {
      const userResponse = await fetch(`${wpBase}/wp-json/wp/v2/users/me`, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        cache: "no-store",
      });
      if (!userResponse.ok) {
        return NextResponse.json({ error: "Failed to load user" }, { status: 401 });
      }
      const wpUser = await userResponse.json();
      const email = wpUser?.email != null ? String(wpUser.email) : "";
      if (!email) {
        return NextResponse.json({ error: "No email for account" }, { status: 400 });
      }
      const customer = await getCustomerData(email, token);
      const cid = customer?.id != null ? Number(customer.id) : NaN;
      if (!customer || !Number.isFinite(cid) || cid <= 0) {
        return NextResponse.json({ error: "WooCommerce customer not found" }, { status: 404 });
      }
      const field = addressId === WC_PRIMARY_BILLING_ID ? "billing" : "shipping";
      const cleared = buildWcClearedAddressBlock(
        field,
        customer as Record<string, unknown>,
        email
      );
      try {
        await wcAPI.put(`/customers/${cid}`, { [field]: cleared });
      } catch (e: unknown) {
        console.error("[addresses] WC primary clear failed:", e);
        /** Retry with Woo customer.email — some APIs reject until billing.email matches account */
        const custEmail = String((customer as { email?: string }).email ?? "").trim() || email;
        const retryBlock = {
          ...cleared,
          email: custEmail,
          country: cleared.country || "AU",
        };
        try {
          await wcAPI.put(`/customers/${cid}`, { [field]: retryBlock });
        } catch (e2: unknown) {
          console.error("[addresses] WC primary clear retry failed:", e2);
          return NextResponse.json(
            { error: wcCustomerUpdateErrorMessage(e2) },
            { status: 502 }
          );
        }
      }
      await fetch(`${wpBase}/wp-json/customers/v1/addresses/clear-primary`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: field }),
        cache: "no-store",
      }).catch(() => {});

      return NextResponse.json(
        { message: "Default address removed from checkout" },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

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
          /** POST had upserted billing2/shipping2 into file — remove so GET merge doesn’t resurrect it */
          const removedFromStore = deleteMemoryAddress(fileStoreKey, addressId);
          if (!removedFromStore) {
            addDeletedId(fileStoreKey, addressId);
          }
        }

        return NextResponse.json(
          { message: (result as { message?: string }).message || "Address deleted successfully" },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
    }

    const deleteBookId = wpBookAddressIdForRestPath(addressId);
    const deleteResponse = await fetch(
      `${wpBase}/wp-json/customers/v1/addresses/${encodeURIComponent(deleteBookId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        cache: "no-store",
      }
    );

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

    const result = (await deleteResponse.json().catch(() => ({}))) as { message?: string };

    if (fileStoreKey) {
      /** Remove from file/memory fallback (POST had upserted this id). Survives multi-instance where tombstone file might not be shared. */
      const removedFromStore = deleteMemoryAddress(fileStoreKey, addressId);
      if (!removedFromStore) {
        addDeletedId(fileStoreKey, addressId);
      }
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
