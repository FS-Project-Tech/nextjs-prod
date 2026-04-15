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

// ---------------- CONFIG ----------------

const TIMEOUT_MS = 7000;
const MAX_RESULT_CACHE_ENTRIES = 80;

function zonesLocationsTtlMs() {
  return Math.max(10_000, parseInt(process.env.SHIPPING_ZONES_CACHE_MS || "300000", 10));
}

function zoneMethodsTtlMs() {
  return Math.max(10_000, parseInt(process.env.SHIPPING_ZONE_METHODS_CACHE_MS || "300000", 10));
}

function resultTtlMs() {
  return Math.max(5_000, parseInt(process.env.SHIPPING_RATES_RESULT_CACHE_MS || "90000", 10));
}

// ---------------- SAFE WC CALL ----------------

async function safeWcGet<T>(url: string): Promise<{ data: T }> {
  return Promise.race([
    wcGet<T>(url, undefined, "noStore"),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("WooCommerce timeout")), TIMEOUT_MS)
    ),
  ]) as Promise<{ data: T }>;
}

// ---------------- CACHE ----------------

type ZoneRow = { id: number; name: string; zone_order?: number };

let zonesLocationsCache: {
  at: number;
  zones: ZoneRow[];
  locationsByZoneId: Map<number, Array<{ code: string; type: string }>>;
} | null = null;

const zoneMethodsCache = new Map<number, { at: number; methods: unknown[] }>();
const resultCache = new Map<string, { at: number; rates: ComputedShippingRate[] }>();
const inflightByKey = new Map<string, Promise<{ rates: ComputedShippingRate[] }>>();

// ---------------- HELPERS ----------------

function isValidPostcode(pc: string) {
  return /^\d{4,6}$/.test(pc);
}

function normalizedKey(input: ComputeShippingRatesInput) {
  const sub = Math.round((input.cartSubtotal || 0) * 100) / 100;
  return `${input.country}|${input.state}|${input.postcode}|${input.city}|${sub}`;
}

/** Same rules as checkout `normCountry` — must match quote-totals and `/api/shipping/rates` query handling. */
function normalizeComputeInput(input: ComputeShippingRatesInput): ComputeShippingRatesInput {
  let country = String(input.country || "AU").trim().toUpperCase();
  if (country === "AUSTRALIA") country = "AU";
  if (!country) country = "AU";
  const cartRaw = input.cartSubtotal;
  const cartSubtotal =
    typeof cartRaw === "number" && Number.isFinite(cartRaw) ? cartRaw : 0;
  return {
    country,
    state: String(input.state || "").trim(),
    postcode: String(input.postcode || "").trim(),
    city: String(input.city || "").trim(),
    cartSubtotal,
  };
}

/** Woo REST zone methods use `method_id` + `instance_id`; some payloads expose instance as `id`. */
function wooZoneMethodCompositeId(row: any): string {
  const methodId = String(row.method_id ?? "").trim();
  const instance = row.instance_id ?? row.id;
  const instStr =
    instance != null && String(instance).trim() !== "" ? String(instance).trim() : "";
  if (!methodId) return instStr || "unknown";
  return instStr ? `${methodId}:${instStr}` : methodId;
}

// ---------------- LOADERS ----------------

async function loadZonesAndLocations() {
  const now = Date.now();

  if (zonesLocationsCache && now - zonesLocationsCache.at < zonesLocationsTtlMs()) {
    return zonesLocationsCache;
  }

  let zones: ZoneRow[] = [];

  try {
    const res = await safeWcGet<ZoneRow[]>("/shipping/zones");
    zones = [...(res.data || [])];
  } catch (e) {
    console.error("Zones fetch failed", e);
    return { zones: [], locationsByZoneId: new Map() };
  }

  zones.sort((a, b) => (a.zone_order ?? 999) - (b.zone_order ?? 999));

  const locationsByZoneId = new Map<number, Array<{ code: string; type: string }>>();

  await Promise.all(
    zones.map(async (z) => {
      if (z.id === 0) return;
      try {
        const res = await safeWcGet<Array<{ code: string; type: string }>>(
          `/shipping/zones/${z.id}/locations`
        );
        locationsByZoneId.set(z.id, res.data || []);
      } catch {
        locationsByZoneId.set(z.id, []);
      }
    })
  );

  zonesLocationsCache = { at: now, zones, locationsByZoneId };
  return zonesLocationsCache;
}

