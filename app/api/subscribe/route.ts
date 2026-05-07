import { NextRequest, NextResponse } from "next/server";
import { upsertMailchimpListMember } from "@/lib/mailchimp/list-member";

function isValidEmail(email: string): boolean {
  const t = email.trim();
  if (!t || t.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

/**
 * Newsletter signup: Mailchimp (default when configured) or legacy Brevo.
 *
 * Mailchimp env:
 * - MAILCHIMP_API_KEY — Marketing API key (ends with e.g. `-us21`)
 * - MAILCHIMP_LIST_ID — Audience / list ID
 * - MAILCHIMP_SERVER_PREFIX — optional if suffix is not on the key (e.g. `us21`)
 * - MAILCHIMP_SUBSCRIBE_STATUS — optional: `subscribed` (default) or `pending` (double opt-in)
 *
 * Legacy Brevo env (used only if Mailchimp is not configured):
 * - BREVO_API_KEY, BREVO_LIST_ID
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email : "";

    if (!email.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }

    const mailchimpKey = process.env.MAILCHIMP_API_KEY?.trim();
    const mailchimpList = process.env.MAILCHIMP_LIST_ID?.trim();
    const statusRaw = process.env.MAILCHIMP_SUBSCRIBE_STATUS?.trim().toLowerCase();
    const mailchimpStatus =
      statusRaw === "pending" ? ("pending" as const) : ("subscribed" as const);

    if (mailchimpKey && mailchimpList) {
      const result = await upsertMailchimpListMember({
        apiKey: mailchimpKey,
        listId: mailchimpList,
        email,
        status: mailchimpStatus,
      });

      if (result.ok === false) {
        const httpStatus =
          result.status >= 400 && result.status < 600 ? result.status : 400;
        return NextResponse.json(
          {
            error: result.detail || "Could not subscribe. Please try again later.",
          },
          { status: httpStatus },
        );
      }

      return NextResponse.json({ success: true });
    }

    const brevoKey = process.env.BREVO_API_KEY?.trim();
    const brevoList = process.env.BREVO_LIST_ID?.trim();
    if (brevoKey && brevoList) {
      const res = await fetch("https://api.brevo.com/v3/contacts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": brevoKey,
        },
        body: JSON.stringify({
          email: email.trim(),
          listIds: [Number(brevoList)],
          updateEnabled: true,
        }),
      });

      if (!res.ok) {
        let payload: unknown;
        try {
          payload = await res.json();
        } catch {
          payload = { message: await res.text() };
        }
        return NextResponse.json(payload, { status: 400 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      {
        error:
          "Newsletter is not configured. Set MAILCHIMP_API_KEY and MAILCHIMP_LIST_ID (or legacy BREVO_*).",
      },
      { status: 503 },
    );
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
