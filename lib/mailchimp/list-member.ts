import crypto from "crypto";

/**
 * Mailchimp list member id = MD5 of lowercase email.
 * @see https://mailchimp.com/developer/marketing/docs/merge-fields/#add-a-subscriber
 */
export function mailchimpSubscriberHash(email: string): string {
  return crypto.createHash("md5").update(email.toLowerCase().trim()).digest("hex");
}

/** API key format ends with `-us21` (datacenter / server prefix). */
export function mailchimpServerFromApiKey(apiKey: string): string | null {
  const k = apiKey.trim();
  const i = k.lastIndexOf("-");
  if (i < 0 || i >= k.length - 1) return null;
  return k.slice(i + 1);
}

export type MailchimpSubscribeStatus = "subscribed" | "pending";

export async function upsertMailchimpListMember(opts: {
  apiKey: string;
  listId: string;
  email: string;
  /** `subscribed` = single opt-in; `pending` = double opt-in (Mailchimp sends confirmation). */
  status: MailchimpSubscribeStatus;
}): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  const server =
    process.env.MAILCHIMP_SERVER_PREFIX?.trim() || mailchimpServerFromApiKey(opts.apiKey);
  if (!server) {
    return { ok: false, status: 500, detail: "Invalid MAILCHIMP_API_KEY (missing server suffix)" };
  }

  const hash = mailchimpSubscriberHash(opts.email);
  const url = `https://${server}.api.mailchimp.com/3.0/lists/${encodeURIComponent(opts.listId)}/members/${hash}`;

  const auth = Buffer.from(`anystring:${opts.apiKey}`).toString("base64");

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      email_address: opts.email.trim(),
      status_if_new: opts.status,
      status: opts.status,
    }),
  });

  if (res.ok) {
    return { ok: true };
  }

  let detail = `HTTP ${res.status}`;
  try {
    const j = (await res.json()) as { title?: string; detail?: string };
    if (j.title || j.detail) {
      detail = [j.title, j.detail].filter(Boolean).join(": ");
    }
  } catch {
    try {
      detail = (await res.text()) || detail;
    } catch {
      /* keep detail */
    }
  }

  return { ok: false, status: res.status, detail };
}
