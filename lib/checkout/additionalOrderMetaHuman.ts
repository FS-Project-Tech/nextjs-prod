import type { CheckoutInitiatePayload } from "@/types/checkout";

export type YesNoMeta = "yes" | "no";

/** Woo `delivery_authority` / checkbox-style values → yes/no for admin-facing meta. */
export function signatureRequiredYesNoFromDeliveryAuthority(
  delivery_authority?: string | null,
): YesNoMeta {
  const da = String(delivery_authority ?? "").trim().toLowerCase();
  if (
    da === "with_signature" ||
    da === "yes" ||
    da === "1" ||
    da === "true"
  ) {
    return "yes";
  }
  return "no";
}

export function booleanToYesNo(v: boolean | undefined): YesNoMeta {
  return v === true ? "yes" : "no";
}

/** Order meta keys that match WooCommerce admin / email expectations (headless + REST). */
export function humanReadableAdditionalCheckoutMeta(
  payload: CheckoutInitiatePayload,
): Array<{ key: string; value: YesNoMeta }> {
  return [
    {
      key: "Signature Required",
      value: signatureRequiredYesNoFromDeliveryAuthority(payload.delivery_authority),
    },
    {
      key: "Do not Send Paperwork With Delivery",
      value: booleanToYesNo(payload.no_paperwork === true),
    },
    {
      key: "Discreet Packaging",
      value: booleanToYesNo(payload.discreet_packaging === true),
    },
  ];
}

function truthyMeta(v: unknown): boolean {
  if (v === true) return true;
  if (v === false || v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "yes" || s === "1" || s === "true";
}

/**
 * Ensures `/api/orders`-style payloads always carry human-readable yes/no meta,
 * deriving from snake_case keys when explicit labels are absent.
 */
export function mergeHumanReadableAdditionalMetaForOrdersRoute(
  metaData: Array<{ key: string; value: unknown }>,
): Array<{ key: string; value: unknown }> {
  const find = (k: string) => metaData.find((m) => m.key === k)?.value;

  let sig: YesNoMeta | undefined;
  const sigRaw = find("Signature Required");
  if (sigRaw === "yes" || sigRaw === "no") {
    sig = sigRaw;
  } else {
    sig = signatureRequiredYesNoFromDeliveryAuthority(String(find("delivery_authority") ?? ""));
  }

  let paper: YesNoMeta | undefined;
  const paperRaw = find("Do not Send Paperwork With Delivery");
  if (paperRaw === "yes" || paperRaw === "no") {
    paper = paperRaw;
  } else {
    paper = truthyMeta(find("no_paperwork")) ? "yes" : "no";
  }

  let disc: YesNoMeta | undefined;
  const discRaw = find("Discreet Packaging");
  if (discRaw === "yes" || discRaw === "no") {
    disc = discRaw;
  } else {
    disc = truthyMeta(find("discreet_packaging")) ? "yes" : "no";
  }

  const upsert = (key: string, value: YesNoMeta) => {
    const i = metaData.findIndex((m) => m.key === key);
    const row = { key, value };
    if (i >= 0) metaData[i] = row;
    else metaData.push(row);
  };

  upsert("Signature Required", sig);
  upsert("Do not Send Paperwork With Delivery", paper);
  upsert("Discreet Packaging", disc);

  return metaData;
}
