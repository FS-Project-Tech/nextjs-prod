/**
 * Send a plain-text email via Brevo (Sendinblue) transactional API.
 * https://developers.brevo.com/reference/sendtransacemail
 *
 * Set BREVO_API_KEY (existing). Sender must be a verified sender/domain in Brevo.
 * Optional: CONTACT_FORM_BREVO_SENDER_EMAIL — if unset, falls back to the admin "to" address
 * (works when that address is verified as a sender in Brevo).
 */
export async function sendPlainEmailViaBrevo(opts: {
    to: string;
    subject: string;
    text: string;
    replyTo?: string;
    senderName?: string;
  }): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
    const apiKey = process.env.BREVO_API_KEY?.trim();
    if (!apiKey) {
      return { ok: false, status: 500, detail: "BREVO_API_KEY not set" };
    }
   
    const senderEmail =
      process.env.CONTACT_FORM_BREVO_SENDER_EMAIL?.trim() ||
      process.env.BREVO_SENDER_EMAIL?.trim() ||
      opts.to;
   
    const senderName =
      opts.senderName ||
      process.env.CONTACT_FORM_BREVO_SENDER_NAME?.trim() ||
      process.env.NEXT_PUBLIC_SITE_NAME?.trim() ||
      "Website";
   
    const body: Record<string, unknown> = {
      sender: { name: senderName, email: senderEmail },
      to: [{ email: opts.to }],
      subject: opts.subject,
      textContent: opts.text,
    };
   
    if (opts.replyTo) {
      body.replyTo = { email: opts.replyTo };
    }
   
    let res: Response;
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 25_000);
      try {
        res = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "api-key": apiKey,
          },
          body: JSON.stringify(body),
          cache: "no-store",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(t);
      }
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.name === "AbortError"
            ? "Brevo request timed out"
            : e.message
          : "network error";
      return { ok: false, status: 502, detail: msg };
    }
   
    if (res.ok) {
      return { ok: true };
    }
   
    let detail = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { message?: string };
      if (j?.message) detail = `${detail}: ${j.message}`;
    } catch {
      const t = await res.text().catch(() => "");
      if (t) detail = `${detail}: ${t.slice(0, 200)}`;
    }
   
    return { ok: false, status: res.status, detail };
  }