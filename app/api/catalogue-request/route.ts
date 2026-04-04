import { NextRequest } from "next/server";
import { getWpBaseUrl } from "@/lib/auth";
import { rateLimit } from "@/lib/api-security";
import { sanitizeString, sanitizeEmail } from "@/lib/sanitize";
import { secureResponse } from "@/lib/security-headers";

const ADMIN_EMAIL_DEFAULT = "info@joyamedicalsupplies.com.au";

export type CatalogueRequestBody = {
  first_name: string;
  last_name: string;
  email: string;
  reason_for_ordering: string;
  business_name: string;
  abn: string;
  contact_number: string;
  number_of_copies: number | string;
  address: string;
};

function normalizeAbn(raw: string): string {
  return raw.replace(/\s/g, "");
}

function normalizeCopies(raw: number | string): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * POST /api/catalogue-request
 * Headless replacement for MetForm catalogue request — notifies admin + customer via WP send-email when available.
 */
export async function POST(req: NextRequest) {
  const rateLimitCheck = await rateLimit({
    windowMs: 60 * 60 * 1000,
    maxRequests: 8,
  })(req);

  if (rateLimitCheck) return rateLimitCheck;

  try {
    const body = (await req.json()) as Partial<CatalogueRequestBody>;
    const first_name = sanitizeString(body.first_name);
    const last_name = sanitizeString(body.last_name);
    const email = sanitizeEmail(body.email || "");
    const reason_for_ordering = sanitizeString(body.reason_for_ordering);
    const business_name = sanitizeString(body.business_name);
    const abn = normalizeAbn(sanitizeString(body.abn));
    const contact_number = sanitizeString(body.contact_number);
    const number_of_copies = normalizeCopies(body.number_of_copies ?? 0);
    const address = sanitizeString(body.address);

    if (!first_name || !last_name || !email) {
      return secureResponse(
        { error: "First name, last name, and email are required." },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return secureResponse({ error: "Invalid email address." }, { status: 400 });
    }

    if (!reason_for_ordering) {
      return secureResponse({ error: "Reason for ordering is required." }, { status: 400 });
    }

    if (!business_name) {
      return secureResponse({ error: "Business name is required." }, { status: 400 });
    }

    if (!contact_number || contact_number.replace(/\D/g, "").length < 8) {
      return secureResponse({ error: "A valid contact number is required." }, { status: 400 });
    }

    if (abn && !/^\d{11}$/.test(abn)) {
      return secureResponse(
        { error: "ABN must be 11 digits (or leave blank if not applicable)." },
        { status: 400 }
      );
    }

    if (!number_of_copies || number_of_copies < 1 || number_of_copies > 500) {
      return secureResponse(
        { error: "Number of copies must be between 1 and 500." },
        { status: 400 }
      );
    }

    if (!address || address.length < 5) {
      return secureResponse({ error: "Please enter a full delivery address." }, { status: 400 });
    }

    const adminTo = process.env.CATALOGUE_REQUEST_ADMIN_EMAIL?.trim() || ADMIN_EMAIL_DEFAULT;

    const adminSubject = `Catalogue request — ${business_name}`;
    const adminBody = `
New catalogue request (headless site)
 
Name: ${first_name} ${last_name}
Email: ${email}
Business: ${business_name}
ABN: ${abn || "—"}
Contact: ${contact_number}
Reason for ordering: ${reason_for_ordering}
Number of copies: ${number_of_copies}
 
Address:
${address}
 
---
${process.env.NEXT_PUBLIC_SITE_NAME || "Joya Medical Supplies"}
`.trim();

    const customerSubject = "We received your catalogue request";
    const customerBody = `
Hello ${first_name},
 
Thank you for requesting a catalogue from ${process.env.NEXT_PUBLIC_SITE_NAME || "Joya Medical Supplies"}.
 
We have received the following details:
• Business: ${business_name}
• Copies requested: ${number_of_copies}
• Delivery address: ${address}
 
Our team will process your request shortly.
 
Kind regards,
${process.env.NEXT_PUBLIC_SITE_NAME || "Joya Medical Supplies"}
`.trim();

    const wpBase = getWpBaseUrl();

    if (wpBase) {
      try {
        const customUrl = process.env.CATALOGUE_REQUEST_WP_ENDPOINT?.trim();
        const wpSecret = process.env.CATALOGUE_REQUEST_WP_SECRET?.trim();

        /** When set, POST here first. If WP returns non-OK, fail the request (do not pretend success). */
        if (customUrl) {
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (wpSecret) {
            headers["X-Joya-Catalogue-Secret"] = wpSecret;
          }
          const customRes = await fetch(customUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
              first_name,
              last_name,
              email,
              reason_for_ordering,
              business_name,
              abn,
              contact_number,
              number_of_copies,
              address,
            }),
            cache: "no-store",
          });

          let wpPayload: { message?: string; error?: string; success?: boolean } = {};
          try {
            wpPayload = (await customRes.json()) as typeof wpPayload;
          } catch {
            /* ignore */
          }

          if (
            !customRes.ok ||
            (typeof wpPayload.success === "boolean" && wpPayload.success === false)
          ) {
            const detail =
              wpPayload.message ||
              wpPayload.error ||
              `WordPress responded with HTTP ${customRes.status}`;
            return secureResponse(
              {
                error: "We could not save your catalogue request. Please try again or contact us.",
                ...(process.env.NODE_ENV === "development" && { detail }),
              },
              { status: 502 }
            );
          }
        }

        const [adminRes, customerRes] = await Promise.all([
          fetch(`${wpBase}/wp-json/wp/v2/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: adminTo,
              subject: adminSubject,
              message: adminBody,
              headers: { "Content-Type": "text/plain; charset=UTF-8" },
            }),
            cache: "no-store",
          }),
          fetch(`${wpBase}/wp-json/wp/v2/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: email,
              subject: customerSubject,
              message: customerBody,
              headers: { "Content-Type": "text/plain; charset=UTF-8" },
            }),
            cache: "no-store",
          }),
        ]);

        if (adminRes.ok && customerRes.ok) {
          return secureResponse({
            success: true,
            message: "Catalogue request submitted successfully.",
          });
        }
      } catch (e) {
        if (process.env.NODE_ENV === "development") {
          console.warn("catalogue-request wp mail:", e);
        }
      }
    }

    const webhook = process.env.CATALOGUE_REQUEST_WEBHOOK_URL?.trim();
    if (webhook) {
      try {
        await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "catalogue_request",
            payload: {
              first_name,
              last_name,
              email,
              reason_for_ordering,
              business_name,
              abn,
              contact_number,
              number_of_copies,
              address,
            },
          }),
        });
      } catch {
        /* ignore */
      }
    }

    if (process.env.NODE_ENV === "development") {
      console.log("Catalogue request (dev log):", {
        adminTo,
        adminSubject,
        email: customerBody.slice(0, 80),
      });
    }

    return secureResponse({
      success: true,
      message: "Catalogue request submitted successfully.",
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("catalogue-request error:", error);
    }
    return secureResponse(
      { error: "Something went wrong. Please try again later." },
      { status: 500 }
    );
  }
}
