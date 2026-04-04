"use client";

import { useEffect, useState, Suspense, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useForm, Controller } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { useCart } from "@/components/CartProvider";
import Image from "next/image";
import Link from "next/link";
import { useToast } from "@/components/ToastProvider";
import { getCartUrl } from "@/lib/access-token";
import { useAddresses } from "@/hooks/useAddresses";
import { useUser } from "@/hooks/useUser";
import { useCoupon } from "@/components/CouponProvider";
import CouponInput from "@/components/CouponInput";
import ShippingOptions from "@/components/ShippingOptions";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { parseCartTotal } from "@/lib/cart-utils";
import { useCheckoutTotals } from "@/hooks/useCheckoutTotals";
import ParcelProtection from "@/components/ParcelProtection";
import {
  CHECKOUT_INSURANCE_STORAGE_KEY,
  PARCEL_PROTECTION_FEE_AUD,
  type InsuranceOption,
} from "@/lib/checkout-parcel-protection";
import { formatPrice } from "@/lib/format-utils";
import { isValidName, isValidAuPhone, nameCharsOnly, digitsOnly } from "@/lib/form-validation";

interface ShippingMethodType {
  id: string;
  method_id: string;
  label: string;
  cost: number;
  total: number;
  description?: string;
}


const checkoutSchema = yup.object({
  billing_first_name: yup.string().required("First name is required").test("name-format", "Letters, spaces, hyphens and apostrophes only", (v) => !v?.trim() || isValidName(v)),
  billing_last_name: yup.string().required("Last name is required").test("name-format", "Letters, spaces, hyphens and apostrophes only", (v) => !v?.trim() || isValidName(v)),
  billing_email: yup.string().email("Invalid email").required("Email is required"),
  billing_phone: yup.string().required("Phone is required").test("phone-format", "Phone must be 8–10 digits", (v) => !v?.trim() || isValidAuPhone(v)),
  billing_company: yup.string().optional(),
  billing_address_1: yup.string().required("Address is required"),
  billing_address_2: yup.string().optional(),
  billing_city: yup.string().required("City is required"),
  billing_postcode: yup.string().required("Postcode is required"),
  billing_country: yup.string().required("Country is required"),
  billing_state: yup.string().required("State is required"),
  shipping_first_name: yup.string().optional().test("name-format", "Letters, spaces, hyphens and apostrophes only", (v) => !v?.trim() || isValidName(v)),
  shipping_last_name: yup.string().optional().test("name-format", "Letters, spaces, hyphens and apostrophes only", (v) => !v?.trim() || isValidName(v)),
  shipping_company: yup.string().optional(),
  shipping_address_1: yup.string().optional(),
  shipping_address_2: yup.string().optional(),
  shipping_city: yup.string().optional(),
  shipping_postcode: yup.string().optional(),
  shipping_country: yup.string().optional(),
  shipping_state: yup.string().optional(),
  shippingMethod: yup.object<ShippingMethodType>({
    id: yup.string().required(),
    method_id: yup.string().required(),
    label: yup.string().required(),
    cost: yup.number().required(),
    total: yup.number().required(),
    description: yup.string().optional(),
  }).required("Please select a shipping method"),
  shipToDifferentAddress: yup.boolean().default(false),
  deliveryAuthority: yup.string().default("with_signature"),
  deliveryInstructions: yup.string().optional(),
  doNotSendPaperwork: yup.boolean().optional(),
  discreetPackaging: yup.boolean().optional(),
  ndis_number: yup.string().optional(),
  ndis_participant_name: yup.string().optional(),
  ndis_dob: yup.string().optional(),
  ndis_funding_type: yup.string().optional(),
  ndis_approval: yup.boolean().optional(),
  billing_ndis_invoice_email: yup.string().email("Invalid email").optional(),
  hcp_number: yup.string().optional(),
  hcp_participant_name: yup.string().optional(),
  hcp_provider_email: yup.string().optional(),
  hcp_approval: yup.boolean().optional(),
  cust_woo_ndis_participant_name: yup.string().optional(),
  cust_woo_ndis_number: yup.string().optional(),
  cust_woo_ndis_dob: yup.string().optional(),
  cust_woo_ndis_funding_type: yup.string().optional(),
  cust_woo_invoice_email: yup.string().email("Invalid email").optional(),
  cust_woo_ndis_approval: yup.boolean().optional(),
  cust_woo_hcp_participant_name: yup.string().optional(),
  cust_woo_hcp_number: yup.string().optional(),
  cust_woo_provider_email: yup.string().optional(),
  cust_woo_hcp_approval: yup.boolean().optional(),
  subscribe_newsletter: yup.boolean().default(false),
  insurance_option: yup
    .string()
    .oneOf(["yes", "no"] as const)
    .default("no"),
  termsAccepted: yup.boolean().oneOf([true], "You must accept the terms and conditions").required(),
});

type CheckoutFormData = yup.InferType<typeof checkoutSchema>;

const ON_ACCOUNT_BANK_LINES = [
  { label: "Bank name", value: "National Australia Bank" },
  { label: "Account name", value: "Joya Medical Australia Pty Ltd" },
  { label: "Account number", value: "852237649" },
  { label: "BSB number", value: "084-004" },
] as const;

