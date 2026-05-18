import "server-only";

import type { CheckoutActor, CheckoutAddress, CheckoutInitiatePayload } from "@/types/checkout";
import {
  hasSubstantiveHcpRecord,
  hasSubstantiveNdisRecord,
  normalizeNdisFundingType,
} from "@/lib/checkout/ndisHcpPayload";
import { normalizeCountryCode } from "@/lib/checkout/normalizeCountry";
import {
  isSubstantiveAddressFields,
  listSavedAddressBookEntries,
  persistCustomerAddress,
  savedAddressBookHasFingerprint,
} from "@/lib/addresses-server";
import { addressFingerprint } from "@/lib/wc-primary-addresses";

function trimOrEmpty(v: unknown, max = 500): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function parseInfoJson(raw: string | undefined): Record<string, unknown> {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function checkoutBlockToPersist(
  type: "billing" | "shipping",
  block: CheckoutAddress,
  extras?: Record<string, unknown>
): Record<string, unknown> {
  const first = trimOrEmpty(block.first_name, 120);
  const last = trimOrEmpty(block.last_name, 120);
  const name = [first, last].filter(Boolean).join(" ").trim();
  const label =
    name.length > 0
      ? `${name} (${type === "billing" ? "billing" : "shipping"})`
      : type === "billing"
        ? "Billing"
        : "Shipping";

  return {
    type,
    label,
    first_name: first,
    last_name: last,
    company: trimOrEmpty(block.company, 200),
    address_1: trimOrEmpty(block.address_1, 200),
    address_2: trimOrEmpty(block.address_2, 200),
    city: trimOrEmpty(block.city, 120),
    state: trimOrEmpty(block.state, 80),
    postcode: trimOrEmpty(block.postcode, 32),
    country: normalizeCountryCode(block.country || "AU"),
    email: trimOrEmpty(block.email, 180),
    phone: trimOrEmpty(block.phone, 64),
    ...extras,
  };
}

function ndisHcpExtrasFromPayload(payload: CheckoutInitiatePayload): Record<string, unknown> {
  const ndisInfo = parseInfoJson(payload.ndis_info);
  const hcpInfo = parseInfoJson(payload.hcp_info);
  const extras: Record<string, unknown> = {};

  if (hasSubstantiveNdisRecord(ndisInfo)) {
    extras.ndis_participant_name = trimOrEmpty(ndisInfo.participant_name, 180);
    extras.ndis_number = trimOrEmpty(ndisInfo.number, 120);
    extras.ndis_dob = trimOrEmpty(ndisInfo.dob, 40);
    extras.ndis_funding_type = trimOrEmpty(
      payload.ndis_type ?? ndisInfo.funding_type,
      80
    );
    const funding = normalizeNdisFundingType(extras.ndis_funding_type);
    if (funding) extras.ndis_funding_type = funding;
    else delete extras.ndis_funding_type;
    extras.ndis_invoice_email = trimOrEmpty(ndisInfo.invoice_email, 180);
    extras.ndis_approval = Boolean(ndisInfo.approval);
  }

  if (hasSubstantiveHcpRecord(hcpInfo)) {
    extras.hcp_participant_name = trimOrEmpty(hcpInfo.participant_name, 180);
    extras.hcp_number = trimOrEmpty(hcpInfo.number, 120);
    extras.hcp_provider_email = trimOrEmpty(hcpInfo.provider_email, 180);
    extras.hcp_approval = Boolean(hcpInfo.approval);
  }

  return extras;
}

/**
 * After checkout, persist billing/shipping into the saved address book when no matching
 * address-book row exists yet (Woo primaries alone do not count).
 */
export async function syncCheckoutAddressesToAddressBook(
  actor: CheckoutActor,
  payload: CheckoutInitiatePayload,
  wpToken: string | null | undefined
): Promise<void> {
  if (!actor.authenticated || !actor.userId || actor.userId <= 0) return;

  const fileStoreKey = String(actor.userId);
  const token = typeof wpToken === "string" ? wpToken.trim() : "";

  const existing = await listSavedAddressBookEntries(token, fileStoreKey);
  const ndisHcp = ndisHcpExtrasFromPayload(payload);

  const billingBody = checkoutBlockToPersist("billing", payload.billing, ndisHcp);
  const shippingBody = checkoutBlockToPersist("shipping", payload.shipping);

  const candidates: Array<Record<string, unknown>> = [];

  if (isSubstantiveAddressFields(billingBody)) {
    candidates.push(billingBody);
  }
  if (isSubstantiveAddressFields(shippingBody)) {
    const billingFp = addressFingerprint({ ...billingBody, type: "billing" });
    const shippingFp = addressFingerprint({ ...shippingBody, type: "shipping" });
    if (shippingFp !== billingFp) {
      candidates.push(shippingBody);
    }
  }

  for (const body of candidates) {
    const type = body.type === "shipping" ? "shipping" : "billing";
    if (savedAddressBookHasFingerprint(existing, type, body)) continue;

    const result = await persistCustomerAddress({
      wpToken: token,
      fileStoreKey,
      rawBody: body,
    });
    if (result.ok) {
      existing.push({ ...body, id: result.id });
    }
  }
}
