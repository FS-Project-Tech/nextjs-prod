import type { CheckoutInitiatePayload } from "@/types/checkout";

const PLEASE_CHOOSE = /^please\s*choose$/i;

function trimStr(v: unknown): string {
  return String(v ?? "").trim();
}

/** NDIS funding dropdown placeholder — do not send to Woo or treat as selected. */
export function normalizeNdisFundingType(raw: unknown): string | undefined {
  const t = trimStr(raw);
  if (!t || PLEASE_CHOOSE.test(t)) return undefined;
  return t;
}

export function hasSubstantiveNdisRecord(record: Record<string, unknown>): boolean {
  const digits = trimStr(record.number).replace(/\D/g, "");
  if (digits.length > 0) return true;
  if (trimStr(record.participant_name)) return true;
  if (trimStr(record.dob)) return true;
  if (trimStr(record.invoice_email)) return true;
  const ft = trimStr(record.funding_type).toLowerCase();
  if (ft && !PLEASE_CHOOSE.test(ft)) return true;
  return false;
}

export function hasSubstantiveHcpRecord(record: Record<string, unknown>): boolean {
  if (trimStr(record.number)) return true;
  if (trimStr(record.participant_name)) return true;
  if (trimStr(record.provider_email)) return true;
  return false;
}

function jsonInfoBlock(record: Record<string, unknown>): string | undefined {
  const entries = Object.entries(record).filter(
    ([, v]) => v !== undefined && v !== "" && v !== false && v !== null,
  );
  if (entries.length === 0) return undefined;
  try {
    return JSON.stringify(Object.fromEntries(entries));
  } catch {
    return undefined;
  }
}

/** Build `ndis_info` JSON only when at least one NDIS field is meaningfully filled (not approval-only). */
export function buildNdisInfoJsonFromForm(data: {
  cust_woo_ndis_number?: string | null;
  ndis_number?: string | null;
  cust_woo_ndis_participant_name?: string | null;
  ndis_participant_name?: string | null;
  cust_woo_ndis_dob?: string | null;
  ndis_dob?: string | null;
  cust_woo_ndis_funding_type?: string | null;
  ndis_funding_type?: string | null;
  cust_woo_invoice_email?: string | null;
  billing_ndis_invoice_email?: string | null;
  cust_woo_ndis_approval?: boolean | null;
  ndis_approval?: boolean | null;
}): string | undefined {
  const funding = normalizeNdisFundingType(
    data.cust_woo_ndis_funding_type ?? data.ndis_funding_type,
  );
  const record: Record<string, unknown> = {
    number: trimStr(data.cust_woo_ndis_number || data.ndis_number) || undefined,
    participant_name: trimStr(data.cust_woo_ndis_participant_name || data.ndis_participant_name) || undefined,
    dob: trimStr(data.cust_woo_ndis_dob || data.ndis_dob) || undefined,
    funding_type: funding,
    invoice_email:
      trimStr(data.cust_woo_invoice_email || data.billing_ndis_invoice_email) || undefined,
    approval: data.cust_woo_ndis_approval ?? data.ndis_approval,
  };
  Object.keys(record).forEach((k) => {
    if (record[k] === undefined) delete record[k];
  });
  if (!hasSubstantiveNdisRecord(record)) return undefined;
  return jsonInfoBlock(record);
}

export function buildHcpInfoJsonFromForm(data: {
  cust_woo_hcp_participant_name?: string | null;
  hcp_participant_name?: string | null;
  cust_woo_hcp_number?: string | null;
  hcp_number?: string | null;
  cust_woo_provider_email?: string | null;
  hcp_provider_email?: string | null;
  cust_woo_hcp_approval?: boolean | null;
  hcp_approval?: boolean | null;
}): string | undefined {
  const record: Record<string, unknown> = {
    participant_name: trimStr(data.cust_woo_hcp_participant_name || data.hcp_participant_name) || undefined,
    number: trimStr(data.cust_woo_hcp_number || data.hcp_number) || undefined,
    provider_email: trimStr(data.cust_woo_provider_email || data.hcp_provider_email) || undefined,
    approval: data.cust_woo_hcp_approval ?? data.hcp_approval,
  };
  Object.keys(record).forEach((k) => {
    if (record[k] === undefined) delete record[k];
  });
  if (!hasSubstantiveHcpRecord(record)) return undefined;
  return jsonInfoBlock(record);
}

