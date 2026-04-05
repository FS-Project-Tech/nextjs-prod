"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useToast } from "@/components/ToastProvider";

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.9)] transition-colors hover:border-gray-300 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/25 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500";

const labelClass = "mb-1.5 block text-sm font-medium leading-snug text-gray-700";

const fileInputClass =
  "block w-full cursor-pointer rounded-xl border border-gray-200 bg-gray-50/80 px-2 py-2 text-sm text-gray-600 transition-colors file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-teal-600 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white file:shadow-md file:transition-colors hover:border-teal-200 hover:bg-teal-50/40 hover:file:bg-teal-700";

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_-4px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.04]">
      <header className="border-b border-gray-100 bg-gradient-to-r from-slate-50/90 via-white to-white px-5 py-4 sm:px-6 sm:py-4">
        <h2 className="flex items-center gap-2.5 text-base font-semibold leading-snug tracking-tight text-gray-900 sm:text-lg">
          <span
            className="h-5 w-1 shrink-0 rounded-full bg-teal-600"
            aria-hidden
          />
          <span>{title}</span>
        </h2>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">{children}</div>
    </section>
  );
}

export default function CreditApplicationForm() {
  const { success, error: showError } = useToast();
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);

    const get = (k: string) => String(fd.get(k) ?? "").trim();
    const checks = [
      ["company_name", "Company / Business Name"],
      ["contact_person_name", "Contact Person Name"],
      ["contact_email", "Email Address"],
      ["contact_phone", "Phone Number"],
      ["addr_street", "Street Address"],
      ["addr_city", "City / Suburb"],
      ["addr_state", "State"],
      ["addr_postcode", "Postcode"],
      ["addr_country", "Country"],
      ["credit_limit", "Requested Credit Limit"],
      ["payment_terms", "Payment Terms"],
      ["estimated_monthly_purchase", "Estimated Monthly Purchase"],
      ["ref1_company", "Reference 1 — Company Name"],
      ["ref1_contact", "Reference 1 — Contact Person"],
      ["ref1_phone", "Reference 1 — Phone"],
      ["ref1_email", "Reference 1 — Email"],
      ["ref2_company", "Reference 2 — Company Name"],
      ["ref2_contact", "Reference 2 — Contact Person"],
      ["ref2_phone", "Reference 2 — Phone"],
      ["ref2_email", "Reference 2 — Email"],
      ["authorized_name", "Authorized Person Name"],
      ["authorized_position", "Position"],
      ["signature", "Signature"],
      ["application_date", "Date"],
    ] as const;

    for (const [key, label] of checks) {
      if (!get(key)) {
        showError(`Please fill in: ${label}`);
        return;
      }
    }

    if (!fd.get("agree_accurate")) {
      showError("Please confirm the information is accurate.");
      return;
    }
    if (!fd.get("agree_terms")) {
      showError("Please agree to the credit terms and conditions.");
      return;
    }

    const email = get("contact_email");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError("Please enter a valid email address.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/credit-application", {
        method: "POST",
        body: fd,
        credentials: "same-origin",
      });
      const text = await res.text();
      let json: { error?: string } = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = {};
      }
      if (!res.ok) {
        showError(
          typeof json.error === "string"
            ? json.error
            : "Submission failed. Please try again."
        );
        return;
      }
      success("Thank you — your credit application has been submitted.");
      form.reset();
    } catch {
      showError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full space-y-6 pb-12 sm:space-y-8 sm:pb-16"
      encType="multipart/form-data"
    >
      {/* Row 1: business (left) + contact (right) on large screens */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8 md:items-start">
        <Section title="Business information">
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="company_name">
                Company / Business Name <span className="text-red-600">*</span>
              </label>
              <input id="company_name" name="company_name" required className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="trading_name">
                Trading Name
              </label>
              <input id="trading_name" name="trading_name" className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="abn_gst">
                ABN / GST / Tax ID
              </label>
              <input id="abn_gst" name="abn_gst" className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="business_type">
                Business Type
              </label>
              <input id="business_type" name="business_type" className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="years_in_business">
                Years in Business
              </label>
              <input id="years_in_business" name="years_in_business" className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="company_website">
                Company Website
              </label>
              <input
                id="company_website"
                name="company_website"
                type="url"
                placeholder="https://"
                className={inputClass}
              />
            </div>
          </div>
        </Section>

        <Section title="Contact person">
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="contact_person_name">
                Contact Person Name <span className="text-red-600">*</span>
              </label>
              <input id="contact_person_name" name="contact_person_name" required className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="position_title">
                Position / Title
              </label>
              <input id="position_title" name="position_title" className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="contact_email">
                Email Address <span className="text-red-600">*</span>
              </label>
              <input id="contact_email" name="contact_email" type="email" required className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="contact_phone">
                Phone Number <span className="text-red-600">*</span>
              </label>
              <input id="contact_phone" name="contact_phone" type="tel" required className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="contact_mobile">
                Mobile Number
              </label>
              <input id="contact_mobile" name="contact_mobile" type="tel" className={inputClass} />
            </div>
          </div>
        </Section>
      </div>

      {/* Row 2: address + accounts */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8 md:items-start">
        <Section title="Business address">
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="addr_street">
              Street Address <span className="text-red-600">*</span>
            </label>
            <input id="addr_street" name="addr_street" required className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="addr_city">
                City / Suburb <span className="text-red-600">*</span>
              </label>
              <input id="addr_city" name="addr_city" required className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="addr_state">
                State <span className="text-red-600">*</span>
              </label>
              <input id="addr_state" name="addr_state" required className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="addr_postcode">
                Postcode <span className="text-red-600">*</span>
              </label>
              <input id="addr_postcode" name="addr_postcode" required className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="addr_country">
                Country <span className="text-red-600">*</span>
              </label>
              <input
                id="addr_country"
                name="addr_country"
                required
                defaultValue="Australia"
                className={inputClass}
              />
            </div>
          </div>
        </Section>

        <Section title="Accounts / billing contact">
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="accounts_name">
                Accounts Contact Name
              </label>
              <input id="accounts_name" name="accounts_name" className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="accounts_email">
                Accounts Email Address
              </label>
              <input id="accounts_email" name="accounts_email" type="email" className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="accounts_phone">
                Accounts Phone Number
              </label>
              <input id="accounts_phone" name="accounts_phone" type="tel" className={inputClass} />
            </div>
          </div>
        </Section>
      </div>

      {/* Row 3: credit request + bank reference */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8 md:items-start">
        <Section title="Credit request details">
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="credit_limit">
                Requested Credit Limit <span className="text-red-600">*</span>
              </label>
              <input id="credit_limit" name="credit_limit" required className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="payment_terms">
                Payment Terms <span className="text-red-600">*</span>
              </label>
              <input id="payment_terms" name="payment_terms" required className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="estimated_monthly_purchase">
                Estimated Monthly Purchase <span className="text-red-600">*</span>
              </label>
              <input
                id="estimated_monthly_purchase"
                name="estimated_monthly_purchase"
                required
                className={inputClass}
              />
            </div>
          </div>
        </Section>

        <Section title="Bank reference (optional)">
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="bank_name">
                Bank Name
              </label>
              <input id="bank_name" name="bank_name" className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="bank_branch">
                Branch
              </label>
              <input id="bank_branch" name="bank_branch" className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="bank_account_name">
                Account Name
              </label>
              <input id="bank_account_name" name="bank_account_name" className={inputClass} />
            </div>
          </div>
        </Section>
      </div>

      {/* Row 4: trade references side by side */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8 md:items-start">
        <Section title="Trade references — Reference 1">
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="ref1_company">
                Company Name <span className="text-red-600">*</span>
              </label>
              <input id="ref1_company" name="ref1_company" required className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="ref1_contact">
                Contact Person <span className="text-red-600">*</span>
              </label>
              <input id="ref1_contact" name="ref1_contact" required className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="ref1_phone">
                Phone Number <span className="text-red-600">*</span>
              </label>
              <input id="ref1_phone" name="ref1_phone" type="tel" required className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="ref1_email">
                Email Address <span className="text-red-600">*</span>
              </label>
              <input id="ref1_email" name="ref1_email" type="email" required className={inputClass} />
            </div>
          </div>
        </Section>

        <Section title="Trade references — Reference 2">
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="ref2_company">
                Company Name <span className="text-red-600">*</span>
              </label>
              <input id="ref2_company" name="ref2_company" required className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="ref2_contact">
                Contact Person <span className="text-red-600">*</span>
              </label>
              <input id="ref2_contact" name="ref2_contact" required className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="ref2_phone">
                Phone Number <span className="text-red-600">*</span>
              </label>
              <input id="ref2_phone" name="ref2_phone" type="tel" required className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="ref2_email">
                Email Address <span className="text-red-600">*</span>
              </label>
              <input id="ref2_email" name="ref2_email" type="email" required className={inputClass} />
            </div>
          </div>
        </Section>
      </div>

      <Section title="Document upload">
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm leading-relaxed text-slate-600">
          <p className="font-medium text-slate-700">Supporting documents</p>
          <p className="mt-1">
            Accepted: <span className="font-medium text-slate-800">PDF, JPG, PNG, WebP</span>. Maximum{" "}
            <span className="font-medium text-slate-800">5 MB</span> per file.
          </p>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-4 transition-colors hover:border-teal-200/80 hover:bg-teal-50/20">
            <label className={labelClass} htmlFor="file_registration">
              Upload Business Registration
            </label>
            <input
              id="file_registration"
              name="file_registration"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className={fileInputClass}
            />
          </div>
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-4 transition-colors hover:border-teal-200/80 hover:bg-teal-50/20">
            <label className={labelClass} htmlFor="file_tax">
              Upload Tax / ABN Certificate
            </label>
            <input
              id="file_tax"
              name="file_tax"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className={fileInputClass}
            />
          </div>
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-4 transition-colors hover:border-teal-200/80 hover:bg-teal-50/20">
            <label className={labelClass} htmlFor="file_id">
              Upload ID Proof
            </label>
            <input
              id="file_id"
              name="file_id"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className={fileInputClass}
            />
          </div>
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8 md:items-start">
        <Section title="Agreement">
          <div className="space-y-4">
            <label className="flex min-h-[2.75rem] cursor-pointer items-start gap-3 rounded-xl border border-transparent px-1 py-2 text-sm leading-relaxed text-gray-800 transition-colors hover:border-gray-100 hover:bg-gray-50/80 has-[:focus-visible]:border-teal-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal-600/20">
              <input
                type="checkbox"
                name="agree_accurate"
                value="true"
                className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-gray-300 text-teal-600 focus:ring-teal-600/30"
              />
              <span>
                I confirm the information provided is accurate <span className="text-red-600">*</span>
              </span>
            </label>
            <label className="flex min-h-[2.75rem] cursor-pointer items-start gap-3 rounded-xl border border-transparent px-1 py-2 text-sm leading-relaxed text-gray-800 transition-colors hover:border-gray-100 hover:bg-gray-50/80 has-[:focus-visible]:border-teal-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal-600/20">
              <input
                type="checkbox"
                name="agree_terms"
                value="true"
                className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-gray-300 text-teal-600 focus:ring-teal-600/30"
              />
              <span>
                I agree to the credit terms and conditions <span className="text-red-600">*</span>
              </span>
            </label>
          </div>
        </Section>

        <Section title="Authorization">
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="authorized_name">
                Authorized Person Name <span className="text-red-600">*</span>
              </label>
              <input id="authorized_name" name="authorized_name" required className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="authorized_position">
                Position <span className="text-red-600">*</span>
              </label>
              <input id="authorized_position" name="authorized_position" required className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="signature">
                Signature (type full name) <span className="text-red-600">*</span>
              </label>
              <input id="signature" name="signature" required className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="application_date">
                Date <span className="text-red-600">*</span>
              </label>
              <input id="application_date" name="application_date" type="date" required className={inputClass} />
            </div>
          </div>
        </Section>
      </div>

      <div className="flex flex-col items-stretch sm:items-center">
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-slate-900 px-8 py-3.5 text-sm font-semibold text-white shadow-[0_4px_14px_-3px_rgba(15,23,42,0.45)] transition hover:bg-slate-800 hover:shadow-[0_6px_20px_-4px_rgba(15,23,42,0.5)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55 sm:max-w-md sm:min-w-[280px]"
        >
          {submitting ? "Submitting…" : "Submit Credit Application"}
        </button>
      </div>
    </form>
  );
}
