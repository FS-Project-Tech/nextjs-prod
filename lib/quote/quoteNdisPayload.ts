import { normalizeNdisFundingType } from "@/lib/checkout/ndisHcpPayload";
import type { QuoteFormData } from "./schema";

const CLAIM_TO_FUNDING: Record<string, string> = {
  self: "self_managed",
  joyamedical: "agency_managed",
  plan_manager: "plan_managed",
};

function trimStr(v: unknown): string {
  return String(v ?? "").trim();
}

/** NDIS block stored on quote records and included in staff/customer emails. */
export function buildQuoteNdisInfoJson(v: QuoteFormData): string | undefined {
  const participant = trimStr(v.cust_woo_ndis_participant_name);
  const number = trimStr(v.cust_woo_ndis_number);
  const dob = trimStr(v.cust_woo_ndis_dob);
  const planStart = trimStr(v.quote_ndis_plan_start);
  const planEnd = trimStr(v.quote_ndis_plan_end);
  const claimWho = trimStr(v.quote_ndis_claim_who);
  const funding =
    normalizeNdisFundingType(v.cust_woo_ndis_funding_type) ||
    (claimWho ? CLAIM_TO_FUNDING[claimWho] : undefined);

  if (!participant && !number && !dob && !planStart && !planEnd && !funding && !claimWho) {
    return undefined;
  }

  const record: Record<string, unknown> = {
    participant_name: participant || undefined,
    number: number || undefined,
    dob: dob || undefined,
    plan_start: planStart || undefined,
    plan_end: planEnd || undefined,
    claim_who: claimWho || undefined,
    funding_type: funding,
  };

  Object.keys(record).forEach((k) => {
    if (record[k] === undefined) delete record[k];
  });

  try {
    return JSON.stringify(record);
  } catch {
    return undefined;
  }
}

export function mapClaimWhoToFundingType(claimWho: string | undefined): string {
  if (!claimWho) return "";
  return CLAIM_TO_FUNDING[claimWho] ?? "";
}