function parseJsonObject(raw: string | undefined): Record<string, unknown> | null {
  if (!raw?.trim()) return null;
  try {
    const p = JSON.parse(raw) as unknown;
    if (p && typeof p === "object" && !Array.isArray(p)) return p as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Remove empty NDIS/HCP blobs from the initiate payload so Woo meta, emails, and receipts stay clean.
 */
export function stripEmptyNdisHcpFromInitiatePayload(
  p: CheckoutInitiatePayload,
): CheckoutInitiatePayload {
  const ndisType = normalizeNdisFundingType(p.ndis_type);
  let ndis_info: string | undefined = p.ndis_info?.trim() || undefined;
  if (ndis_info) {
    const obj = parseJsonObject(ndis_info);
    if (!obj || !hasSubstantiveNdisRecord(obj)) ndis_info = undefined;
  }
  let hcp_info: string | undefined = p.hcp_info?.trim() || undefined;
  if (hcp_info) {
    const obj = parseJsonObject(hcp_info);
    if (!obj || !hasSubstantiveHcpRecord(obj)) hcp_info = undefined;
  }
  const ndis_type = ndis_info || ndisType ? ndisType : undefined;
  return {
    ...p,
    ndis_info,
    hcp_info,
    ndis_type,
  };
}

/** Digit count in NDIS number field from client `ndis_info` JSON (for guest on-account gate). */
export function countNdisDigitsInCheckoutPayload(payload: CheckoutInitiatePayload): number {
  const obj = parseJsonObject(payload.ndis_info);
  if (!obj) return 0;
  return trimStr(obj.number).replace(/\D/g, "").length;
}

export type HcpInfoDisplay = {
  participantName: string | null;
  number: string | null;
  providerEmail: string | null;
  /** `true` / `false` when checkbox was present in JSON; `null` if unknown */
  fundingApproved: boolean | null;
};

/** Parse `hcp_info` JSON for receipts / UI (same shape as {@link buildHcpInfoJsonFromForm}). */
export function parseHcpInfoJson(raw: string | undefined | null): HcpInfoDisplay | null {
  const obj = parseJsonObject(raw ?? undefined);
  if (!obj) return null;
  const participantName = trimStr(obj.participant_name) || null;
  const number = trimStr(obj.number) || null;
  const providerEmail = trimStr(obj.provider_email) || null;
  let fundingApproved: boolean | null = null;
  if (Object.prototype.hasOwnProperty.call(obj, "approval")) {
    fundingApproved = Boolean(obj.approval);
  }
  if (!participantName && !number && !providerEmail && fundingApproved === null) return null;
  return { participantName, number, providerEmail, fundingApproved };
}

/**
 * Flat Woo order meta rows so wp-admin and email templates can show HCP without parsing JSON.
 * Call only when `hcp_info` is already validated / substantive.
 */
export function flatHcpOrderMetaRowsFromHcpInfoJson(
  hcpInfoJson: string | undefined,
): Array<{ key: string; value: unknown }> {
  const hcp = parseHcpInfoJson(hcpInfoJson);
  if (!hcp) return [];
  const rows: Array<{ key: string; value: unknown }> = [];
  if (hcp.participantName) rows.push({ key: "hcp_participant_name", value: hcp.participantName });
  if (hcp.number) rows.push({ key: "hcp_number", value: hcp.number });
  if (hcp.providerEmail) rows.push({ key: "hcp_provider_email", value: hcp.providerEmail });
  if (hcp.fundingApproved !== null) {
    rows.push({ key: "hcp_approval", value: hcp.fundingApproved ? "yes" : "no" });
  }
  return rows;
}

/** Order-review / PDF: read HCP from `hcp_info` JSON or flat Woo meta keys. */
export function hcpDisplayFromOrderMeta(
  meta: Array<{ key?: string; value?: unknown }> | undefined,
): HcpInfoDisplay | null {
  if (!meta?.length) return null;
  const hcpInfoRaw = meta.find((m) => String(m?.key) === "hcp_info")?.value;
  if (typeof hcpInfoRaw === "string" && hcpInfoRaw.trim()) {
    const p = parseHcpInfoJson(hcpInfoRaw);
    if (p) return p;
  }
  const participantName =
    trimStr(meta.find((m) => String(m?.key) === "hcp_participant_name")?.value) || null;
  const number =
    trimStr(meta.find((m) => String(m?.key) === "hcp_number")?.value) ||
    trimStr(meta.find((m) => String(m?.key) === "HCP Number")?.value) ||
    null;
  const providerEmail = trimStr(meta.find((m) => String(m?.key) === "hcp_provider_email")?.value) || null;
  const appraw = meta.find((m) => String(m?.key) === "hcp_approval")?.value;
  let fundingApproved: boolean | null = null;
  if (appraw !== undefined && appraw !== null && String(appraw).trim() !== "") {
    const s = String(appraw).trim().toLowerCase();
    fundingApproved = s === "yes" || s === "true" || s === "1";
  }
  if (!participantName && !number && !providerEmail && fundingApproved === null) return null;
  return { participantName, number, providerEmail, fundingApproved };
}
