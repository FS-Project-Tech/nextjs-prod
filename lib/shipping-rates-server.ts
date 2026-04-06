import { wcGet } from "@/lib/woocommerce/wc-fetch";

export type ComputedShippingRate = {
  id: string;
  label: string;
  cost: number;
  zoneId: number;
  zone: string;
  minimum_amount?: number;
  maximum_amount?: number;
  requires?: string;
  description?: string;
};

export type ComputeShippingRatesInput = {
  country: string;
  state: string;
  postcode: string;
  city: string;
  cartSubtotal: number;
};

/**
 * Shared WooCommerce shipping zone/method resolution (used by /api/shipping/rates and checkout pricing).
 * Avoids an extra HTTP round-trip from the server to itself during create-order.
 */
export async function computeShippingRates(
  input: ComputeShippingRatesInput,
): Promise<{ rates: ComputedShippingRate[] }> {
  let country = (input.country || "AU").trim().toUpperCase();
  if (country === "AUSTRALIA") country = "AU";
  const state = (input.state || "").trim();
  const postcode = (input.postcode || "").trim();
  const cartSubtotal = Number.isFinite(input.cartSubtotal) ? input.cartSubtotal : 0;

  const zonesRes = await wcGet<Array<{ id: number; name: string; zone_order?: number }>>(
    "/shipping/zones",
    undefined,
    "noStore",
  );
  const zones: Array<{ id: number; name: string; zone_order?: number }> = zonesRes.data || [];
  zones.sort((a, b) => (a.zone_order ?? 999) - (b.zone_order ?? 999));

  const methods: ComputedShippingRate[] = [];

  const addressEmpty = !postcode && !state;
  const skipMinAmountForFree = addressEmpty;

  let matchedZone: { id: number; name: string } | null = null;

  if (!addressEmpty) {
    const candidates = zones.filter((z) => z.id !== 0);
    const locResults = await Promise.all(
      candidates.map(async (z) => {
        try {
          const locRes = await wcGet<Array<{ code: string; type: string }>>(
            `/shipping/zones/${z.id}/locations`,
            undefined,
            "noStore",
          );
          return { z, locations: locRes.data || [] };
        } catch {
          return { z, locations: [] as Array<{ code: string; type: string }> };
        }
      }),
    );

    for (const { z, locations } of locResults) {
      if (locations.length === 0) continue;

      const matches = locations.some((loc: { code: string; type: string }) => {
        const code = String(loc.code || "").trim();
        if (loc.type === "postcode") {
          if (!postcode) return false;
          if (code.includes(",")) {
            return code
              .split(",")
              .map((s) => s.trim())
              .includes(postcode);
          }
          if (code.includes("...")) {
            const [min, max] = code.split("...").map((s) => s.trim());
            const pc = parseInt(postcode, 10);
            const minN = parseInt(min, 10);
            const maxN = parseInt(max, 10);
            return !isNaN(pc) && !isNaN(minN) && !isNaN(maxN) && pc >= minN && pc <= maxN;
          }
          return code === postcode;
        }
        if (loc.type === "state") {
          const stateCode = `${country}:${state}`;
          return code === stateCode || code === state;
        }
        if (loc.type === "country") {
          return code === country;
        }
        return false;
      });

      if (matches) {
        matchedZone = z;
        break;
      }
    }
  }

  if (!matchedZone) {
    matchedZone =
      zones.find((z) => z.id > 0 && z.name.toLowerCase().includes("australia")) ??
      zones.find((z) => z.id > 0) ??
      null;
  }

  const zonesToUse = matchedZone ? [matchedZone] : zones.filter((z) => z.id > 0).slice(0, 1);

  const methodsResults = await Promise.all(
    zonesToUse.map(async (z) => {
      try {
        const mRes = await wcGet<unknown[]>(`/shipping/zones/${z.id}/methods`, undefined, "noStore");
        return { z, ms: Array.isArray(mRes.data) ? mRes.data : [] };
      } catch {
        return { z, ms: [] as unknown[] };
      }
    }),
  );

  for (const { z, ms } of methodsResults) {
    for (const m of ms) {
      const row = m as {
        enabled?: boolean | string;
        method_id?: string;
        id?: string;
        instance_id?: string;
        title?: string;
        method_title?: string;
        cost?: number;
        settings?: Record<string, { value?: string }>;
        method_description?: string;
      };
      if (row.enabled !== true && row.enabled !== "yes") continue;

      const cost = row.settings?.cost?.value
        ? parseFloat(row.settings.cost.value)
        : typeof row.cost === "number"
          ? row.cost
          : 0;
      const minVal = row.settings?.min_amount?.value ?? row.settings?.minimum_order_amount?.value;
      let minimum_amount = minVal ? parseFloat(String(minVal)) : undefined;
      if (row.method_id === "free_shipping" && country === "AU") {
        const hasValidMin = minimum_amount !== undefined && minimum_amount > 0;
        if (!hasValidMin) {
          const zn = (z.name || "").toLowerCase();
          if (
            zn.includes("nsw") ||
            zn.includes("gold coast") ||
            zn.includes("brisbane") ||
            (zn.includes("local") && zn.includes("gold"))
          ) {
            minimum_amount = 50;
          } else {
            minimum_amount = 300;
          }
        }
      }
      const maximum_amount = row.settings?.max_amount?.value
        ? parseFloat(row.settings.max_amount.value)
        : undefined;
      const requires = row.settings?.requires?.value || undefined;
      const description = row.settings?.description?.value || row.method_description || undefined;

      let shouldInclude = true;
      if (!skipMinAmountForFree) {
        if (minimum_amount !== undefined && cartSubtotal < minimum_amount) shouldInclude = false;
        if (maximum_amount !== undefined && cartSubtotal > maximum_amount) shouldInclude = false;
        if (requires === "min_amount" && (!minimum_amount || cartSubtotal < minimum_amount))
          shouldInclude = false;
        if (
          shouldInclude &&
          row.method_id === "free_shipping" &&
          minimum_amount !== undefined &&
          cartSubtotal < minimum_amount
        )
          shouldInclude = false;
      }

      if (z.name.toLowerCase().includes("rest of the world")) {
        shouldInclude = false;
      }

      const label = (row.title || row.method_title || row.id || "").trim();
      if (
        label.toLowerCase().includes("ex gst") ||
        label.toLowerCase().includes("offered on orders valued at")
      ) {
        shouldInclude = false;
      }

      if (shouldInclude) {
        methods.push({
          id: `${row.method_id || row.id}:${row.instance_id}`,
          label: label || row.title || row.method_title || String(row.id),
          cost: isNaN(cost) ? 0 : cost,
          zoneId: z.id,
          zone: z.name,
          minimum_amount,
          maximum_amount,
          requires,
          description,
        });
      }
    }
  }

  return { rates: methods };
}
