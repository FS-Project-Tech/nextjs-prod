import axios from "axios";

export const DEFAULT_LEGACY_ORDERS_URL =
  "https://stage.joyamedicalsupplies.com.au/wp-json/joya-legacy-orders/v1/orders";

export const LEGACY_MAX_PAGES = 25;
export const LEGACY_PER_PAGE = 100;

export function extractLegacyOrdersPayload(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.orders)) return d.orders as Record<string, unknown>[];
  const nested = d.data;
  if (nested && typeof nested === "object") {
    const inner = (nested as Record<string, unknown>).orders;
    if (Array.isArray(inner)) return inner as Record<string, unknown>[];
  }
  return [];
}

function applyLegacyAuthorizationExtra(headers: Record<string, string>): void {
  const explicit = process.env.JOYA_LEGACY_ORDERS_AUTHORIZATION?.trim();
  if (explicit) {
    headers.Authorization = explicit;
    return;
  }
  const basicEmpty = process.env.JOYA_LEGACY_ORDERS_BASIC_EMPTY?.trim().toLowerCase();
  if (basicEmpty === "true" || basicEmpty === "1" || basicEmpty === "yes") {
    headers.Authorization = "Basic Og==";
  }
}

export function buildLegacyRequestHeaders(token: string): Record<string, string> {
  const mode = (process.env.JOYA_LEGACY_ORDERS_AUTH_MODE || "header").toLowerCase();
  const customName = process.env.JOYA_LEGACY_ORDERS_TOKEN_HEADER?.trim();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "JoyaDashboard-Orders/1.0 (Next.js server)",
  };

  const setCustomToken = () => {
    if (customName) {
      headers[customName] = token;
    } else {
      headers["x-joya-legacy-token"] = token;
    }
  };

  if (mode === "bearer") {
    headers.Authorization = `Bearer ${token}`;
    return headers;
  }
  if (mode === "both") {
    headers.Authorization = `Bearer ${token}`;
    setCustomToken();
    return headers;
  }
  setCustomToken();
  applyLegacyAuthorizationExtra(headers);
  return headers;
}

function formatLegacyErrorBody(data: unknown): string {
  if (data == null) return "";
  if (typeof data === "string") return data.slice(0, 280);
  if (typeof data === "object" && data !== null && "message" in data) {
    const m = (data as { message?: string; code?: string }).message;
    const c = (data as { code?: string }).code;
    return [c, m].filter(Boolean).join(": ").slice(0, 280);
  }
  try {
    return JSON.stringify(data).slice(0, 280);
  } catch {
    return "";
  }
}

/**
 * Paginated legacy orders for a customer (same contract as dashboard list).
 */
export async function fetchAllLegacyOrdersForCustomer(
  customerId: number,
  email: string | null,
  logTag = "[legacy-orders]",
): Promise<Record<string, unknown>[]> {
  const token = process.env.JOYA_LEGACY_ORDERS_TOKEN?.trim();
  const url = (process.env.JOYA_LEGACY_ORDERS_URL || DEFAULT_LEGACY_ORDERS_URL).trim();
  if (!token) return [];

  const acc: Record<string, unknown>[] = [];
  const timeout = parseInt(process.env.WOOCOMMERCE_API_TIMEOUT || "45000", 10);
  try {
    for (let p = 1; p <= LEGACY_MAX_PAGES; p++) {
      const res = await axios.get<unknown>(url, {
        params: {
          customer_id: customerId,
          ...(email ? { email } : {}),
          page: p,
          per_page: LEGACY_PER_PAGE,
        },
        headers: buildLegacyRequestHeaders(token),
        timeout,
        validateStatus: () => true,
      });
      if (res.status < 200 || res.status >= 300) {
        if (p === 1) {
          const detail = formatLegacyErrorBody(res.data);
          if (res.status === 403) {
            console.warn(
              `${logTag} Legacy API 403 (forbidden). Check JOYA_LEGACY_ORDERS_TOKEN and URL; JOYA_LEGACY_ORDERS_BASIC_EMPTY or JOYA_LEGACY_ORDERS_AUTHORIZATION may be required.`,
              detail ? `WordPress: ${detail}` : "",
            );
          } else {
            console.warn(`${logTag} Legacy API error:`, res.status, detail || "");
          }
        }
        break;
      }
      const batch = extractLegacyOrdersPayload(res.data);
      if (!batch.length) break;
      acc.push(...batch);
      if (batch.length < LEGACY_PER_PAGE) break;
    }
  } catch (e) {
    console.error(`${logTag} Legacy fetch failed:`, e);
  }
  return acc;
}
