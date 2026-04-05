import "server-only";

/**
 * POST credit application JSON to WordPress custom REST route (wp_credit_applications table).
 *
 * Env:
 * - CREDIT_APPLICATION_WP_ENDPOINT — full URL, e.g. https://example.com/wp-json/credit/v1/submit
 * - CREDIT_APPLICATION_WP_SECRET — optional; sent as X-Joya-Credit-App-Secret
 *
 * Field names must match `joya_save_credit_application()` in docs/wordpress-credit-applications.php
 */
export type WordPressCreditApplicationPayload = {
  company_name: string;
  trading_name: string;
  abn: string;
  business_type: string;
  years_business: string;
  website: string;
  contact_name: string;
  position: string;
  email: string;
  phone: string;
  mobile: string;
  street_address: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  accounts_name: string;
  accounts_email: string;
  accounts_phone: string;
  credit_limit: string;
  payment_terms: string;
  monthly_purchase: string;
  bank_name: string;
  bank_branch: string;
  account_name: string;
  /** Trade references + agreement + authorization */
  ref1_company: string;
  ref1_contact: string;
  ref1_phone: string;
  ref1_email: string;
  ref2_company: string;
  ref2_contact: string;
  ref2_phone: string;
  ref2_email: string;
  agree_accurate: string;
  agree_terms: string;
  authorized_name: string;
  authorized_position: string;
  signature: string;
  application_date: string;
  /** Optional base64 file payloads for WordPress to store under uploads (5 MB max each server-side) */
  file_registration_base64?: string;
  file_registration_name?: string;
  file_tax_base64?: string;
  file_tax_name?: string;
  file_id_base64?: string;
  file_id_name?: string;
};

export type SyncCreditApplicationToWordPressResult =
  | { ok: true; skipped: boolean }
  | { ok: false; status: number; detail: string };

export async function syncCreditApplicationToWordPress(
  payload: WordPressCreditApplicationPayload
): Promise<SyncCreditApplicationToWordPressResult> {
  const url = process.env.CREDIT_APPLICATION_WP_ENDPOINT?.trim();
  if (!url) {
    return { ok: true, skipped: true };
  }

  const secret = process.env.CREDIT_APPLICATION_WP_SECRET?.trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (secret) {
    headers["X-Joya-Credit-App-Secret"] = secret;
  }

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 120_000);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(t);
    }

    if (res.ok) {
      return { ok: true, skipped: false };
    }

    let detail = `HTTP ${res.status}`;
    try {
      const raw = await res.text();
      if (raw) {
        try {
          const j = JSON.parse(raw) as { message?: string };
          if (j?.message) detail = `${detail}: ${j.message}`;
          else detail = `${detail}: ${raw.slice(0, 300)}`;
        } catch {
          detail = `${detail}: ${raw.slice(0, 300)}`;
        }
      }
    } catch {
      /* ignore */
    }

    return { ok: false, status: res.status, detail };
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.name === "AbortError"
          ? "WordPress request timed out"
          : e.message
        : "network error";
    return { ok: false, status: 502, detail: msg };
  }
}
