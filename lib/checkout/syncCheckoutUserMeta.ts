import wcAPI from "@/lib/woocommerce";
import type { CheckoutActor, CheckoutInitiatePayload } from "@/types/checkout";

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

function yesNo(v: boolean | undefined): "yes" | "no" {
  return v ? "yes" : "no";
}

export async function syncCheckoutUserMeta(
  actor: CheckoutActor,
  payload: CheckoutInitiatePayload,
): Promise<void> {
  if (!actor.authenticated || !actor.userId || actor.userId <= 0) return;

  const ndisInfo = parseInfoJson(payload.ndis_info);
  const hcpInfo = parseInfoJson(payload.hcp_info);

  const meta_data: Array<{ key: string; value: unknown }> = [
    { key: "cust_woo_ndis_number", value: trimOrEmpty(ndisInfo.number, 120) },
    { key: "cust_woo_ndis_participant_name", value: trimOrEmpty(ndisInfo.participant_name, 180) },
    { key: "cust_woo_ndis_dob", value: trimOrEmpty(ndisInfo.dob, 40) },
    {
      key: "cust_woo_ndis_funding_type",
      value: trimOrEmpty(payload.ndis_type ?? ndisInfo.funding_type, 80),
    },
    { key: "cust_woo_invoice_email", value: trimOrEmpty(ndisInfo.invoice_email, 180) },
    { key: "cust_woo_ndis_approval", value: yesNo(Boolean(ndisInfo.approval)) },
    {
      key: "cust_woo_hcp_participant_name",
      value: trimOrEmpty(hcpInfo.participant_name, 180),
    },
    { key: "cust_woo_hcp_number", value: trimOrEmpty(hcpInfo.number, 120) },
    { key: "cust_woo_provider_email", value: trimOrEmpty(hcpInfo.provider_email, 180) },
    { key: "cust_woo_hcp_approval", value: yesNo(Boolean(hcpInfo.approval)) },
    { key: "delivery_authority", value: trimOrEmpty(payload.delivery_authority, 120) },
    { key: "no_paperwork", value: yesNo(payload.no_paperwork === true) },
    { key: "discreet_packaging", value: yesNo(payload.discreet_packaging === true) },
    { key: "newsletter", value: yesNo(payload.newsletter === true) },
    { key: "delivery_notes", value: trimOrEmpty(payload.delivery_notes, 2000) },
    { key: "insurance_option", value: payload.insurance_option === "yes" ? "yes" : "no" },
  ];

  const sanitizedMeta = meta_data.filter((m) => m.value !== "");

  await wcAPI.put(`/customers/${actor.userId}`, {
    billing: payload.billing,
    shipping: payload.shipping,
    meta_data: sanitizedMeta,
  });
}

