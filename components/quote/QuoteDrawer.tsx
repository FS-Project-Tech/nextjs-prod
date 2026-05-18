"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import Image from "next/image";
import { useForm, Controller, useWatch } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { useSession } from "next-auth/react";
import { useQuote } from "@/components/QuoteProvider";
import { useToast } from "@/components/ToastProvider";
import type { Address } from "@/hooks/useAddresses";
import { fetchDashboardAddresses } from "@/lib/quote/fetchDashboardAddresses";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import RequiredMark from "@/components/checkout/RequiredMark";
import QuoteNdisPanel from "@/components/quote/QuoteNdisPanel";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { formatPrice } from "@/lib/format-utils";
import { sanitizeString } from "@/lib/sanitize";
import { nameCharsOnly, digitsOnly } from "@/lib/form-validation";
import { FOCUS_RING } from "@/lib/checkout/uiConstants";
import { quoteFormSchema, type QuoteFormData } from "@/lib/quote/schema";
import { QUOTE_FORM_DEFAULTS } from "@/lib/quote/formDefaults";
import { quoteFormToContactPayload } from "@/lib/quote/quoteFormContact";
import { buildQuoteNdisInfoJson } from "@/lib/quote/quoteNdisPayload";
import {
  applyShippingAddressToQuoteForm,
  applyUserProfileToQuoteForm,
} from "@/lib/quote/prefillQuoteForm";
import { pickPrimaryQuoteAddresses } from "@/lib/quote-request-addresses";
import { parseCartTotal } from "@/lib/cart/pricing";
import type { CartItem } from "@/lib/types/cart";
import { canIncrementQty, getStockCap } from "@/lib/woo/stockLimit";

