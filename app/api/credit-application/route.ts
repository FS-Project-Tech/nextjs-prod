import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/api-security";
import { secureResponse } from "@/lib/security-headers";
import {
  isBrevoUnauthorizedIpError,
  sendPlainEmailWithAttachmentsViaBrevo,
} from "@/lib/email/sendViaBrevo";
import { getSiteContact } from "@/lib/site-contact";
import { syncCreditApplicationToWordPress } from "@/lib/credit-application/sync-wordpress";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB each
const ALLOWED_EXT = /\.(pdf|jpg|jpeg|png|webp)$/i;

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "true" || v === "on" || v === "1";
}

async function fileToAttachment(
  file: File | null,
  fallbackName: string
): Promise<{ name: string; contentBase64: string } | null> {
  if (!file || file.size === 0) return null;
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`File "${file.name}" exceeds 5 MB limit.`);
  }
  const name = file.name || fallbackName;
  if (!ALLOWED_EXT.test(name)) {
    throw new Error(`File "${name}" must be PDF or image (JPG, PNG, WebP).`);
  }
  const buf = Buffer.from(await file.arrayBuffer());
  return {
    name: name.replace(/[^\w.\- ()]+/g, "_").slice(0, 180),
    contentBase64: buf.toString("base64"),
  };
}

/** Read upload fields once — used for WordPress JSON + Brevo email. */
async function readCreditApplicationFiles(fd: FormData): Promise<{
  attachments: { name: string; contentBase64: string }[];
  wpFileFields: {
    file_registration_base64?: string;
    file_registration_name?: string;
    file_tax_base64?: string;
    file_tax_name?: string;
    file_id_base64?: string;
    file_id_name?: string;
  };
}> {
  const attachments: { name: string; contentBase64: string }[] = [];
  const wpFileFields: {
    file_registration_base64?: string;
    file_registration_name?: string;
    file_tax_base64?: string;
    file_tax_name?: string;
    file_id_base64?: string;
    file_id_name?: string;
  } = {};

  const specs = [
    { field: "file_registration" as const, fallback: "registration.pdf", key: "file_registration" as const },
    { field: "file_tax" as const, fallback: "tax.pdf", key: "file_tax" as const },
    { field: "file_id" as const, fallback: "id.pdf", key: "file_id" as const },
  ];

  for (const { field, fallback, key } of specs) {
    const f = fd.get(field);
    if (f instanceof File && f.size > 0) {
      const a = await fileToAttachment(f, fallback);
      if (a) {
        attachments.push(a);
        wpFileFields[`${key}_base64`] = a.contentBase64;
        wpFileFields[`${key}_name`] = a.name;
      }
    }
  }

  return { attachments, wpFileFields };
}