async function loadZoneMethods(zoneId: number) {
  const now = Date.now();

  const cached = zoneMethodsCache.get(zoneId);
  if (cached && now - cached.at < zoneMethodsTtlMs()) {
    return cached.methods;
  }

  try {
    const res = await safeWcGet<unknown[]>(`/shipping/zones/${zoneId}/methods`);
    const methods = Array.isArray(res.data) ? res.data : [];
    zoneMethodsCache.set(zoneId, { at: now, methods });
    return methods;
  } catch {
    zoneMethodsCache.set(zoneId, { at: now, methods: [] });
    return [];
  }
}

// ---------------- CORE ----------------

async function computeShippingRatesUncached(
  input: ComputeShippingRatesInput
): Promise<{ rates: ComputedShippingRate[] }> {

  const postcode = (input.postcode || "").trim();

  // ✅ HARD GUARD (MOST IMPORTANT)
  if (!postcode || !isValidPostcode(postcode)) {
    return { rates: [] };
  }

  if (input.cartSubtotal <= 0) {
    return { rates: [] };
  }

  const { zones, locationsByZoneId } = await loadZonesAndLocations();

  let matchedZone: ZoneRow | null = null;

  for (const z of zones) {
    if (z.id === 0) continue;

    const locations = locationsByZoneId.get(z.id) || [];

    const match = locations.some((loc) => {
      if (loc.type === "postcode") {
        return loc.code === postcode;
      }
      if (loc.type === "country") {
        return String(loc.code || "").trim().toUpperCase() === input.country;
      }
      return false;
    });

    if (match) {
      matchedZone = z;
      break;
    }
  }

  if (!matchedZone) {
    matchedZone = zones.find((z) => z.id > 0) || null;
  }

  if (!matchedZone) return { rates: [] };

  const methods = await loadZoneMethods(matchedZone.id);

  const rates: ComputedShippingRate[] = [];

  for (const m of methods) {
    const row: any = m;

    if (row.enabled !== true && row.enabled !== "yes") continue;

    const cost = parseFloat(row.settings?.cost?.value || row.cost || "0");

    rates.push({
      id: wooZoneMethodCompositeId(row),
      label: String(row.title || row.method_title || "Shipping"),
      cost: isNaN(cost) ? 0 : cost,
      zoneId: matchedZone.id,
      zone: matchedZone.name,
    });
  }

  return { rates };
}

// ---------------- PUBLIC ----------------

export async function computeShippingRates(
  input: ComputeShippingRatesInput
): Promise<{ rates: ComputedShippingRate[] }> {
  const normalizedInput = normalizeComputeInput(input);

  const key = normalizedKey(normalizedInput);

  const cached = resultCache.get(key);
  if (cached && Date.now() - cached.at < resultTtlMs()) {
    return { rates: cached.rates };
  }

  const existing = inflightByKey.get(key);
  if (existing) return existing;

  const p = computeShippingRatesUncached(normalizedInput)
    .then((res) => {
      while (resultCache.size >= MAX_RESULT_CACHE_ENTRIES) {
        resultCache.delete(resultCache.keys().next().value);
      }
      resultCache.set(key, { at: Date.now(), rates: res.rates });
      inflightByKey.delete(key);
      return res;
    })
    .catch((e) => {
      inflightByKey.delete(key);
      console.error("Shipping error:", e);
      return { rates: [] }; // ✅ NEVER THROW
    });

  inflightByKey.set(key, p);
  return p;
}