/** Decode body as UTF-8 from bytes (avoids rare empty `text()` with some proxies/encodings). */
async function readResponseBodyText(res: Response): Promise<string> {
  const buf = await res.arrayBuffer();
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

function getResponseHeaderInsensitive(
  res: Response,
  headerName: string
): string | null {
  const want = headerName.toLowerCase();
  for (const [k, v] of res.headers.entries()) {
    if (k.toLowerCase() === want) return v;
  }
  return null;
}

/** Woo order id from create-order response headers (fallback when body is empty/stripped). */
function pickCreateOrderIdFromHeaders(res: Response): string | null {
  const encoded = getResponseHeaderInsensitive(res, "X-Create-Order-Id");
  if (encoded) {
    const t = encoded.trim();
    if (t) {
      try {
        const d = decodeURIComponent(t);
        if (d) return d;
      } catch {
        /* ignore */
      }
      return t;
    }
  }
  const plain = getResponseHeaderInsensitive(res, "X-Order-Id")?.trim();
  return plain || null;
}

function messageFromCreateOrderError(apiJson: Record<string, unknown>): string | null {
  const e = apiJson.error;
  if (typeof e === "string" && e.trim()) return e.trim();
  if (e != null && typeof e === "object" && "message" in e) {
    const em = (e as { message?: unknown }).message;
    if (typeof em === "string" && em.trim()) return em.trim();
  }
  const m = apiJson.message;
  if (typeof m === "string" && m.trim()) return m.trim();
  const issues = apiJson.issues;
  if (Array.isArray(issues) && issues.length > 0) {
    const first = issues[0] as { message?: unknown };
    if (typeof first?.message === "string" && first.message.trim()) return first.message.trim();
  }
  return null;
}

/** WCAG 2.4.7 — visible focus on interactive controls */
const FOCUS_RING =
  "focus-visible:border-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2";
const FOCUS_RING_LINK =
  "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2";
const FOCUS_RING_BTN =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2";

function RequiredMark() {
  return (
    <>
      <span className="text-rose-600" aria-hidden="true">
        *
      </span>
      <span className="sr-only"> (required)</span>
    </>
  );
}

function CheckoutPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { items, clear, syncWithWooCommerce, total } = useCart();
  const { success, error: showError } = useToast();
  const { appliedCoupon, discount, calculateDiscount } = useCoupon();
  
  
  const [isMounted, setIsMounted] = useState(false);
  const [placing, setPlacing] = useState(false);
  /** Synchronous guard — `placing` state updates too late to stop double-clicks (two POSTs; first aborted → "empty response"). */
  const checkoutSubmitInFlightRef = useRef(false);
  const [selectedBillingAddress, setSelectedBillingAddress] = useState<string>("");
  const [selectedShippingAddress, setSelectedShippingAddress] = useState<string>("");
  const [openNdisSection, setOpenNdisSection] = useState(false);
  const [openHcpSection, setOpenHcpSection] = useState(false);
  /** After submit: avoid showing empty-cart UI while navigating to payment or order review. */
  const [postSubmitNavigation, setPostSubmitNavigation] = useState<
    null | "secure_payment" | "order_confirmation"
  >(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"eway" | "cod">("eway");

  /** When true, eWAY uses token handoff to Woo (create-session → ?checkout_token=). Requires WP mu-plugin + server secret. */
  const ewayTokenFlowEnabled =
    typeof process.env.NEXT_PUBLIC_CHECKOUT_EWAY_TOKEN_FLOW === "string" &&
    process.env.NEXT_PUBLIC_CHECKOUT_EWAY_TOKEN_FLOW === "true";

  const { user } = useUser();
  const { data: session } = useSession();
  const { addresses } = useAddresses();
  const billingAddresses = addresses.filter(a => a.type === 'billing');
  const shippingAddresses = addresses.filter(a => a.type === 'shipping');

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CheckoutFormData>({
    resolver: yupResolver(checkoutSchema) as any,
    defaultValues: {
      billing_first_name: "",
      billing_last_name: "",
      billing_email: "",
      billing_phone: "",
      billing_company: "",
      billing_address_1: "",
      billing_address_2: "",
      billing_city: "",
      billing_postcode: "",
      billing_country: "AU",
      billing_state: "",
      shipping_first_name: "",
      shipping_last_name: "",
      shipping_company: "",
      shipping_address_1: "",
      shipping_address_2: "",
      shipping_city: "",
      shipping_postcode: "",
      shipping_country: "AU",
      shipping_state: "",
      shipToDifferentAddress: false,
      deliveryAuthority: "with_signature",
      deliveryInstructions: "",
      doNotSendPaperwork: false,
      discreetPackaging: false,
      ndis_number: "",
      ndis_participant_name: "",
      ndis_dob: "",
      ndis_funding_type: "",
      ndis_approval: false,
      billing_ndis_invoice_email: "",
      hcp_number: "",
      hcp_participant_name: "",
      hcp_provider_email: "",
      hcp_approval: false,
      cust_woo_ndis_participant_name: "",
      cust_woo_ndis_number: "",
      cust_woo_ndis_dob: "",
      cust_woo_ndis_funding_type: "",
      cust_woo_invoice_email: "",
      cust_woo_ndis_approval: false,
      cust_woo_hcp_participant_name: "",
      cust_woo_hcp_number: "",
      cust_woo_provider_email: "",
      cust_woo_hcp_approval: false,
      subscribe_newsletter: false,
      insurance_option: "no",
      termsAccepted: false,
    },
  });

  const formValues = watch();
  const watchedBilling = formValues
    ? {
        first_name: formValues.billing_first_name ?? "",
        last_name: formValues.billing_last_name ?? "",
        email: formValues.billing_email ?? "",
        phone: formValues.billing_phone ?? "",
        company: formValues.billing_company ?? "",
        address_1: formValues.billing_address_1 ?? "",
        address_2: formValues.billing_address_2 ?? "",
        city: formValues.billing_city ?? "",
        postcode: formValues.billing_postcode ?? "",
        country: formValues.billing_country ?? "AU",
        state: formValues.billing_state ?? "",
      }
    : { first_name: "", last_name: "", email: "", phone: "", company: "", address_1: "", address_2: "", city: "", postcode: "", country: "AU", state: "" };
  const watchedShipping = formValues
    ? {
        first_name: formValues.shipping_first_name ?? "",
        last_name: formValues.shipping_last_name ?? "",
        company: formValues.shipping_company ?? "",
        address_1: formValues.shipping_address_1 ?? "",
        address_2: formValues.shipping_address_2 ?? "",
        city: formValues.shipping_city ?? "",
        postcode: formValues.shipping_postcode ?? "",
        country: formValues.shipping_country ?? "AU",
        state: formValues.shipping_state ?? "",
      }
    : { first_name: "", last_name: "", company: "", address_1: "", address_2: "", city: "", postcode: "", country: "AU", state: "" };
  const watchedShipToDifferent = watch("shipToDifferentAddress");
  const watchedShippingMethod = watch("shippingMethod");
  const watchedInsuranceOption = watch("insurance_option");
  const insuranceOptionResolved: InsuranceOption =
    watchedInsuranceOption === "yes" ? "yes" : "no";
  /** NextAuth exposes `roles` from WP; there is no singular `role` on session.user. */
  const sessionRoles = Array.isArray((session?.user as any)?.roles)
    ? ((session?.user as any).roles as string[])
    : [];
  const normalizeCheckoutRole = (r: string) =>
    String(r || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  const onAccountRoleSlugs = new Set(["administrator", "ndis_approved"]);
  const hasOnAccountRole = sessionRoles.some((r) => onAccountRoleSlugs.has(normalizeCheckoutRole(r)));
  const isNdisApprovedMeta = (session?.user as any)?.meta?.ndis_approved === true;
  const canUseOnAccount = hasOnAccountRole || isNdisApprovedMeta;
  const paymentMethods = canUseOnAccount
    ? (["cod", "eway"] as const)
    : (["eway"] as const);

  const billingFirst = watchedBilling?.first_name ?? "";
  const billingLast = watchedBilling?.last_name ?? "";
  const billingCompany = watchedBilling?.company ?? "";
  const billingAddr1 = watchedBilling?.address_1 ?? "";
  const billingAddr2 = watchedBilling?.address_2 ?? "";
  const billingCity = watchedBilling?.city ?? "";
  const billingCountryRaw = watchedBilling?.country || "";
  const billingCountry = /^australia$/i.test(billingCountryRaw) ? "AU" : (billingCountryRaw || "AU");
  const billingPostcode = watchedBilling?.postcode || "";
  const billingState = watchedBilling?.state || "";
  const shippingCountryRaw = watchedShipping?.country || "";
  const shippingCountry = /^australia$/i.test(shippingCountryRaw) ? "AU" : (shippingCountryRaw || "AU");
  const shippingPostcode = watchedShipping?.postcode || "";
  const shippingState = watchedShipping?.state || "";
  const shippingCity = watchedShipping?.city ?? "";

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(CHECKOUT_INSURANCE_STORAGE_KEY);
      if (raw === "yes" || raw === "no") {
        setValue("insurance_option", raw, { shouldDirty: false });
      }
    } catch {
      /* ignore */
    }
  }, [isMounted, setValue]);

  useEffect(() => {
    if (!isMounted || typeof window === "undefined") return;
    try {
      localStorage.setItem(CHECKOUT_INSURANCE_STORAGE_KEY, insuranceOptionResolved);
    } catch {
      /* ignore */
    }
  }, [isMounted, insuranceOptionResolved]);

  useEffect(() => {
    if (!canUseOnAccount && selectedPaymentMethod === "cod") {
      setSelectedPaymentMethod("eway");
    }
  }, [canUseOnAccount, selectedPaymentMethod]);

  useEffect(() => {
    if (!isMounted) return;
    const cancelled = searchParams.get("cancelled");
    const err = searchParams.get("error");
    if (cancelled === "true") {
      showError("Payment was cancelled.");
      router.replace("/checkout", { scroll: false });
      return;
    }
    if (err) {
      const messages: Record<string, string> = {
        payment_failed: "Payment was declined or failed. Please try again.",
        session_expired: "Checkout session expired. Please start again.",
        order_creation_failed:
          "Payment may have succeeded but we could not create your order. Please contact support with your receipt.",
        payment_pending: "Payment is still processing. Check your email or try again shortly.",
      };
      showError(messages[err] || "Something went wrong. Please try again.");
      router.replace("/checkout", { scroll: false });
    }
  }, [isMounted, searchParams, router, showError]);

  const cartSubtotal = useMemo(() => parseCartTotal(total), [total]);
  const itemsCount = items.length;
  const itemsString = useMemo(() => {
    if (items.length === 0) return '[]';
    return JSON.stringify(items);
  }, [itemsCount]);

  useEffect(() => {
    if (!watchedShipToDifferent && billingFirst) {
      setValue("shipping_first_name", billingFirst);
      setValue("shipping_last_name", billingLast);
      setValue("shipping_company", billingCompany);
      setValue("shipping_address_1", billingAddr1);
      setValue("shipping_address_2", billingAddr2);
      setValue("shipping_city", billingCity);
      setValue("shipping_postcode", billingPostcode);
      setValue("shipping_country", billingCountry);
      setValue("shipping_state", billingState);
    }
  }, [watchedShipToDifferent, billingFirst, billingLast, billingCompany, billingAddr1, billingAddr2, billingCity, billingPostcode, billingCountry, billingState, setValue]);

  useEffect(() => {
    if (appliedCoupon && items.length > 0) {
      const subtotal = parseCartTotal(total);
      calculateDiscount(items, subtotal);
    }
  }, [items, total, appliedCoupon, calculateDiscount]);

  const subtotal = parseCartTotal(total);
  const shippingCost = watchedShippingMethod ? Number((watchedShippingMethod as ShippingMethodType)?.cost || 0) : 0;
  const couponDiscount = discount || 0;
  const { parcelProtectionFee, gst, orderTotal } = useCheckoutTotals(
    subtotal,
    shippingCost,
    couponDiscount,
    insuranceOptionResolved
  );

  const onSubmit = async (data: CheckoutFormData): Promise<void> => {
    if (checkoutSubmitInFlightRef.current) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[checkout] duplicate submit ignored (already in flight)");
      }
      return;
    }
    checkoutSubmitInFlightRef.current = true;

    if (items.length === 0) {
      checkoutSubmitInFlightRef.current = false;
      showError("Your cart is empty");
      return;
    }

    setPlacing(true);
    console.log("[checkout] Submitting checkout…", {
      paymentMethod: selectedPaymentMethod,
    });

    const billing = {
      first_name: data.billing_first_name || "",
      last_name: data.billing_last_name || "",
      email: data.billing_email || "",
      phone: data.billing_phone || "",
      company: data.billing_company || "",
      address_1: data.billing_address_1 || "",
      address_2: data.billing_address_2 || "",
      city: data.billing_city || "",
      state: data.billing_state || "",
      postcode: data.billing_postcode || "",
      country: data.billing_country || "AU",
    };
    const shipping = {
      first_name: data.shipping_first_name || "",
      last_name: data.shipping_last_name || "",
      company: data.shipping_company || "",
      address_1: data.shipping_address_1 || "",
      address_2: data.shipping_address_2 || "",
      city: data.shipping_city || "",
      state: data.shipping_state || "",
      postcode: data.shipping_postcode || "",
      country: data.shipping_country || "AU",
    };

    try {
      // Prices and stock are re-validated server-side in create-order (syncCartToWooCommerce +
      // shipping recomputation). Skipping another client sync here avoids duplicate Woo POST/DELETE
      // order cycles and speeds up checkout.

      const finalShipping = data.shipToDifferentAddress ? shipping : billing;
      const shippingMethodData = data.shippingMethod as ShippingMethodType | undefined;
      if (!shippingMethodData?.id) {
        showError("Please select a shipping method.");
        return;
      }

      const checkoutPayload: Record<string, unknown> = {
        billing,
        shipping: {
          first_name: finalShipping.first_name || "",
          last_name: finalShipping.last_name || "",
          email: billing.email || "",
          phone: billing.phone || "",
          company: finalShipping.company || "",
          address_1: finalShipping.address_1 || "",
          address_2: finalShipping.address_2 || "",
          city: finalShipping.city || "",
          state: finalShipping.state || "",
          postcode: finalShipping.postcode || "",
          country: finalShipping.country || "AU",
        },
        line_items: items.map((i) => {
          const sku =
            i.sku != null && String(i.sku).trim() !== ""
              ? String(i.sku).trim()
              : undefined;
          const pid = Number(i.productId);
          const vidRaw = i.variationId != null ? Number(i.variationId) : NaN;
          return {
            ...(sku ? { sku } : {}),
            ...(Number.isFinite(pid) && pid > 0 ? { product_id: pid } : {}),
            ...(Number.isFinite(vidRaw) && vidRaw > 0 ? { variation_id: vidRaw } : {}),
            quantity: i.qty,
          };
        }),
        shipping_method_id: shippingMethodData.id,
        payment_method: selectedPaymentMethod,
        coupon_code: appliedCoupon?.code || searchParams.get("coupon") || undefined,
        insurance_option: data.insurance_option === "yes" ? "yes" : "no",
        ndis_type:
          (data.cust_woo_ndis_funding_type ?? data.ndis_funding_type) || undefined,
      };

      const useTokenHandoff = selectedPaymentMethod === "eway" && ewayTokenFlowEnabled;
      const endpoint = useTokenHandoff ? "/api/checkout/create-session" : "/api/checkout/create-order";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(useTokenHandoff && typeof crypto !== "undefined" && "randomUUID" in crypto
            ? { "Idempotency-Key": crypto.randomUUID() }
            : {}),
        },
        body: JSON.stringify(checkoutPayload),
        cache: "no-store",
        credentials: "same-origin",
      });

      let responseText = "";
      try {
        responseText = (await readResponseBodyText(res)).replace(/^\uFEFF/, "");
      } catch (readErr) {
        console.error("[checkout] failed to read response body", readErr);
        const recoveredId = pickCreateOrderIdFromHeaders(res);
        if (recoveredId) {
          if (selectedPaymentMethod === "cod") {
            setPostSubmitNavigation("order_confirmation");
            try {
              clear();
              if (user?.id) {
                fetch("/api/dashboard/cart/save", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ items: [] }),
                }).catch(() => {});
              }
            } catch {
              /* ignore */
            }
            success("Order placed successfully.");
          } else {
            setPostSubmitNavigation("order_confirmation");
          }
          window.location.assign(
            `/order-review?order_id=${encodeURIComponent(recoveredId)}`
          );
          return;
        }
        showError(
          "Could not read the checkout response. Check your connection and try again once."
        );
        return;
      }
      const trimmed = responseText.trim();
      let apiJson: Record<string, unknown> = {};
      if (trimmed) {
        try {
          apiJson = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
          if (process.env.NODE_ENV === "development") {
            console.error("[checkout] non-JSON response", {
              endpoint,
              status: res.status,
              contentType: res.headers.get("content-type"),
              preview: responseText.slice(0, 600),
            });
          }
          showError(
            !res.ok
              ? `Checkout service error (HTTP ${res.status}). Please try again.`
              : "Checkout returned an unexpected response. Please try again or contact support."
          );
          return;
        }
      } else if (!res.ok) {
        showError(`Checkout service error (HTTP ${res.status}). Please try again.`);
        return;
      } else {
        // Proxies / aborted reads can yield empty body with 200; recover from order id headers.
        const recoveredId = pickCreateOrderIdFromHeaders(res);
        if (recoveredId) {
          if (process.env.NODE_ENV === "development") {
            console.warn(
              "[checkout] empty body but order id headers present — recovering",
              { recoveredId, paymentMethod: selectedPaymentMethod }
            );
          }
          if (selectedPaymentMethod === "cod") {
            setPostSubmitNavigation("order_confirmation");
            try {
              clear();
              if (user?.id) {
                fetch("/api/dashboard/cart/save", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ items: [] }),
                }).catch(() => {});
              }
            } catch {
              /* ignore */
            }
            success("Order placed successfully.");
            window.location.assign(
              `/order-review?order_id=${encodeURIComponent(recoveredId)}`
            );
            return;
          }
          // eWAY: order exists but JSON was lost — send user to order review to pay / see status (cart kept until paid).
          setPostSubmitNavigation("order_confirmation");
          window.location.assign(
            `/order-review?order_id=${encodeURIComponent(recoveredId)}`
          );
          return;
        }
        if (process.env.NODE_ENV === "development") {
          const headerDump: string[] = [];
          res.headers.forEach((v, k) => headerDump.push(`${k}: ${v.slice(0, 80)}`));
          console.error("[checkout] empty OK response", {
            endpoint,
            status: res.status,
            headerKeys: [...res.headers.keys()],
            headerDump: headerDump.slice(0, 20),
          });
        }
        showError(
          "Empty response from checkout server. If this persists, check the Network tab for the create-order request."
        );
        return;
      }

      if (useTokenHandoff) {
        if (!res.ok || apiJson.success === false || apiJson.success === "false") {
          const detail = messageFromCreateOrderError(apiJson);
          showError(
            detail ||
              `Unable to start secure checkout${!res.ok ? ` (HTTP ${res.status})` : ""}.`
          );
          return;
        }
        const redirectUrl =
          typeof apiJson.redirectUrl === "string" ? apiJson.redirectUrl.trim() : "";
        if (!redirectUrl) {
          showError(
            (typeof apiJson.error === "string" && apiJson.error) ||
              "Secure checkout redirect URL was not returned."
          );
          return;
        }
        console.log("[checkout] Redirecting to store (token checkout):", redirectUrl);
        // Do not clear cart here — empty cart flashes on Woo/Next before payment completes.
        try {
          sessionStorage.setItem("headless_clear_cart_after_woo_token_checkout", "1");
        } catch {
          /* ignore */
        }
        setPostSubmitNavigation("secure_payment");
        window.location.assign(redirectUrl);
        return;
      }

      if (!res.ok || apiJson.success === false || apiJson.success === "false") {
        const detail = messageFromCreateOrderError(apiJson);
        if (process.env.NODE_ENV === "development" && !detail) {
          console.error("[checkout] create-order failed", { status: res.status, apiJson });
        }
        showError(
          detail ||
            `Unable to place order${!res.ok ? ` (HTTP ${res.status})` : ""}. Please try again or contact support.`
        );
        return;
      }

      if (apiJson.success !== true && apiJson.success !== "true") {
        showError("Checkout did not complete successfully.");
        return;
      }

      const outcomeType = apiJson.type;
      const isSuccessType =
        String(outcomeType || "").toLowerCase() === "success";

      if (
        outcomeType === "redirect" &&
        typeof apiJson.url === "string" &&
        apiJson.url.trim()
      ) {
        const payUrl = apiJson.url.trim();
        console.log("[checkout] Redirecting to hosted payment:", payUrl);
        // Do not clear cart before leaving — that re-renders this page as "empty cart" until
        // navigation. Clear when order confirmation loads (order-review / order-success).
        try {
          const oid = apiJson.orderId ?? apiJson.order_ref;
          if (oid != null && String(oid).trim() !== "") {
            sessionStorage.setItem(
              `headless_clear_cart_for_order_${String(oid)}`,
              "1"
            );
          }
        } catch {
          /* ignore */
        }
        setPostSubmitNavigation("secure_payment");
        window.location.assign(payUrl);
        return;
      }

      const redirectFromApi =
        typeof apiJson.redirect === "string" ? apiJson.redirect.trim() : "";
      const orderIdForReview = apiJson.orderId ?? apiJson.order_ref;
      const reviewPath =
        redirectFromApi ||
        (orderIdForReview != null && String(orderIdForReview).trim() !== ""
          ? `/order-review?order_id=${encodeURIComponent(String(orderIdForReview))}`
          : "");

      if (isSuccessType && reviewPath) {
        setPostSubmitNavigation("order_confirmation");
        try {
          clear();
          if (user?.id) {
            fetch("/api/dashboard/cart/save", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ items: [] }),
            }).catch(() => {});
          }
        } catch {
          /* ignore */
        }
        console.log("[checkout] On Account (cod) → order review", {
          path: reviewPath,
          hadRedirectField: Boolean(redirectFromApi),
        });
        success("Order placed successfully.");
        // Hard navigation: router.push after clear() / state updates is easy to lose in App Router.
        window.location.assign(reviewPath);
        return;
      }

      showError("Unexpected checkout response. Please contact support.");
    } catch (error: any) {
      console.error("Checkout error:", error);
      showError(error?.message || "An error occurred while placing your order");
    } finally {
      checkoutSubmitInFlightRef.current = false;
      setPlacing(false);
    }
  };

  if (!isMounted) {
    return (
      <div className="container min-h-screen bg-gray-50 py-10 flex items-center justify-center">
        <div className="text-center" role="status" aria-live="polite">
          <div
            className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent"
            aria-hidden="true"
          />
          <p className="mt-4 text-gray-900">Loading checkout…</p>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    if (postSubmitNavigation === "secure_payment") {
      return (
        <div className="container min-h-screen py-10">
          <div className="text-center py-20" role="status" aria-live="polite">
            <div
              className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent mb-4"
              aria-hidden="true"
            />
            <h1 className="text-2xl font-semibold mb-4 text-gray-900">
              Redirecting to secure payment…
            </h1>
          </div>
        </div>
      );
    }
    if (postSubmitNavigation === "order_confirmation") {
      return (
        <div className="container min-h-screen py-10">
          <div className="text-center py-20" role="status" aria-live="polite">
            <div
              className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent mb-4"
              aria-hidden="true"
            />
            <h1 className="text-2xl font-semibold mb-4 text-gray-900">
              Redirecting to order confirmation…
            </h1>
          </div>
        </div>
      );
    }
    return (
      <div className="container min-h-screen py-10">
        <div className="text-center py-20">
          <h1 className="text-2xl font-semibold mb-4 text-gray-900">Your cart is empty</h1>
          <Link
            href="/shop"
            className={`inline-block rounded-md bg-gray-900 px-6 py-3 text-white hover:bg-black ${FOCUS_RING_BTN}`}
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <a
        href="#checkout-main"
        className={`fixed left-4 top-4 z-[200] -translate-y-[200%] rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white opacity-0 transition focus:translate-y-0 focus:opacity-100 ${FOCUS_RING_BTN} focus:ring-white focus:ring-offset-gray-900`}
      >
        Skip to checkout form
      </a>
      <div className="min-h-screen py-10 container">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-gray-900">Checkout</h1>
          <Link
            href={getCartUrl()}
            className={`rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 ${FOCUS_RING_BTN}`}
          >
            View Cart
          </Link>
        </div>

        <form
          id="checkout-main"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void handleSubmit(onSubmit)(e);
          }}
          className="grid gap-6 lg:grid-cols-3"
          noValidate
          aria-label="Checkout and place order"
        >
          <div className="lg:col-span-2 space-y-6">
            <section className="rounded-xl bg-white p-6" aria-labelledby="checkout-billing-heading">
              <h2 id="checkout-billing-heading" className="mb-4 text-lg font-semibold text-gray-900">
                Billing details
              </h2>
              {user && billingAddresses.length > 0 && (
                <div className="mb-4">
                  <label
                    htmlFor="checkout-select-billing-saved"
                    className="mb-2 block text-sm font-medium text-gray-900"
                  >
                    Select saved billing address
                  </label>
                  <select
                    id="checkout-select-billing-saved"
                    value={selectedBillingAddress}
                    onChange={(e) => {
                      const addressId = e.target.value;
                      setSelectedBillingAddress(addressId);
                      if (addressId) {
                        const address = billingAddresses.find(a => String(a.id) === String(addressId));
                        if (address) {
                          const countryVal = (address.country || 'AU').trim();
                          const countryNorm = /^australia$/i.test(countryVal) ? 'AU' : (countryVal || 'AU');
                          setValue('billing_first_name', address.first_name, { shouldDirty: true });
                          setValue('billing_last_name', address.last_name, { shouldDirty: true });
                          setValue('billing_email', address.email || '', { shouldDirty: true });
                          setValue('billing_phone', address.phone || '', { shouldDirty: true });
                          setValue('billing_company', address.company || '', { shouldDirty: true });
                          setValue('billing_address_1', address.address_1, { shouldDirty: true });
                          setValue('billing_address_2', address.address_2 || '', { shouldDirty: true });
                          setValue('billing_city', address.city, { shouldDirty: true });
                          setValue('billing_state', address.state, { shouldDirty: true });
                          setValue('billing_postcode', address.postcode, { shouldDirty: true });
                          setValue('billing_country', countryNorm, { shouldDirty: true });
                          setValue('cust_woo_ndis_participant_name', address.ndis_participant_name || '', { shouldDirty: true });
                          setValue('cust_woo_ndis_number', address.ndis_number || '', { shouldDirty: true });
                          setValue('cust_woo_ndis_dob', address.ndis_dob || '', { shouldDirty: true });
                          setValue('cust_woo_ndis_funding_type', address.ndis_funding_type || '', { shouldDirty: true });
                          setValue('cust_woo_ndis_approval', Boolean(address.ndis_approval), { shouldDirty: true });
                          setValue('cust_woo_invoice_email', (address as { ndis_invoice_email?: string }).ndis_invoice_email || '', { shouldDirty: true });
                          setValue('cust_woo_hcp_participant_name', address.hcp_participant_name || '', { shouldDirty: true });
                          setValue('cust_woo_hcp_number', address.hcp_number || '', { shouldDirty: true });
                          setValue('cust_woo_provider_email', address.hcp_provider_email || '', { shouldDirty: true });
                          setValue('cust_woo_hcp_approval', Boolean(address.hcp_approval), { shouldDirty: true });
                        }
                      } else {
                        setValue('billing_first_name', '');
                        setValue('billing_last_name', '');
                        setValue('billing_email', '');
                        setValue('billing_phone', '');
                        setValue('billing_company', '');
                        setValue('billing_address_1', '');
                        setValue('billing_address_2', '');
                        setValue('billing_city', '');
                        setValue('billing_state', '');
                        setValue('billing_postcode', '');
                        setValue('billing_country', 'AU');
                        setValue('cust_woo_ndis_participant_name', '');
                        setValue('cust_woo_ndis_number', '');
                        setValue('cust_woo_ndis_dob', '');
                        setValue('cust_woo_ndis_funding_type', '');
                        setValue('cust_woo_ndis_approval', false);
                        setValue('cust_woo_invoice_email', '');
                        setValue('cust_woo_hcp_participant_name', '');
                        setValue('cust_woo_hcp_number', '');
                        setValue('cust_woo_provider_email', '');
                        setValue('cust_woo_hcp_approval', false);
                      }
                    }}
                    className={`w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 ${FOCUS_RING}`}
                  >
                    <option value="">Enter address manually</option>
                    {billingAddresses.map((address) => (
                      <option key={address.id} value={address.id}>
                        {address.label || 'Address'} - {address.address_1}, {address.city}
                      </option>
                    ))}
                  </select>
                  {selectedBillingAddress ? (
                    <p
                      className="mt-2 rounded border border-amber-800 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                      role="note"
                    >
                      To edit this address, select &quot;Enter address manually&quot; above.
                    </p>
                  ) : null}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="checkout-billing-first-name" className="mb-1 block text-sm font-medium text-gray-900">
                    First name <RequiredMark />
                  </label>
                  <Controller
                    name="billing_first_name"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        id="checkout-billing-first-name"
                        type="text"
                        autoComplete="given-name"
                        disabled={!!selectedBillingAddress}
                        aria-invalid={errors.billing_first_name ? "true" : "false"}
                        aria-required="true"
                        aria-describedby={
                          errors.billing_first_name ? "checkout-billing-first-name-err" : undefined
                        }
                        onChange={(e) => field.onChange(nameCharsOnly(e.target.value))}
                        className={`w-full rounded border px-3 py-2 text-sm text-gray-900 ${FOCUS_RING} ${errors.billing_first_name ? "border-rose-600" : "border-gray-300"} ${selectedBillingAddress ? "cursor-not-allowed bg-gray-100" : ""}`}
                      />
                    )}
                  />
                  {errors.billing_first_name && (
                    <p id="checkout-billing-first-name-err" className="mt-1 text-xs text-rose-700">
                      {errors.billing_first_name.message}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="checkout-billing-last-name" className="mb-1 block text-sm font-medium text-gray-900">
                    Last name <RequiredMark />
                  </label>
                  <Controller
                    name="billing_last_name"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        id="checkout-billing-last-name"
                        type="text"
                        autoComplete="family-name"
                        disabled={!!selectedBillingAddress}
                        aria-invalid={errors.billing_last_name ? "true" : "false"}
                        aria-required="true"
                        aria-describedby={
                          errors.billing_last_name ? "checkout-billing-last-name-err" : undefined
                        }
                        onChange={(e) => field.onChange(nameCharsOnly(e.target.value))}
                        className={`w-full rounded border px-3 py-2 text-sm text-gray-900 ${FOCUS_RING} ${errors.billing_last_name ? "border-rose-600" : "border-gray-300"} ${selectedBillingAddress ? "cursor-not-allowed bg-gray-100" : ""}`}
                      />
                    )}
                  />
                  {errors.billing_last_name && (
                    <p id="checkout-billing-last-name-err" className="mt-1 text-xs text-rose-700">
                      {errors.billing_last_name.message}
                    </p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="checkout-billing-email" className="mb-1 block text-sm font-medium text-gray-900">
                    Email <RequiredMark />
                  </label>
                  <Controller
                    name="billing_email"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        id="checkout-billing-email"
                        type="email"
                        autoComplete="email"
                        disabled={!!selectedBillingAddress}
                        aria-invalid={errors.billing_email ? "true" : "false"}
                        aria-required="true"
                        aria-describedby={errors.billing_email ? "checkout-billing-email-err" : undefined}
                        className={`w-full rounded border px-3 py-2 text-sm text-gray-900 ${FOCUS_RING} ${errors.billing_email ? "border-rose-600" : "border-gray-300"} ${selectedBillingAddress ? "cursor-not-allowed bg-gray-100" : ""}`}
                      />
                    )}
                  />
                  {errors.billing_email && (
                    <p id="checkout-billing-email-err" className="mt-1 text-xs text-rose-700">
                      {errors.billing_email.message}
                    </p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="checkout-billing-phone" className="mb-1 block text-sm font-medium text-gray-900">
                    Phone <RequiredMark />
                  </label>
                  <Controller
                    name="billing_phone"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        id="checkout-billing-phone"
                        type="tel"
                        autoComplete="tel"
                        inputMode="numeric"
                        disabled={!!selectedBillingAddress}
                        maxLength={10}
                        aria-invalid={errors.billing_phone ? "true" : "false"}
                        aria-required="true"
                        aria-describedby={errors.billing_phone ? "checkout-billing-phone-err" : undefined}
                        onChange={(e) => field.onChange(digitsOnly(e.target.value).slice(0, 10))}
                        className={`w-full rounded border px-3 py-2 text-sm text-gray-900 ${FOCUS_RING} ${errors.billing_phone ? "border-rose-600" : "border-gray-300"} ${selectedBillingAddress ? "cursor-not-allowed bg-gray-100" : ""}`}
                      />
                    )}
                  />
                  {errors.billing_phone && (
                    <p id="checkout-billing-phone-err" className="mt-1 text-xs text-rose-700">
                      {errors.billing_phone.message}
                    </p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="checkout-billing-company" className="mb-1 block text-sm font-medium text-gray-900">
                    Company <span className="font-normal text-gray-600">(optional)</span>
                  </label>
                  <Controller
                    name="billing_company"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        id="checkout-billing-company"
                        type="text"
                        autoComplete="organization"
                        disabled={!!selectedBillingAddress}
                        className={`w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 ${FOCUS_RING} ${selectedBillingAddress ? "cursor-not-allowed bg-gray-100" : ""}`}
                      />
                    )}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="checkout-billing-address-1" className="mb-1 block text-sm font-medium text-gray-900">
                    Address <RequiredMark />
                  </label>
                  <Controller
                    name="billing_address_1"
                    control={control}
                    render={({ field }) => (
                      <AddressAutocomplete
                        id="checkout-billing-address-1"
                        value={field.value}
                        onChange={field.onChange}
                        onPlaceSelect={(addr) => {
                          if (addr.address_2) setValue("billing_address_2", addr.address_2);
                          setValue("billing_city", addr.city);
                          setValue("billing_state", addr.state);
                          setValue("billing_postcode", addr.postcode);
                          setValue("billing_country", addr.country || "AU");
                        }}
                        disabled={!!selectedBillingAddress}
                        error={!!errors.billing_address_1}
                        placeholder="Start typing your address..."
                        aria-label="Street address"
                        aria-invalid={errors.billing_address_1 ? "true" : "false"}
                        aria-required="true"
                        aria-describedby={
                          errors.billing_address_1 ? "checkout-billing-address-1-err" : undefined
                        }
                        className={`w-full rounded border px-3 py-2 text-sm text-gray-900 ${FOCUS_RING} ${errors.billing_address_1 ? "border-rose-600" : "border-gray-300"} ${selectedBillingAddress ? "cursor-not-allowed bg-gray-100" : ""}`}
                      />
                    )}
                  />
                  {errors.billing_address_1 && (
                    <p id="checkout-billing-address-1-err" className="mt-1 text-xs text-rose-700">
                      {errors.billing_address_1.message}
                    </p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="checkout-billing-address-2" className="mb-1 block text-sm font-medium text-gray-900">
                    Address line 2 <span className="font-normal text-gray-600">(optional)</span>
                  </label>
                  <Controller
                    name="billing_address_2"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        id="checkout-billing-address-2"
                        type="text"
                        autoComplete="address-line2"
                        disabled={!!selectedBillingAddress}
                        className={`w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 ${FOCUS_RING} ${selectedBillingAddress ? "cursor-not-allowed bg-gray-100" : ""}`}
                      />
                    )}
                  />
                </div>
                <div>
                  <label htmlFor="checkout-billing-city" className="mb-1 block text-sm font-medium text-gray-900">
                    City <RequiredMark />
                  </label>
                  <Controller
                    name="billing_city"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        id="checkout-billing-city"
                        type="text"
                        autoComplete="address-level2"
                        disabled={!!selectedBillingAddress}
                        aria-invalid={errors.billing_city ? "true" : "false"}
                        aria-required="true"
                        aria-describedby={errors.billing_city ? "checkout-billing-city-err" : undefined}
                        className={`w-full rounded border px-3 py-2 text-sm text-gray-900 ${FOCUS_RING} ${errors.billing_city ? "border-rose-600" : "border-gray-300"} ${selectedBillingAddress ? "cursor-not-allowed bg-gray-100" : ""}`}
                      />
                    )}
                  />
                  {errors.billing_city && (
                    <p id="checkout-billing-city-err" className="mt-1 text-xs text-rose-700">
                      {errors.billing_city.message}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="checkout-billing-postcode" className="mb-1 block text-sm font-medium text-gray-900">
                    Postcode <RequiredMark />
                  </label>
                  <Controller
                    name="billing_postcode"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        id="checkout-billing-postcode"
                        type="text"
                        autoComplete="postal-code"
                        disabled={!!selectedBillingAddress}
                        aria-invalid={errors.billing_postcode ? "true" : "false"}
                        aria-required="true"
                        aria-describedby={errors.billing_postcode ? "checkout-billing-postcode-err" : undefined}
                        className={`w-full rounded border px-3 py-2 text-sm text-gray-900 ${FOCUS_RING} ${errors.billing_postcode ? "border-rose-600" : "border-gray-300"} ${selectedBillingAddress ? "cursor-not-allowed bg-gray-100" : ""}`}
                      />
                    )}
                  />
                  {errors.billing_postcode && (
                    <p id="checkout-billing-postcode-err" className="mt-1 text-xs text-rose-700">
                      {errors.billing_postcode.message}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="checkout-billing-state" className="mb-1 block text-sm font-medium text-gray-900">
                    State <RequiredMark />
                  </label>
                  <Controller
                    name="billing_state"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        id="checkout-billing-state"
                        type="text"
                        autoComplete="address-level1"
                        disabled={!!selectedBillingAddress}
                        aria-invalid={errors.billing_state ? "true" : "false"}
                        aria-required="true"
                        aria-describedby={errors.billing_state ? "checkout-billing-state-err" : undefined}
                        className={`w-full rounded border px-3 py-2 text-sm text-gray-900 ${FOCUS_RING} ${errors.billing_state ? "border-rose-600" : "border-gray-300"} ${selectedBillingAddress ? "cursor-not-allowed bg-gray-100" : ""}`}
                      />
                    )}
                  />
                  {errors.billing_state && (
                    <p id="checkout-billing-state-err" className="mt-1 text-xs text-rose-700">
                      {errors.billing_state.message}
                    </p>
                  )}
                </div>
                <div>
                  <span className="mb-1 block text-sm font-medium text-gray-900" id="checkout-billing-country-label">
                    Country <RequiredMark />
                  </span>

                  <>
                    <input type="hidden" value="AU" {...register("billing_country", { required: true })} />
                    <input
                      type="text"
                      readOnly
                      value="Australia"
                      tabIndex={0}
                      id="checkout-billing-country-display"
                      aria-labelledby="checkout-billing-country-label"
                      aria-readonly="true"
                      className={`w-full cursor-default rounded border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-900 ${FOCUS_RING}`}
                    />
                  </>

                  {errors.billing_country && (
                    <p id="checkout-billing-country-err" className="mt-1 text-xs text-rose-700">
                      Country is required
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6 space-y-4 border-t border-gray-200 pt-6">
                  <div className="rounded-lg border border-gray-200 bg-gray-50/50">
                    <button
                      type="button"
                      id="checkout-ndis-toggle"
                      aria-expanded={openNdisSection}
                      aria-controls="checkout-ndis-panel"
                      onClick={() => setOpenNdisSection((v) => !v)}
                      className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-900 ${FOCUS_RING_BTN}`}
                    >
                      <span>Enter your NDIS information</span>
                      <span className="text-gray-600 text-sm" aria-hidden="true">
                        {openNdisSection ? "−" : "+"}
                      </span>
                    </button>
                    <div
                      id="checkout-ndis-panel"
                      role="region"
                      aria-labelledby="checkout-ndis-toggle"
                      hidden={!openNdisSection}
                      className="border-t border-gray-200 bg-white px-4 py-4"
                    >
                        <p className="mb-4 text-xs text-gray-500">Add your NDIS information before checkout.</p>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="sm:col-span-2">
                            <label className="mb-1 block text-sm font-medium text-gray-700">Participants Full Name</label>
                            <Controller
                              name="cust_woo_ndis_participant_name"
                              control={control}
                              render={({ field }) => (
                                <input {...field} type="text" disabled={!!selectedBillingAddress} className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedBillingAddress ? "bg-gray-100 cursor-not-allowed" : ""}`} />
                              )}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">NDIS Number</label>
                            <Controller
                              name="cust_woo_ndis_number"
                              control={control}
                              render={({ field }) => (
                                <input
                                  {...field}
                                  type="text"
                                  disabled={!!selectedBillingAddress}
                                  className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${
                                    selectedBillingAddress ? "bg-gray-100 cursor-not-allowed" : ""
                                  }`}
                                />
                              )}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Participant&apos;s Date Of Birth</label>
                            <Controller
                              name="cust_woo_ndis_dob"
                              control={control}
                              render={({ field }) => (
                                <input {...field} type="text" placeholder="dd-mm-yyyy" disabled={!!selectedBillingAddress} className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedBillingAddress ? "bg-gray-100 cursor-not-allowed" : ""}`} />
                              )}
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="mb-1 block text-sm font-medium text-gray-700">NDIS Funding Type</label>
                            <Controller
                              name="cust_woo_ndis_funding_type"
                              control={control}
                              render={({ field }) => (
                                <select {...field} disabled={!!selectedBillingAddress} className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedBillingAddress ? "bg-gray-100 cursor-not-allowed" : ""}`}>
                                  <option value="">Please Choose</option>
                                  <option value="self_managed">Self Managed</option>
                                  <option value="plan_managed">Plan Managed</option>
                                  <option value="agency_managed">Agency Managed</option>
                                </select>
                              )}
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="mb-1 block text-sm font-medium text-gray-700">NDIS Invoice Email</label>
                            <Controller
                              name="cust_woo_invoice_email"
                              control={control}
                              render={({ field }) => (
                                <input
                                  {...field}
                                  id="billing_ndis_invoice_email"
                                  type="email"
                                  disabled={!!selectedBillingAddress}
                                  className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedBillingAddress ? "bg-gray-100 cursor-not-allowed" : ""}`}
                                  placeholder="Email for NDIS invoices"
                                />
                              )}
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="flex items-start gap-2">
                              <Controller
                                name="cust_woo_ndis_approval"
                                control={control}
                                render={({ field: { value, onChange, ...rest } }) => (
                                  <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} disabled={!!selectedBillingAddress} className={`mt-1 h-4 w-4 rounded border-gray-300 ${selectedBillingAddress ? "cursor-not-allowed" : ""}`} {...rest} />
                                )}
                              />
                              <span className="text-sm text-gray-700">I approve this order to be paid using my / the Participant&apos;s NDIS funding.</span>
                            </label>
                          </div>
                        </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50/50">
                    <button
                      type="button"
                      id="checkout-hcp-toggle"
                      aria-expanded={openHcpSection}
                      aria-controls="checkout-hcp-panel"
                      onClick={() => setOpenHcpSection((v) => !v)}
                      className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-900 ${FOCUS_RING_BTN}`}
                    >
                      <span>Enter your Home Care Package information</span>
                      <span className="text-gray-600 text-sm" aria-hidden="true">
                        {openHcpSection ? "−" : "+"}
                      </span>
                    </button>
                    <div
                      id="checkout-hcp-panel"
                      role="region"
                      aria-labelledby="checkout-hcp-toggle"
                      hidden={!openHcpSection}
                      className="border-t border-gray-200 bg-white px-4 py-4"
                    >
                        <p className="mb-4 text-xs text-gray-500">Enter their details to get access to their package.</p>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="sm:col-span-2">
                            <label className="mb-1 block text-sm font-medium text-gray-700">Participants Full Name</label>
                            <Controller
                              name="cust_woo_hcp_participant_name"
                              control={control}
                              render={({ field }) => (
                                <input {...field} type="text" disabled={!!selectedBillingAddress} className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedBillingAddress ? "bg-gray-100 cursor-not-allowed" : ""}`} />
                              )}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">HCP Number</label>
                            <Controller
                              name="cust_woo_hcp_number"
                              control={control}
                              render={({ field }) => (
                                <input {...field} type="text" disabled={!!selectedBillingAddress} className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedBillingAddress ? "bg-gray-100 cursor-not-allowed" : ""}`} />
                              )}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Provider Payment Email</label>
                            <Controller
                              name="cust_woo_provider_email"
                              control={control}
                              render={({ field }) => (
                                <input {...field} type="email" disabled={!!selectedBillingAddress} className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedBillingAddress ? "bg-gray-100 cursor-not-allowed" : ""}`} />
                              )}
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="flex items-start gap-2">
                              <Controller
                                name="cust_woo_hcp_approval"
                                control={control}
                                render={({ field: { value, onChange, ...rest } }) => (
                                  <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} disabled={!!selectedBillingAddress} className={`mt-1 h-4 w-4 rounded border-gray-300 ${selectedBillingAddress ? "cursor-not-allowed" : ""}`} {...rest} />
                                )}
                              />
                              <span className="text-sm text-gray-700">I approve this order to be paid using my / the Participant&apos;s HCP funding.</span>
                            </label>
                          </div>
                        </div>
                    </div>
                  </div>
              </div>
            </section>

            <section className="rounded-xl bg-white p-6" aria-labelledby="checkout-shipping-heading">
              <h2 id="checkout-shipping-heading" className="mb-4 text-lg font-semibold text-gray-900">
                Shipping
              </h2>
              <label className="flex cursor-pointer items-center gap-2 text-gray-900">
                <Controller
                  name="shipToDifferentAddress"
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
                <span className="text-sm font-medium">Ship to a different address</span>
              </label>

              {watchedShipToDifferent ? (
                <div className="mt-4 space-y-4">
                  {user && shippingAddresses.length > 0 && (
                    <div>
                      <label
                        htmlFor="checkout-select-shipping-saved"
                        className="mb-2 block text-sm font-medium text-gray-900"
                      >
                        Select saved shipping address
                      </label>
                      <select
                        id="checkout-select-shipping-saved"
                        value={selectedShippingAddress}
                        onChange={(e) => {
                          const addressId = e.target.value;
                          setSelectedShippingAddress(addressId);
                          if (addressId) {
                            const address = shippingAddresses.find(a => String(a.id) === String(addressId));
                            if (address) {
                              const shipCountryVal = (address.country || 'AU').trim();
                              const shipCountryNorm = /^australia$/i.test(shipCountryVal) ? 'AU' : (shipCountryVal || 'AU');
                              setValue('shipping_first_name', address.first_name, { shouldDirty: true });
                              setValue('shipping_last_name', address.last_name, { shouldDirty: true });
                              setValue('shipping_company', address.company || '', { shouldDirty: true });
                              setValue('shipping_address_1', address.address_1, { shouldDirty: true });
                              setValue('shipping_address_2', address.address_2 || '', { shouldDirty: true });
                              setValue('shipping_city', address.city, { shouldDirty: true });
                              setValue('shipping_state', address.state, { shouldDirty: true });
                              setValue('shipping_postcode', address.postcode, { shouldDirty: true });
                              setValue('shipping_country', shipCountryNorm, { shouldDirty: true });
                            }
                          } else {
                            setValue('shipping_first_name', '', { shouldDirty: true });
                            setValue('shipping_last_name', '', { shouldDirty: true });
                            setValue('shipping_company', '', { shouldDirty: true });
                            setValue('shipping_address_1', '', { shouldDirty: true });
                            setValue('shipping_address_2', '', { shouldDirty: true });
                            setValue('shipping_city', '', { shouldDirty: true });
                            setValue('shipping_state', '', { shouldDirty: true });
                            setValue('shipping_postcode', '', { shouldDirty: true });
                            setValue('shipping_country', 'AU', { shouldDirty: true });
                          }
                        }}
                        className={`w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 ${FOCUS_RING}`}
                      >
                        <option value="">Enter address manually</option>
                        {shippingAddresses.map((address) => (
                          <option key={address.id} value={address.id}>
                            {address.label || 'Address'} - {address.address_1}, {address.city}
                          </option>
                        ))}
                      </select>
                      {selectedShippingAddress ? (
                        <p className="mt-2 rounded border border-amber-800 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                          To edit this address, select &quot;Enter address manually&quot; above.
                        </p>
                      ) : null}
                    </div>
                  )}
                  
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">First Name</label>
                      <Controller
                        name="shipping_first_name"
                        control={control}
                        render={({ field }) => (
                          <input {...field} type="text" disabled={!!selectedShippingAddress} onChange={(e) => field.onChange(nameCharsOnly(e.target.value))} className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedShippingAddress ? "bg-gray-100 cursor-not-allowed" : ""}`} />
                        )}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Last Name</label>
                      <Controller
                        name="shipping_last_name"
                        control={control}
                        render={({ field }) => (
                          <input {...field} type="text" disabled={!!selectedShippingAddress} onChange={(e) => field.onChange(nameCharsOnly(e.target.value))} className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedShippingAddress ? "bg-gray-100 cursor-not-allowed" : ""}`} />
                        )}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-sm font-medium text-gray-700">Company (Optional)</label>
                      <Controller
                        name="shipping_company"
                        control={control}
                        render={({ field }) => (
                          <input {...field} type="text" disabled={!!selectedShippingAddress} className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedShippingAddress ? "bg-gray-100 cursor-not-allowed" : ""}`} />
                        )}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-sm font-medium text-gray-700">Address</label>
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
                            disabled={!!selectedShippingAddress}
                            placeholder="Start typing your address..."
                            className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedShippingAddress ? "bg-gray-100 cursor-not-allowed" : ""}`}
                          />
                        )}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">City</label>
                      <Controller
                        name="shipping_city"
                        control={control}
                        render={({ field }) => (
                          <input {...field} type="text" disabled={!!selectedShippingAddress} className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedShippingAddress ? "bg-gray-100 cursor-not-allowed" : ""}`} />
                        )}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Postcode</label>
                      <Controller
                        name="shipping_postcode"
                        control={control}
                        render={({ field }) => (
                          <input {...field} type="text" disabled={!!selectedShippingAddress} className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedShippingAddress ? "bg-gray-100 cursor-not-allowed" : ""}`} />
                        )}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">State</label>
                      <Controller
                        name="shipping_state"
                        control={control}
                        render={({ field }) => (
                          <input {...field} type="text" disabled={!!selectedShippingAddress} className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedShippingAddress ? "bg-gray-100 cursor-not-allowed" : ""}`} />
                        )}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Country</label>
                      <Controller
                        name="shipping_country"
                        control={control}
                        render={({ field }) => (
                          <select {...field} disabled={!!selectedShippingAddress} className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedShippingAddress ? "bg-gray-100 cursor-not-allowed" : ""}`}>
                            <option value="AU">Australia</option>
                            <option value="NZ">New Zealand</option>
                          </select>
                        )}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </section>

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
          </div>

          <aside className="lg:col-span-1" aria-labelledby="checkout-order-summary-heading">
            <div className="sticky top-[12.5rem] rounded-xl bg-white p-6">
              <h2 id="checkout-order-summary-heading" className="mb-4 text-lg font-semibold text-gray-900">
                Order summary
              </h2>

              <ul className="mb-4 list-none space-y-2 p-0">
                {items.map((item) => (
                  <li key={item.id} className="flex items-start gap-3 text-sm">
                    <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded bg-gray-100">
                      {item.imageUrl ? (
                        <Image
                          src={item.imageUrl}
                          alt={`${item.name} — product thumbnail`}
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      ) : (
                        <div
                          className="grid h-full w-full place-items-center text-xs text-gray-600"
                          role="img"
                          aria-label={`No image available for ${item.name}`}
                        >
                          No image
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-900">{item.name}</div>
                      <div className="text-xs text-gray-600">Quantity: {item.qty}</div>
                      <div className="font-semibold text-gray-900">{formatPrice(Number(item.price) * item.qty)}</div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mb-4">
                <CouponInput />
              </div>

              <div className="space-y-2 border-t border-gray-200 pt-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-800">Subtotal</span>
                  <span className="font-medium text-gray-900">{formatPrice(subtotal)}</span>
                </div>
                {couponDiscount > 0 && (
                  <div className="flex items-center justify-between text-emerald-800">
                    <span>Discount {appliedCoupon && `(${appliedCoupon.code})`}</span>
                    <span className="font-medium">-{formatPrice(couponDiscount)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-gray-800">Shipping</span>
                  <span className="font-medium text-gray-900">{formatPrice(shippingCost)}</span>
                </div>
                {parcelProtectionFee > 0 && (
                  <div className="flex animate-in fade-in slide-in-from-top-1 duration-200 items-center justify-between">
                    <span className="text-gray-800">Parcel protection</span>
                    <span className="font-medium text-gray-900">{formatPrice(PARCEL_PROTECTION_FEE_AUD)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-gray-800">GST (10%)</span>
                  <span className="font-medium text-gray-900">{formatPrice(gst)}</span>
                </div>
                <div className="mt-4 border-t border-gray-200 pt-3">
                  <div className="flex items-center justify-between text-base">
                    <span className="font-semibold text-gray-900">Total</span>
                    <span className="text-lg font-bold text-gray-900">{formatPrice(orderTotal)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 border-t border-gray-200 pt-4">
                <h3 id="checkout-sidebar-shipping-method" className="mb-4 text-base font-semibold text-gray-900">
                  Shipping method
                </h3>
                <fieldset
                  className="min-w-0 border-0 p-0"
                  aria-labelledby="checkout-sidebar-shipping-method"
                  aria-describedby={errors.shippingMethod ? "checkout-shipping-method-err" : undefined}
                >
                  <legend className="sr-only">Choose a shipping method for your order</legend>
                  <Controller
                    name="shippingMethod"
                    control={control}
                    render={({ field }) => {
                      const shipCountry = watchedShipToDifferent ? shippingCountry : billingCountry;
                      const shipPostcode = watchedShipToDifferent ? shippingPostcode : billingPostcode;
                      const shipState = watchedShipToDifferent ? shippingState : billingState;
                      const shipCity = watchedShipToDifferent ? shippingCity : billingCity;
                      return (
                        <ShippingOptions
                          key={`shipping-${shipCountry}-${shipPostcode}-${shipState}-${shipCity}`}
                          country={shipCountry}
                          postcode={shipPostcode}
                          state={shipState}
                          city={shipCity}
                          subtotal={cartSubtotal}
                          items={items}
                          selectedRateId={(field.value as ShippingMethodType | undefined)?.id}
                          onRateChange={(rateId, rate) => {
                            field.onChange({
                              id: rateId,
                              method_id: rate.id,
                              label: rate.label,
                              cost: rate.cost,
                              total: rate.cost,
                              description: rate.description,
                            });
                          }}
                          showLabel={false}
                          className=""
                        />
                      );
                    }}
                  />
                </fieldset>
                {errors.shippingMethod && (
                  <p id="checkout-shipping-method-err" className="mt-2 text-xs text-rose-700">
                    {errors.shippingMethod.message}
                  </p>
                )}
              </div>

              <div className="mt-6 border-t pt-4">
                <Controller
                  name="insurance_option"
                  control={control}
                  render={({ field }) => (
                    <ParcelProtection
                      insurance_option={
                        field.value === "yes" || field.value === "no"
                          ? field.value
                          : "no"
                      }
                      onInsuranceChange={field.onChange}
                    />
                  )}
                />
              </div>

              <div className="mt-6 border-t border-gray-200 pt-4">
                <h3 id="checkout-payment-heading" className="mb-4 text-base font-semibold text-gray-900">
                  Payment method
                </h3>
                <fieldset
                  className="min-w-0 border-0 p-0"
                  aria-labelledby="checkout-payment-heading"
                >
                  <legend className="sr-only">Choose how you will pay</legend>
                  <div className="space-y-2">
                    {paymentMethods.map((method) => {
                      const id = method;
                      const title =
                        id === "cod"
                          ? "On account (manual payment)"
                          : "Credit card (eWAY)";
                      const radioId = `checkout-payment-${id}`;
                      return (
                        <label
                          key={id}
                          htmlFor={radioId}
                          className={`flex cursor-pointer items-start gap-3 rounded border border-gray-300 p-3 hover:bg-gray-50 ${FOCUS_RING_BTN}`}
                        >
                          <input
                            id={radioId}
                            type="radio"
                            name="checkout_payment_method"
                            value={id}
                            checked={selectedPaymentMethod === id}
                            onChange={() =>
                              setSelectedPaymentMethod(id as "eway" | "cod")
                            }
                            className={`mt-1 h-4 w-4 border-gray-300 text-gray-900 ${FOCUS_RING}`}
                          />
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{title}</div>
                            {id === "cod" ? (
                              <div className="mt-1 space-y-0.5 text-xs text-gray-700">
                                {ON_ACCOUNT_BANK_LINES.map((line) => (
                                  <div key={line.label}>
                                    <span className="font-medium text-gray-800">{line.label}:</span>{" "}
                                    {line.value}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="mt-1 text-xs text-gray-700">
                                Secure hosted payment via eWAY.
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </div>

              <div className="mt-6 border-t border-gray-200 pt-4">
                <label className="flex cursor-pointer items-start gap-2 text-gray-900" htmlFor="checkout-terms">
                  <Controller
                    name="termsAccepted"
                    control={control}
                    render={({ field: { value, onChange, ...field } }) => (
                      <input
                        {...field}
                        id="checkout-terms"
                        type="checkbox"
                        checked={value || false}
                        onChange={(e) => onChange(e.target.checked)}
                        aria-invalid={errors.termsAccepted ? "true" : "false"}
                        aria-describedby={
                          errors.termsAccepted ? "checkout-terms-err" : undefined
                        }
                        aria-required="true"
                        className={`mt-1 h-4 w-4 rounded border-gray-300 text-gray-900 ${FOCUS_RING}`}
                      />
                    )}
                  />
                  <span className="text-sm">
                    I agree to the{" "}
                    <Link
                      href="/terms"
                      className={`font-medium text-blue-800 underline decoration-blue-800 underline-offset-2 hover:text-blue-950 ${FOCUS_RING_LINK}`}
                    >
                      Terms and Conditions
                    </Link>{" "}
                    and{" "}
                    <Link
                      href="/privacy"
                      className={`font-medium text-blue-800 underline decoration-blue-800 underline-offset-2 hover:text-blue-950 ${FOCUS_RING_LINK}`}
                    >
                      Privacy Policy
                    </Link>
                    <RequiredMark />
                  </span>
                </label>
                {errors.termsAccepted && (
                  <p id="checkout-terms-err" className="mt-1 text-xs text-rose-700">
                    {errors.termsAccepted.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={placing}
                aria-busy={placing}
                className={`mt-6 w-full rounded-md bg-gray-900 px-4 py-3 text-center text-sm font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING_BTN} focus:ring-offset-white`}
              >
                {placing
                  ? selectedPaymentMethod === "eway"
                    ? "Redirecting to secure payment…"
                    : "Placing on-account order…"
                  : selectedPaymentMethod === "eway"
                    ? ewayTokenFlowEnabled
                      ? "Verify & pay"
                      : "Pay securely with card"
                    : "Place on account order"}
              </button>
            </div>
          </aside>
        </form>
      </div>
    </>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="container flex min-h-screen items-center justify-center bg-gray-50 py-10">
          <div className="text-center" role="status" aria-live="polite">
            <div
              className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-900 border-r-transparent"
              aria-hidden="true"
            />
            <p className="mt-4 text-gray-900">Loading checkout…</p>
          </div>
        </div>
      }
    >
      <CheckoutPageContent />
    </Suspense>
  );
}