export async function POST(req: NextRequest) {
  const rateLimitCheck = await rateLimit({
    windowMs: 60 * 60 * 1000,
    maxRequests: 5,
  })(req);
  if (rateLimitCheck) return rateLimitCheck;

  try {
    const fd = await req.formData();

    const company_name = str(fd, "company_name");
    const contact_person_name = str(fd, "contact_person_name");
    const contact_email = str(fd, "contact_email");
    const contact_phone = str(fd, "contact_phone");
    const addr_street = str(fd, "addr_street");
    const addr_city = str(fd, "addr_city");
    const addr_state = str(fd, "addr_state");
    const addr_postcode = str(fd, "addr_postcode");
    const addr_country = str(fd, "addr_country");
    const credit_limit = str(fd, "credit_limit");
    const payment_terms = str(fd, "payment_terms");
    const estimated_monthly_purchase = str(fd, "estimated_monthly_purchase");
    const ref1_company = str(fd, "ref1_company");
    const ref1_contact = str(fd, "ref1_contact");
    const ref1_phone = str(fd, "ref1_phone");
    const ref1_email = str(fd, "ref1_email");
    const ref2_company = str(fd, "ref2_company");
    const ref2_contact = str(fd, "ref2_contact");
    const ref2_phone = str(fd, "ref2_phone");
    const ref2_email = str(fd, "ref2_email");
    const agree_accurate = bool(fd, "agree_accurate");
    const agree_terms = bool(fd, "agree_terms");
    const authorized_name = str(fd, "authorized_name");
    const authorized_position = str(fd, "authorized_position");
    const signature = str(fd, "signature");
    const application_date = str(fd, "application_date");

    const missing: string[] = [];
    if (!company_name) missing.push("Company / Business Name");
    if (!contact_person_name) missing.push("Contact Person Name");
    if (!contact_email) missing.push("Email Address");
    if (!contact_phone) missing.push("Phone Number");
    if (!addr_street) missing.push("Street Address");
    if (!addr_city) missing.push("City / Suburb");
    if (!addr_state) missing.push("State");
    if (!addr_postcode) missing.push("Postcode");
    if (!addr_country) missing.push("Country");
    if (!credit_limit) missing.push("Requested Credit Limit");
    if (!payment_terms) missing.push("Payment Terms");
    if (!estimated_monthly_purchase) missing.push("Estimated Monthly Purchase");
    if (!ref1_company || !ref1_contact || !ref1_phone || !ref1_email) {
      missing.push("Trade Reference 1 (all fields)");
    }
    if (!ref2_company || !ref2_contact || !ref2_phone || !ref2_email) {
      missing.push("Trade Reference 2 (all fields)");
    }
    if (!agree_accurate) missing.push("Confirmation that information is accurate");
    if (!agree_terms) missing.push("Agreement to credit terms");
    if (!authorized_name) missing.push("Authorized Person Name");
    if (!authorized_position) missing.push("Position");
    if (!signature) missing.push("Signature");
    if (!application_date) missing.push("Date");

    if (missing.length) {
      return secureResponse(
        { error: `Missing or invalid: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_email)) {
      return secureResponse({ error: "Invalid contact email." }, { status: 400 });
    }

    const adminTo =
      process.env.CREDIT_APPLICATION_EMAIL?.trim() ||
      process.env.CONTACT_FORM_ADMIN_EMAIL?.trim() ||
      process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ||
      getSiteContact().email;

    if (!adminTo) {
      return secureResponse(
        { error: "Credit application inbox is not configured." },
        { status: 503 }
      );
    }

    const { attachments: emailAttachments, wpFileFields } = await readCreditApplicationFiles(fd);

    const totalAttach = emailAttachments.reduce(
      (s, a) => s + Buffer.from(a.contentBase64, "base64").length,
      0
    );
    if (totalAttach > 12 * 1024 * 1024) {
      return secureResponse(
        { error: "Total attachment size is too large (max ~12 MB combined)." },
        { status: 400 }
      );
    }

    const wpPayload = {
      company_name,
      trading_name: str(fd, "trading_name"),
      abn: str(fd, "abn_gst"),
      business_type: str(fd, "business_type"),
      years_business: str(fd, "years_in_business"),
      website: str(fd, "company_website"),
      contact_name: contact_person_name,
      position: str(fd, "position_title"),
      email: contact_email,
      phone: contact_phone,
      mobile: str(fd, "contact_mobile"),
      street_address: addr_street,
      city: addr_city,
      state: addr_state,
      postcode: addr_postcode,
      country: addr_country,
      accounts_name: str(fd, "accounts_name"),
      accounts_email: str(fd, "accounts_email"),
      accounts_phone: str(fd, "accounts_phone"),
      credit_limit,
      payment_terms,
      monthly_purchase: estimated_monthly_purchase,
      bank_name: str(fd, "bank_name"),
      bank_branch: str(fd, "bank_branch"),
      account_name: str(fd, "bank_account_name"),
      ref1_company,
      ref1_contact,
      ref1_phone,
      ref1_email,
      ref2_company,
      ref2_contact,
      ref2_phone,
      ref2_email,
      agree_accurate: agree_accurate ? "1" : "0",
      agree_terms: agree_terms ? "1" : "0",
      authorized_name,
      authorized_position,
      signature,
      application_date,
      ...wpFileFields,
    };

    const wpSync = await syncCreditApplicationToWordPress(wpPayload);
    if (wpSync.ok === false) {
      console.error("[credit-application] WordPress sync failed", wpSync.detail);
      const exposeWp =
        process.env.NODE_ENV !== "production" ||
        process.env.CREDIT_APPLICATION_DEBUG === "1";
      return secureResponse(
        {
          error: exposeWp
            ? `Could not save your application. ${wpSync.detail}`
            : "Could not save your application. Please try again later or email us directly.",
          ...(exposeWp ? { _debug: wpSync.detail } : {}),
        },
        { status: 502 }
      );
    }

    const site = process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "Website";
    const lines: string[] = [
      `New CREDIT APPLICATION from ${site}`,
      "",
      "=== BUSINESS INFORMATION ===",
      `Company / Business Name: ${company_name}`,
      `Trading Name: ${str(fd, "trading_name")}`,
      `ABN / GST / Tax ID: ${str(fd, "abn_gst")}`,
      `Business Type: ${str(fd, "business_type")}`,
      `Years in Business: ${str(fd, "years_in_business")}`,
      `Company Website: ${str(fd, "company_website")}`,
      "",
      "=== CONTACT PERSON ===",
      `Name: ${contact_person_name}`,
      `Position / Title: ${str(fd, "position_title")}`,
      `Email: ${contact_email}`,
      `Phone: ${contact_phone}`,
      `Mobile: ${str(fd, "contact_mobile")}`,
      "",
      "=== BUSINESS ADDRESS ===",
      `Street: ${addr_street}`,
      `City / Suburb: ${addr_city}`,
      `State: ${addr_state}`,
      `Postcode: ${addr_postcode}`,
      `Country: ${addr_country}`,
      "",
      "=== ACCOUNTS / BILLING ===",
      `Accounts Contact Name: ${str(fd, "accounts_name")}`,
      `Accounts Email: ${str(fd, "accounts_email")}`,
      `Accounts Phone: ${str(fd, "accounts_phone")}`,
      "",
      "=== CREDIT REQUEST ===",
      `Requested Credit Limit: ${credit_limit}`,
      `Payment Terms: ${payment_terms}`,
      `Estimated Monthly Purchase: ${estimated_monthly_purchase}`,
      "",
      "=== TRADE REFERENCE 1 ===",
      `Company: ${ref1_company}`,
      `Contact: ${ref1_contact}`,
      `Phone: ${ref1_phone}`,
      `Email: ${ref1_email}`,
      "",
      "=== TRADE REFERENCE 2 ===",
      `Company: ${ref2_company}`,
      `Contact: ${ref2_contact}`,
      `Phone: ${ref2_phone}`,
      `Email: ${ref2_email}`,
      "",
      "=== BANK REFERENCE (optional) ===",
      `Bank Name: ${str(fd, "bank_name")}`,
      `Branch: ${str(fd, "bank_branch")}`,
      `Account Name: ${str(fd, "bank_account_name")}`,
      "",
      "=== AGREEMENT ===",
      `Information accurate: ${agree_accurate ? "Yes" : "No"}`,
      `Agree to terms: ${agree_terms ? "Yes" : "No"}`,
      "",
      "=== AUTHORIZATION ===",
      `Authorized Person: ${authorized_name}`,
      `Position: ${authorized_position}`,
      `Signature (typed): ${signature}`,
      `Date: ${application_date}`,
    ];

    const plain = lines.join("\n");

    const r = await sendPlainEmailWithAttachmentsViaBrevo({
      to: adminTo,
      subject: `Credit application — ${company_name}`,
      text: plain,
      replyTo: contact_email,
      senderName: site,
      attachments: emailAttachments.length ? emailAttachments : undefined,
    });

    if (r.ok === false) {
      console.error("[credit-application] Brevo failed", r.detail);
      const generic =
        "Could not send your application. Please try again later or email us directly.";
      const exposeDetail =
        process.env.NODE_ENV !== "production" ||
        process.env.CREDIT_APPLICATION_DEBUG === "1";
      const fallbackContact = getSiteContact().email;
      const ipBlocked = isBrevoUnauthorizedIpError(r.status, r.detail);

      /** Visitor-safe message; IP restriction must be fixed in Brevo (not fixable in app code). */
      const publicMsg = ipBlocked
        ? `We're unable to submit your application online at the moment. Please email ${fallbackContact} or call us — our team can help with your credit application.`
        : generic;

      const error = (() => {
        if (ipBlocked && exposeDetail) {
          return (
            `${publicMsg} [Admin: Brevo API key uses IP allowlisting. Add this server's public IP in Brevo → Security → Authorised IPs, or disable IP restriction for this key. ` +
            `Local dev: add your current IPv4/IPv6. Serverless hosts often need IP restriction OFF or a dedicated egress IP. Raw: ${r.detail}]`
          );
        }
        if (exposeDetail) return `${generic} — ${r.detail}`;
        return ipBlocked ? publicMsg : generic;
      })();

      return secureResponse(
        {
          error,
          ...(exposeDetail ? { _debug: r.detail } : {}),
          ...(ipBlocked ? { brevoError: "ip_not_authorised" as const } : {}),
        },
        { status: 502 }
      );
    }

    return secureResponse({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    if (msg.includes("exceeds") || msg.includes("must be PDF")) {
      return secureResponse({ error: msg }, { status: 400 });
    }
    console.error("[credit-application]", e);
    return secureResponse({ error: "Something went wrong." }, { status: 500 });
  }
}
