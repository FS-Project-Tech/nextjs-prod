"use client";

import { useForm, type Resolver } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { useState } from "react";
import { useToast } from "@/components/ToastProvider";

export type CatalogueFormValues = {
  first_name: string;
  last_name: string;
  email: string;
  reason_for_ordering: string;
  business_name: string;
  abn: string;
  contact_number: string;
  number_of_copies: number;
  address: string;
};

const schema = yup.object({
  first_name: yup.string().trim().required("First name is required"),
  last_name: yup.string().trim().required("Last name is required"),
  email: yup.string().trim().email("Invalid email").required("Email is required"),
  reason_for_ordering: yup.string().trim().required("Reason for ordering is required"),
  business_name: yup.string().trim().required("Business name is required"),
  abn: yup
    .string()
    .trim()
    .default("")
    .test("abn", "ABN must be 11 digits", (v) => !v || /^\d{11}$/.test(v.replace(/\s/g, ""))),
  contact_number: yup
    .string()
    .trim()
    .required("Contact number is required")
    .test("phone", "Enter a valid phone number (at least 8 digits)", (v) => {
      const d = (v || "").replace(/\D/g, "");
      return d.length >= 8 && d.length <= 15;
    }),
  number_of_copies: yup
    .number()
    .typeError("Enter a number")
    .integer()
    .min(1, "At least 1 copy")
    .max(500, "Maximum 500 copies")
    .required("Required"),
  address: yup
    .string()
    .trim()
    .min(5, "Please enter your full address")
    .required("Address is required"),
}) as yup.ObjectSchema<CatalogueFormValues>;

export default function RequestForCatalogueForm() {
  const { success, error: showError } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CatalogueFormValues>({
    resolver: yupResolver(schema) as Resolver<CatalogueFormValues>,
    defaultValues: {
      first_name: "",
      last_name: "",
      email: "",
      reason_for_ordering: "",
      business_name: "",
      abn: "",
      contact_number: "",
      number_of_copies: 1,
      address: "",
    },
  });

  const onSubmit = async (data: CatalogueFormValues) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/catalogue-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          abn: data.abn ? data.abn.replace(/\s/g, "") : "",
          number_of_copies: data.number_of_copies,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(typeof json.error === "string" ? json.error : "Submission failed.");
        return;
      }
      success("Thank you — your catalogue request has been sent.");
      reset({
        first_name: "",
        last_name: "",
        email: "",
        reason_for_ordering: "",
        business_name: "",
        abn: "",
        contact_number: "",
        number_of_copies: 1,
        address: "",
      });
    } catch {
      showError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600";
  const labelClass = "block text-sm font-medium text-gray-800";
  const errClass = "mt-1 text-sm text-red-600";

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="mx-auto max-w-4xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
      noValidate
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <label htmlFor="first_name" className={labelClass}>
            First name <span className="text-red-500">*</span>
          </label>
          <input
            id="first_name"
            type="text"
            className={inputClass}
            placeholder="First name"
            {...register("first_name")}
          />
          {errors.first_name && <p className={errClass}>{errors.first_name.message}</p>}
        </div>
        <div>
          <label htmlFor="last_name" className={labelClass}>
            Last name <span className="text-red-500">*</span>
          </label>
          <input
            id="last_name"
            type="text"
            className={inputClass}
            placeholder="Last name"
            {...register("last_name")}
          />
          {errors.last_name && <p className={errClass}>{errors.last_name.message}</p>}
        </div>

        <div>
          <label htmlFor="email" className={labelClass}>
            Email address <span className="text-red-500">*</span>
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className={inputClass}
            placeholder="Email address"
            {...register("email")}
          />
          {errors.email && <p className={errClass}>{errors.email.message}</p>}
        </div>
        <div>
          <label htmlFor="reason_for_ordering" className={labelClass}>
            Reason for ordering <span className="text-red-500">*</span>
          </label>
          <input
            id="reason_for_ordering"
            type="text"
            className={inputClass}
            placeholder="Reason for ordering"
            {...register("reason_for_ordering")}
          />
          {errors.reason_for_ordering && (
            <p className={errClass}>{errors.reason_for_ordering.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="business_name" className={labelClass}>
            Business name <span className="text-red-500">*</span>
          </label>
          <input
            id="business_name"
            type="text"
            className={inputClass}
            placeholder="Business name"
            {...register("business_name")}
          />
          {errors.business_name && <p className={errClass}>{errors.business_name.message}</p>}
        </div>
        <div>
          <label htmlFor="abn" className={labelClass}>
            ABN
          </label>
          <input
            id="abn"
            type="text"
            inputMode="numeric"
            className={inputClass}
            placeholder="ABN (11 digits, optional)"
            {...register("abn")}
          />
          {errors.abn && <p className={errClass}>{errors.abn.message}</p>}
        </div>

        <div>
          <label htmlFor="contact_number" className={labelClass}>
            Contact number <span className="text-red-500">*</span>
          </label>
          <input
            id="contact_number"
            type="tel"
            autoComplete="tel"
            className={inputClass}
            placeholder="Contact number"
            {...register("contact_number")}
          />
          {errors.contact_number && <p className={errClass}>{errors.contact_number.message}</p>}
        </div>
        <div>
          <label htmlFor="number_of_copies" className={labelClass}>
            Number of copies <span className="text-red-500">*</span>
          </label>
          <input
            id="number_of_copies"
            type="number"
            min={1}
            max={500}
            className={inputClass}
            {...register("number_of_copies")}
          />
          {errors.number_of_copies && <p className={errClass}>{errors.number_of_copies.message}</p>}
        </div>
      </div>

      <div className="mt-6">
        <label htmlFor="address" className={labelClass}>
          Address <span className="text-red-500">*</span>
        </label>
        <textarea
          id="address"
          rows={4}
          className={inputClass}
          placeholder="Street, suburb, state, postcode"
          {...register("address")}
        />
        {errors.address && <p className={errClass}>{errors.address.message}</p>}
      </div>

      <div className="mt-8 flex justify-center">
        <button
          type="submit"
          disabled={submitting}
          className="min-w-[200px] rounded-lg bg-[#1f605f] px-8 py-3 text-sm font-semibold text-white shadow transition hover:bg-[#174a49] disabled:opacity-60"
        >
          {submitting ? "Sending…" : "Send Message"}
        </button>
      </div>
    </form>
  );
}