const QuoteLineItem = memo(function QuoteLineItem({
  item,
  onRemove,
  onUpdateQty,
}: {
  item: CartItem;
  onRemove: (id: string) => void;
  onUpdateQty: (id: string, qty: number) => void;
}) {
  const safeName = sanitizeString(item.name || "");
  const safeSku = sanitizeString(item.sku || "");
  const stockCap = useMemo(
    () =>
      getStockCap({
        manage_stock: item.manageStock,
        stock_quantity: item.stockQuantity,
      }),
    [item.manageStock, item.stockQuantity],
  );

  const attrs = useMemo(() => {
    if (!item.attributes) return [];
    return Object.entries(item.attributes).map(([key, value]) => ({
      key: sanitizeString(String(key)),
      value: sanitizeString(String(value)),
    }));
  }, [item.attributes]);

  return (
    <div className="flex gap-3 border-b border-gray-100 py-4">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100">
        {item.imageUrl?.trim() ? (
          <Image src={item.imageUrl} alt={safeName} fill sizes="64px" className="object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-[10px] text-gray-500">
            No image
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {safeSku ? <p className="text-xs text-gray-500">{safeSku}</p> : null}
        <p className="text-sm font-medium text-gray-900 line-clamp-2">{safeName}</p>
        {attrs.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {attrs.map((a) => (
              <p key={`${a.key}-${a.value}`} className="text-xs text-gray-600">
                {a.key}: {a.value}
              </p>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center rounded-lg border border-gray-200">
            <button
              type="button"
              onClick={() => item.qty > 1 && onUpdateQty(item.id, item.qty - 1)}
              className="px-2.5 py-1 text-gray-600 hover:bg-gray-50"
              aria-label="Decrease quantity"
            >
              -
            </button>
            <span className="min-w-[2rem] px-2 text-center text-sm font-medium">{item.qty}</span>
            <button
              type="button"
              onClick={() => {
                if (canIncrementQty(item.qty, stockCap)) onUpdateQty(item.id, item.qty + 1);
              }}
              disabled={!canIncrementQty(item.qty, stockCap)}
              className="px-2.5 py-1 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">
              {formatPrice(parseFloat(item.price || "0") * item.qty)}
            </span>
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="p-1 text-gray-400 hover:text-rose-600"
              aria-label="Remove item"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default function QuoteDrawer() {
  const {
    isOpen,
    close,
    ndisPanelOpen,
    closeNdisPanel,
    openNdisPanel,
    items,
    removeItem,
    updateItemQty,
    clear,
    total,
    itemCount,
  } = useQuote();
  const { success, error: showError } = useToast();
  const { data: session } = useSession();
  const user = session?.user ?? null;
  const userId = user?.id ? String(user.id) : null;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const prefillDoneRef = useRef(false);

  const form = useForm<QuoteFormData>({
    resolver: yupResolver(quoteFormSchema) as never,
    defaultValues: QUOTE_FORM_DEFAULTS,
    mode: "onSubmit",
  });

  const { control, handleSubmit, setValue, formState: { errors } } = form;

  const applySavedAddressesToForm = useCallback(
    (addresses: Address[]) => {
      const shippingRow =
        addresses.find((a) => String(a.id) === "default-shipping") ??
        addresses.find((a) => a.type === "shipping");
      const billingRow =
        addresses.find((a) => String(a.id) === "default-billing") ??
        addresses.find((a) => a.type === "billing");
      const row = shippingRow ?? billingRow;
      if (row) {
        applyShippingAddressToQuoteForm(setValue, row);
        return;
      }
      if (addresses.length === 0) return;
      const picked = pickPrimaryQuoteAddresses(addresses as unknown as Record<string, unknown>[]);
      const snap = picked.shipping ?? picked.billing;
      if (!snap) return;
      if (snap.first_name) setValue("billing_first_name", snap.first_name);
      if (snap.last_name) setValue("billing_last_name", snap.last_name);
      if (snap.email) setValue("billing_email", snap.email);
      if (snap.phone) setValue("billing_phone", snap.phone);
      if (snap.company) setValue("billing_company", snap.company);
      if (snap.address_1) setValue("shipping_address_1", snap.address_1);
      if (snap.address_2) setValue("shipping_address_2", snap.address_2);
      if (snap.city) setValue("shipping_city", snap.city);
      if (snap.state) setValue("shipping_state", snap.state);
      if (snap.postcode) setValue("shipping_postcode", snap.postcode);
      if (snap.country) setValue("shipping_country", snap.country);
    },
    [setValue],
  );
  const sameAddressForBilling = useWatch({ control, name: "sameAddressForBilling", defaultValue: true });

  const subtotal = useMemo(() => parseCartTotal(total), [total]);

  useBodyScrollLock(isOpen);

  const { containerRef } = useFocusTrap({
    enabled: isOpen,
    onEscape: close,
    initialFocusSelector: 'button[aria-label="Close quote"]',
  });

  useEffect(() => {
    prefillDoneRef.current = false;
  }, [userId]);

  useEffect(() => {
    if (!isOpen) {
      prefillDoneRef.current = false;
      return;
    }
    if (prefillDoneRef.current) return;
    if (!user) {
      prefillDoneRef.current = true;
      return;
    }

    let cancelled = false;
    prefillDoneRef.current = true;
    applyUserProfileToQuoteForm(setValue, user);

    void (async () => {
      const addresses = await fetchDashboardAddresses();
      if (cancelled) return;
      applySavedAddressesToForm(addresses);
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, user, userId, setValue, applySavedAddressesToForm]);

  const onSubmit = useCallback(
    async (values: QuoteFormData) => {
      if (items.length === 0) {
        showError("Add at least one product to your quote.");
        return;
      }

      const contact = quoteFormToContactPayload(values);
      if (!contact) {
        showError("Please complete your contact details.");
        return;
      }

      setIsSubmitting(true);
      try {
        const ndis_info = buildQuoteNdisInfoJson(values);
        const response = await fetch("/api/quote/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: contact.email,
            userName: contact.userName,
            items: items.map((item) => ({
              name: item.name,
              sku: item.sku || null,
              price: item.price,
              qty: item.qty,
              product_id: item.productId,
              variation_id: item.variationId,
              attributes: item.attributes || {},
              deliveryPlan: item.deliveryPlan || "none",
            })),
            subtotal,
            shipping: 0,
            shippingMethod: "",
            discount: 0,
            total: subtotal,
            notes: values.quote_notes?.trim() || undefined,
            billing_address: contact.billing_address,
            shipping_address: contact.shipping_address,
            ...(ndis_info ? { ndis_info } : {}),
          }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to submit quote");

        const quoteNumber = data.quote_number || data.quote_id || "your quote";
        success(`Quote ${quoteNumber} submitted! Check your email for details.`);
        clear();
        form.reset(QUOTE_FORM_DEFAULTS);
        close();
      } catch (err: unknown) {
        showError(err instanceof Error ? err.message : "Failed to submit quote");
      } finally {
        setIsSubmitting(false);
      }
    },
    [items, subtotal, clear, close, form, showError, success],
  );

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-[2147483647] overscroll-none ${isOpen ? "pointer-events-auto" : "pointer-events-none"}`}
      aria-hidden={!isOpen}
    >
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity ${isOpen ? "opacity-100" : "opacity-0"}`}
        onClick={close}
      />
      <aside
        ref={containerRef as RefObject<HTMLElement>}
        role="dialog"
        aria-modal="true"
        aria-label="Quote drawer"
        className={`absolute right-0 top-0 flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col overflow-hidden bg-white shadow-2xl transition-transform duration-300 ease-out md:max-w-xl lg:max-w-2xl xl:max-w-[44rem] ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        {ndisPanelOpen ? (
          <QuoteNdisPanel
            control={control}
            errors={errors}
            setValue={setValue}
            onBack={closeNdisPanel}
          />
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h2 className="text-lg font-bold text-gray-900">
                Quote
                {itemCount > 0 && (
                  <span className="ml-2 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white">
                    {itemCount > 99 ? "99+" : itemCount}
                  </span>
                )}
              </h2>
              <button
                type="button"
                onClick={close}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                aria-label="Close quote"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-5 sm:px-6 sm:py-5">
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
                          type="text"
                          autoComplete="given-name"
                          onChange={(e) => field.onChange(nameCharsOnly(e.target.value))}
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
                          type="text"
                          autoComplete="family-name"
                          onChange={(e) => field.onChange(nameCharsOnly(e.target.value))}
                          className={inputClass(!!errors.billing_last_name)}
                        />
                      )}
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Company" optional error={undefined}>
                      <Controller
                        name="billing_company"
                        control={control}
                        render={({ field }) => (
                          <input {...field} type="text" className={inputClass(false)} />
                        )}
                      />
                    </Field>
                  </div>
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900">Shipping Address</h3>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-700">
                      <Controller
                        name="sameAddressForBilling"
                        control={control}
                        render={({ field: { value, onChange, ...rest } }) => (
                          <input
                            type="checkbox"
                            checked={value ?? true}
                            onChange={(e) => onChange(e.target.checked)}
                            className={`h-4 w-4 rounded border-gray-300 ${FOCUS_RING}`}
                            {...rest}
                          />
                        )}
                      />
                      Same address for billing
                    </label>
                  </div>

                  <div className="space-y-3">
                    <Field label="Address" required error={errors.shipping_address_1?.message}>
                      <Controller
                        name="shipping_address_1"
                        control={control}
                        render={({ field }) => (
                          <AddressAutocomplete
                            value={field.value}
                            onChange={field.onChange}
                            onPlaceSelect={(addr) => {
                              if (addr.address_2) setValue("shipping_address_2", addr.address_2);
                              setValue("shipping_city", addr.city);
                              setValue("shipping_state", addr.state);
                              setValue("shipping_postcode", addr.postcode);
                              setValue("shipping_country", addr.country || "AU");
                            }}
                            placeholder="Address"
                            className={inputClass(!!errors.shipping_address_1)}
                          />
                        )}
                      />
                    </Field>
                    <Field label="Apartment, suite, etc." optional>
                      <Controller
                        name="shipping_address_2"
                        control={control}
                        render={({ field }) => (
                          <input {...field} type="text" className={inputClass(false)} />
                        )}
                      />
                    </Field>
                    <Field label="Suburb" required error={errors.shipping_city?.message}>
                      <Controller
                        name="shipping_city"
                        control={control}
                        render={({ field }) => (
                          <input {...field} type="text" className={inputClass(!!errors.shipping_city)} />
                        )}
                      />
                    </Field>
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="State" required error={errors.shipping_state?.message}>
                        <Controller
                          name="shipping_state"
                          control={control}
                          render={({ field }) => (
                            <input {...field} type="text" className={inputClass(!!errors.shipping_state)} />
                          )}
                        />
                      </Field>
                      <Field label="Country" required error={errors.shipping_country?.message}>
                        <Controller
                          name="shipping_country"
                          control={control}
                          render={({ field }) => (
                            <select {...field} className={inputClass(!!errors.shipping_country)}>
                              <option value="AU">Australia</option>
                              <option value="NZ">New Zealand</option>
                            </select>
                          )}
                        />
                      </Field>
                      <Field label="Post code" required error={errors.shipping_postcode?.message}>
                        <Controller
                          name="shipping_postcode"
                          control={control}
                          render={({ field }) => (
                            <input {...field} type="text" className={inputClass(!!errors.shipping_postcode)} />
                          )}
                        />
                      </Field>
                    </div>
                  </div>

                  {!sameAddressForBilling && (
                    <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                      <h4 className="text-sm font-semibold text-gray-900">Billing address</h4>
                      <Field label="Address" required error={errors.billing_address_1?.message}>
                        <Controller
                          name="billing_address_1"
                          control={control}
                          render={({ field }) => (
                            <AddressAutocomplete
                              value={field.value}
                              onChange={field.onChange}
                              onPlaceSelect={(addr) => {
                                if (addr.address_2) setValue("billing_address_2", addr.address_2);
                                setValue("billing_city", addr.city);
                                setValue("billing_state", addr.state);
                                setValue("billing_postcode", addr.postcode);
                                setValue("billing_country", addr.country || "AU");
                              }}
                              placeholder="Address"
                              className={inputClass(!!errors.billing_address_1)}
                            />
                          )}
                        />
                      </Field>
                      <Field label="Suburb" required error={errors.billing_city?.message}>
                        <Controller
                          name="billing_city"
                          control={control}
                          render={({ field }) => (
                            <input {...field} type="text" className={inputClass(!!errors.billing_city)} />
                          )}
                        />
                      </Field>
                      <div className="grid grid-cols-3 gap-2">
                        <Field label="State" required error={errors.billing_state?.message}>
                          <Controller
                            name="billing_state"
                            control={control}
                            render={({ field }) => (
                              <input {...field} type="text" className={inputClass(!!errors.billing_state)} />
                            )}
                          />
                        </Field>
                        <Field label="Country" required error={errors.billing_country?.message}>
                          <Controller
                            name="billing_country"
                            control={control}
                            render={({ field }) => (
                              <select {...field} className={inputClass(!!errors.billing_country)}>
                                <option value="AU">Australia</option>
                                <option value="NZ">New Zealand</option>
                              </select>
                            )}
                          />
                        </Field>
                        <Field label="Post code" required error={errors.billing_postcode?.message}>
                          <Controller
                            name="billing_postcode"
                            control={control}
                            render={({ field }) => (
                              <input {...field} type="text" className={inputClass(!!errors.billing_postcode)} />
                            )}
                          />
                        </Field>
                      </div>
                    </div>
                  )}

                  <Field label="Notes" optional className="mt-3">
                    <Controller
                      name="quote_notes"
                      control={control}
                      render={({ field }) => (
                        <textarea
                          {...field}
                          rows={3}
                          className={`${inputClass(false)} resize-none`}
                        />
                      )}
                    />
                  </Field>
                </div>

                {items.length > 0 ? (
                  <div className="border-t border-gray-200 pt-2">
                    {items.map((item) => (
                      <QuoteLineItem
                        key={item.id}
                        item={item}
                        onRemove={removeItem}
                        onUpdateQty={updateItemQty}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 py-4 text-center">Your quote is empty.</p>
                )}
              </div>

              <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-4 sm:px-6">
                <div className="mb-3 flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium">{formatPrice(subtotal)}</span>
                </div>
                <div className="mb-4 flex justify-between">
                  <span className="font-semibold text-gray-900">Total</span>
                  <span className="font-bold text-gray-900">{formatPrice(subtotal)}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={openNdisPanel}
                    className="flex shrink-0 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  >
                    <span className="inline-flex h-6 w-8 items-center justify-center rounded bg-violet-700 text-[9px] font-bold uppercase text-white">
                      ndis
                    </span>
                    NDIS Options
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || items.length === 0}
                    className="btn-brand flex-1 rounded-lg px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {isSubmitting ? "Submitting..." : "Submit"}
                  </button>
                </div>
              </div>
            </form>
          </>
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
  return `w-full rounded-lg border px-3 py-2.5 text-sm text-gray-900 ${FOCUS_RING} ${hasError ? "border-rose-600" : "border-gray-300"}`;
}



