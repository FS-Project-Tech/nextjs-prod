"use client";

import { Controller, type Control } from "react-hook-form";
import type { CheckoutFormData } from "@/lib/checkout/schema";
import { FOCUS_RING } from "@/lib/checkout/uiConstants";

export type AdditionalSectionProps = {
  control: Control<CheckoutFormData>;
};

export default function AdditionalSection({ control }: AdditionalSectionProps) {
  return (
    <section className="rounded-xl bg-white p-6" aria-labelledby="checkout-additional-heading">
      <h2 id="checkout-additional-heading" className="mb-4 text-lg font-semibold text-gray-900">
        Additional information
      </h2>

      <div className="space-y-6">
        <Controller
          name="deliveryAuthority"
          control={control}
          render={({ field }) => (
            <fieldset className="min-w-0 border-0 p-0">
              <legend className="mb-2 block text-sm font-medium text-gray-900">
                Delivery authority
              </legend>
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
                <label className="flex cursor-pointer items-center gap-2 text-gray-900">
                  <input
                    type="radio"
                    name="checkout-delivery-authority"
                    value="with_signature"
                    checked={field.value !== "without_signature"}
                    onChange={() => field.onChange("with_signature")}
                    className={`h-4 w-4 border-gray-300 text-gray-900 ${FOCUS_RING}`}
                  />
                  <span className="text-sm">Signature required on delivery</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-gray-900">
                  <input
                    type="radio"
                    name="checkout-delivery-authority"
                    value="without_signature"
                    checked={field.value === "without_signature"}
                    onChange={() => field.onChange("without_signature")}
                    className={`h-4 w-4 border-gray-300 text-gray-900 ${FOCUS_RING}`}
                  />
                  <span className="text-sm">No signature required</span>
                </label>
              </div>
            </fieldset>
          )}
        />

        <label className="flex cursor-pointer items-center gap-2 text-gray-900">
          <Controller
            name="doNotSendPaperwork"
            control={control}
            render={({ field: { value, onChange, ...field } }) => (
              <input
                type="checkbox"
                {...field}
                checked={!!value}
                onChange={(e) => onChange(e.target.checked)}
                className={`h-4 w-4 rounded border-gray-300 text-gray-900 ${FOCUS_RING}`}
              />
            )}
          />
          <span className="text-sm">
            Do not send paperwork with delivery{" "}
            <span className="text-gray-600">(optional)</span>
          </span>
        </label>

        <label className="flex cursor-pointer items-center gap-2 text-gray-900">
          <Controller
            name="discreetPackaging"
            control={control}
            render={({ field: { value, onChange, ...field } }) => (
              <input
                type="checkbox"
                {...field}
                checked={value || false}
                onChange={(e) => onChange(e.target.checked)}
                className={`h-4 w-4 rounded border-gray-300 text-gray-900 ${FOCUS_RING}`}
              />
            )}
          />
          <span className="text-sm">
            Discreet packaging <span className="text-gray-600">(optional)</span>
          </span>
        </label>

        <label className="flex cursor-pointer items-center gap-2 text-gray-900">
          <Controller
            name="subscribe_newsletter"
            control={control}
            render={({ field: { value, onChange, ...field } }) => (
              <input
                type="checkbox"
                {...field}
                checked={value || false}
                onChange={(e) => onChange(e.target.checked)}
                className={`h-4 w-4 rounded border-gray-300 text-gray-900 ${FOCUS_RING}`}
              />
            )}
          />
          <span className="text-sm">Subscribe to our newsletter</span>
        </label>

        <div>
          <label
            htmlFor="checkout-delivery-instructions"
            className="mb-1 block text-sm font-medium text-gray-900"
          >
            Delivery instructions <span className="font-normal text-gray-600">(optional)</span>
          </label>
          <Controller
            name="deliveryInstructions"
            control={control}
            render={({ field }) => (
              <textarea
                {...field}
                id="checkout-delivery-instructions"
                rows={3}
                placeholder="Special delivery instructions…"
                className={`w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 ${FOCUS_RING}`}
              />
            )}
          />
        </div>
      </div>
    </section>
  );
}
