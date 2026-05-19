"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import Image from "next/image";
import { useForm, Controller } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useSession } from "next-auth/react";
import { usePriceMatch } from "@/components/PriceMatchProvider";
import { useToast } from "@/components/ToastProvider";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import RequiredMark from "@/components/checkout/RequiredMark";
import { FOCUS_RING } from "@/lib/checkout/uiConstants";
import { digitsOnly } from "@/lib/form-validation";
import { sanitizeString } from "@/lib/sanitize";
import {
  priceMatchFormSchema,
  PRICE_MATCH_FORM_DEFAULTS,
  type PriceMatchFormData,
} from "@/lib/price-match/schema";
import type { PriceMatchEvidenceFile } from "@/lib/price-match/types";

const drawerTransitionClass =
  "transition-[transform,opacity] duration-320 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none";

async function fileToEvidence(file: File): Promise<PriceMatchEvidenceFile> {
  const maxBytes = 4 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error("File must be 4 MB or smaller");
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve({
        name: file.name,
        mime: file.type || "application/octet-stream",
        base64,
      });
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function PriceMatchDrawer() {
  const { isOpen, close, product } = usePriceMatch();
  const { success, error: showError } = useToast();
  const { data: session } = useSession();
  const user = session?.user ?? null;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const form = useForm<PriceMatchFormData>({
    resolver: yupResolver(priceMatchFormSchema) as never,
    defaultValues: PRICE_MATCH_FORM_DEFAULTS,
    mode: "onSubmit",
  });

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = form;

  const evidenceMode = watch("evidence_mode");

  useBodyScrollLock(isOpen);

  const handleEscape = useCallback(() => close(), [close]);

  const { containerRef } = useFocusTrap({
    enabled: isOpen,
    onEscape: handleEscape,
    initialFocusSelector: 'button[aria-label="Close price match"]',
  });

  useEffect(() => {
    if (!isOpen) {
      reset(PRICE_MATCH_FORM_DEFAULTS);
      setSelectedFile(null);
      return;
    }
    if (!user) return;
    const email = user.email?.trim();
    if (email) setValue("billing_email", email, { shouldDirty: false });
    const name = user.name?.trim();
    if (name) {
      const parts = name.split(/\s+/).filter(Boolean);
      if (parts[0]) setValue("billing_first_name", parts[0], { shouldDirty: false });
      if (parts.length > 1) {
        setValue("billing_last_name", parts.slice(1).join(" "), { shouldDirty: false });
      }
    }
  }, [isOpen, user, reset, setValue]);

  const onSubmit = useCallback(
    async (values: PriceMatchFormData) => {
      if (!product) {
        showError("Product information is missing. Please try again from the product page.");
        return;
      }

      let evidenceFile: PriceMatchEvidenceFile | undefined;
      if (values.evidence_mode === "file" || values.evidence_mode === "photo") {
        if (!selectedFile) {
          showError(
            values.evidence_mode === "photo"
              ? "Please take or upload a photo"
              : "Please upload a quote file",
          );
          return;
        }
        try {
          evidenceFile = await fileToEvidence(selectedFile);
        } catch (err: unknown) {
          showError(err instanceof Error ? err.message : "Could not read file");
          return;
        }
      }

      const firstName = values.billing_first_name.trim();
      const lastName = values.billing_last_name.trim();
      const userName = `${firstName} ${lastName}`.trim();

      setIsSubmitting(true);
      try {
        const response = await fetch("/api/price-match/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: values.billing_email.trim(),
            userName,
            phone: values.billing_phone.trim(),
            product,
            askPrice: values.ask_price.trim(),
            priceIncludesGst: values.price_includes_gst,
            evidenceMode: values.evidence_mode,
            competitorLink:
              values.evidence_mode === "link" ? values.competitor_link?.trim() : undefined,
            evidenceFile,
            notes: values.notes?.trim() || undefined,
          }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to submit price match request");

        const ref = data.quote_number || data.quote_id || "your request";
        success(`Price match ${ref} submitted! Check your email for confirmation.`);
        close();
      } catch (err: unknown) {
        showError(err instanceof Error ? err.message : "Failed to submit price match request");
      } finally {
        setIsSubmitting(false);
      }
    },
    [product, selectedFile, close, showError, success],
  );

  const safeName = sanitizeString(product?.name || "");
  const safeSku = sanitizeString(product?.sku || "");
  const attrLines = product?.attributes
    ? Object.entries(product.attributes).map(([k, v]) => ({
        key: sanitizeString(k),
        value: sanitizeString(String(v)),
      }))
    : [];

  return (
    <div
      className={`fixed inset-0 z-[2147483647] overscroll-none ${isOpen ? "pointer-events-auto" : "pointer-events-none"}`}
      aria-hidden={!isOpen}
    >
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm ${drawerTransitionClass} ${isOpen ? "opacity-100" : "opacity-0"}`}
        onClick={close}
      />
      <aside
        ref={containerRef as RefObject<HTMLElement>}
        role="dialog"
        aria-modal="true"
        aria-label="Price match drawer"
        className={`absolute right-0 top-0 flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col overflow-hidden bg-white shadow-2xl will-change-transform md:max-w-xl lg:max-w-2xl xl:max-w-[44rem] ${drawerTransitionClass} ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 sm:px-6">
          <h2 className="text-lg font-bold text-gray-900">Price Match</h2>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Close price match"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!product ? (
          <p className="p-6 text-sm text-gray-600">Select a product to request a price match.</p>
        ) : (
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col"
            noValidate
          >
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-5 sm:px-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Email" required error={errors.billing_email?.message}>
                  <Controller
                    name="billing_email"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="email"
                        autoComplete="email"
                        placeholder="Enter email address"
                        className={inputClass(!!errors.billing_email)}
                      />
                    )}
                  />
                </Field>
                <Field label="Phone" required error={errors.billing_phone?.message}>
                  <Controller
                    name="billing_phone"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="tel"
                        autoComplete="tel"
                        placeholder="Enter phone number"
                        maxLength={10}
                        onChange={(e) => field.onChange(digitsOnly(e.target.value).slice(0, 10))}
                        className={inputClass(!!errors.billing_phone)}
                      />
                    )}
                  />
                </Field>
                <Field label="First name" required error={errors.billing_first_name?.message}>
                  <Controller
                    name="billing_first_name"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        autoComplete="given-name"
                        placeholder="Enter first name"
                        className={inputClass(!!errors.billing_first_name)}
                      />
                    )}
                  />
                </Field>
                <Field label="Last name" required error={errors.billing_last_name?.message}>
                  <Controller
                    name="billing_last_name"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        autoComplete="family-name"
                        placeholder="Enter last name"
                        className={inputClass(!!errors.billing_last_name)}
                      />
                    )}
                  />
                </Field>
              </div>

              <div className="flex gap-3 rounded-lg border border-gray-200 p-3">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                  {product.imageUrl?.trim() ? (
                    <Image
                      src={product.imageUrl}
                      alt={safeName}
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-xs text-gray-500">
                      No image
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold text-gray-900 line-clamp-3">{safeName}</p>
                  {safeSku ? <p className="mt-1 text-gray-500">Item Number: {safeSku}</p> : null}
                  {attrLines.map((a) => (
                    <p key={`${a.key}-${a.value}`} className="mt-1 text-gray-600">
                      {a.key} — {a.value}
                    </p>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[8rem]">
                  <p className="text-xs font-medium text-gray-500">Current price</p>
                  <p className="text-sm font-semibold text-gray-900">{product.currentPriceLabel}</p>
                </div>
                <Field label="Ask Price" required error={errors.ask_price?.message} className="flex-1 min-w-[8rem]">
                  <Controller
                    name="ask_price"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="text"
                        inputMode="decimal"
                        placeholder="Ask Price"
                        className={inputClass(!!errors.ask_price)}
                      />
                    )}
                  />
                </Field>
                <label className="flex items-center gap-2 pb-2.5 text-sm text-gray-700">
                  <Controller
                    name="price_includes_gst"
                    control={control}
                    render={({ field }) => (
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                      />
                    )}
                  />
                  Incl. GST
                </label>
              </div>

              <div>
                <p className="mb-3 text-sm font-semibold text-gray-900">Price evidence</p>
                <Controller
                  name="evidence_mode"
                  control={control}
                  render={({ field }) => (
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { value: "link" as const, label: "Competitors Link", icon: "globe" },
                          { value: "file" as const, label: "Upload quote from file", icon: "upload" },
                          { value: "photo" as const, label: "Take a mobile photo", icon: "camera" },
                        ] as const
                      ).map((opt) => {
                        const active = field.value === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              field.onChange(opt.value);
                              setSelectedFile(null);
                            }}
                            className={`flex flex-col items-center gap-2 rounded-lg border px-2 py-3 text-center text-xs font-medium transition-colors ${active ? "border-teal-600 bg-teal-50 text-teal-900" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}
                          >
                            <EvidenceIcon kind={opt.icon} />
                            <span>{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                />

                {evidenceMode === "link" ? (
                  <div className="mt-3">
                    <Controller
                      name="competitor_link"
                      control={control}
                      render={({ field }) => (
                        <input
                          {...field}
                          type="url"
                          placeholder="https://competitor.example/product"
                          className={inputClass(!!errors.competitor_link)}
                        />
                      )}
                    />
                    {errors.competitor_link?.message ? (
                      <p className="mt-1 text-xs text-rose-700">{errors.competitor_link.message}</p>
                    ) : null}
                  </div>
                ) : null}

                {evidenceMode === "file" ? (
                  <div className="mt-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      {selectedFile ? selectedFile.name : "Choose file to upload"}
                    </button>
                  </div>
                ) : null}

                {evidenceMode === "photo" ? (
                  <div className="mt-3">
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                    />
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="w-full rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      {selectedFile ? selectedFile.name : "Take or choose a photo"}
                    </button>
                  </div>
                ) : null}
              </div>

              <Field label="Notes" optional error={errors.notes?.message}>
                <Controller
                  name="notes"
                  control={control}
                  render={({ field }) => (
                    <textarea
                      {...field}
                      rows={4}
                      placeholder="Notes (Optional)"
                      className={`${inputClass(false)} resize-y`}
                    />
                  )}
                />
              </Field>
            </div>

            <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-4 sm:px-6">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={close}
                  disabled={isSubmitting}
                  className={`flex-1 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-60 ${FOCUS_RING}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`btn-brand flex-1 rounded-lg px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 ${FOCUS_RING}`}
                >
                  {isSubmitting ? "Submitting..." : "Submit"}
                </button>
              </div>
            </div>
          </form>
        )}
      </aside>
    </div>
  );
}

function Field({
  label,
  required,
  optional,
  error,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-gray-700">
        {label}
        {required ? (
          <>
            {" "}
            <RequiredMark />
          </>
        ) : null}
        {optional ? <span className="font-normal text-gray-500"> (Optional)</span> : null}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}

function inputClass(hasError: boolean): string {
  return `w-full rounded-lg border px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 ${FOCUS_RING} ${hasError ? "border-rose-600" : "border-gray-300"}`;
}

function EvidenceIcon({ kind }: { kind: "globe" | "upload" | "camera" }) {
  if (kind === "globe") {
    return (
      <svg className="h-8 w-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 9h16.8M3.6 15h16.8M12 3c2.2 2.5 3.4 5.8 3.4 9s-1.2 6.5-3.4 9c-2.2-2.5-3.4-5.8-3.4-9S9.8 5.5 12 3z" />
      </svg>
    );
  }
  if (kind === "upload") {
    return (
      <svg className="h-8 w-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12" />
      </svg>
    );
  }
  return (
    <svg className="h-8 w-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
