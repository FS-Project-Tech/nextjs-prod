"use client";

import { useEffect, useState, Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { parseCartTotal, calculateGST, calculateTotal } from "@/lib/cart-utils";
import { formatPrice } from "@/lib/format-utils";
import { isValidName, isValidAuPhone, nameCharsOnly, digitsOnly } from "@/lib/form-validation";
import {
  parseCheckoutSuccessCookieFromDocument,
  clearCheckoutSuccessCookieClient,
} from "@/lib/checkout-success-cookie";

interface ShippingMethodType {
  id: string;
  method_id: string;
  label: string;
  cost: number;
  total: number;
  description?: string;
}

/** If the JSON body is empty or stripped by a proxy, same-origin fetch can still read these headers from our API route. */
function buildCheckoutDataFromSuccessHeaders(res: Response): Record<string, unknown> | null {
  const successH = res.headers.get("x-checkout-success")?.trim();
  const redirectUrl = res.headers.get("x-redirect-url")?.trim();
  const orderIdH = res.headers.get("x-order-id")?.trim();
  const orderNumH = res.headers.get("x-order-number")?.trim();
  if (successH !== "1" || (!redirectUrl && !orderIdH && !orderNumH)) {
    return null;
  }
  const ref = orderNumH || orderIdH || "";
  return {
    success: true,
    order: {
      id: orderIdH ? Number(orderIdH) : undefined,
      number: orderNumH || orderIdH,
      order_number: orderNumH || orderIdH,
    },
    redirect_url:
      redirectUrl ||
      `/checkout/order-review?orderId=${encodeURIComponent(String(ref))}`,
  };
}

/** Fallback when both body and X-* headers are stripped; server sets checkout_done cookie on success. */
function buildCheckoutDataFromSuccessCookie(): Record<string, unknown> | null {
  const parsed = parseCheckoutSuccessCookieFromDocument();
  if (!parsed) return null;
  const { id, ref } = parsed;
  const orderIdParam = ref || id;
  return {
    success: true,
    order: {
      id: id ? Number(id) : undefined,
      number: ref || id,
      order_number: ref || id,
    },
    redirect_url: `/checkout/order-review?orderId=${encodeURIComponent(orderIdParam)}`,
  };
}

/**
 * Full page navigation to order review — loads order via ?recover=<idempotency_key>
 * when POST returned 200 but fetch could not read body/headers (proxy / cross-origin quirk).
 */
function redirectToOrderReviewWithRecoverKey(idempotencyKey: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem("checkout_recover_ik", idempotencyKey);
  } catch {
    /* ignore */
  }
  window.location.replace(
    `/checkout/order-review?recover=${encodeURIComponent(idempotencyKey)}`
  );
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
  paymentMethod: yup.string().required("Payment method is required"),
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
  termsAccepted: yup.boolean().oneOf([true], "You must accept the terms and conditions").required(),
});

type CheckoutFormData = yup.InferType<typeof checkoutSchema>;

function CheckoutPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { items, clear, syncWithWooCommerce, total } = useCart();
  const { success, error: showError } = useToast();
  const { appliedCoupon, discount, calculateDiscount } = useCoupon();
  
  
  const [isMounted, setIsMounted] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string>("");
  const [enabledPaymentMethods, setEnabledPaymentMethods] = useState<
    Array<{ id: string; title: string; description?: string; enabled: boolean }>
  >([]);
  const [selectedBillingAddress, setSelectedBillingAddress] = useState<string>("");
  const [selectedShippingAddress, setSelectedShippingAddress] = useState<string>("");
  const [openNdisSection, setOpenNdisSection] = useState(false);
  const [openHcpSection, setOpenHcpSection] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [quoteConversion, setQuoteConversion] = useState<{
    quote_id: string;
    quote_number: string;
    subtotal: number;
    shipping: number;
    shipping_method?: string;
    discount: number;
    total: number;
    notes?: string;
  } | null>(null);
  
  const { user } = useUser();
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
  const watchedPaymentMethod = watch("paymentMethod");

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
    if (typeof window !== "undefined") {
      const cookies = document.cookie.split(';');
      const csrfCookie = cookies.find(c => c.trim().startsWith('csrf-token='));
      if (csrfCookie) {
        const token = csrfCookie.split('=')[1];
        setCsrfToken(token);
      } else {
        setCsrfToken('');
      }
    }
  }, []);

  const cartSubtotal = useMemo(() => parseCartTotal(total), [total]);
  const itemsCount = items.length;
  const itemsString = useMemo(() => {
    if (items.length === 0) return '[]';
    return JSON.stringify(items);
  }, [itemsCount]);

  useEffect(() => {
    if (!isMounted) return;

    (async () => {
      try {
        const paymentRes = await fetch("/api/payment-methods", { cache: "no-store" });
        const paymentData = await paymentRes.json();
        if (paymentData.paymentMethods && Array.isArray(paymentData.paymentMethods)) {
          setEnabledPaymentMethods(paymentData.paymentMethods.filter((m: any) => m.enabled));
          if (paymentData.paymentMethods.length > 0 && !watchedPaymentMethod) {
            setValue("paymentMethod", paymentData.paymentMethods[0].id);
          }
        }
      } catch {
        setEnabledPaymentMethods([
          { id: "cod", title: "Cash on Delivery", enabled: true },
          { id: "bacs", title: "Direct Bank Transfer", enabled: true },
        ]);
        if (!watchedPaymentMethod) {
          setValue("paymentMethod", "bacs");
        }
      }
    })();
  }, [isMounted, watchedPaymentMethod, setValue]);

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
  const gst = calculateGST(subtotal, shippingCost, couponDiscount);
  const orderTotal = calculateTotal(subtotal, shippingCost, couponDiscount, gst);

  const onSubmit = async (data: CheckoutFormData): Promise<void> => {
    if (items.length === 0) {
      showError("Your cart is empty");
      return;
    }

    setPlacing(true);

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
      await syncWithWooCommerce();

      let paymentProcessed = false;
      const offlinePaymentMethods = ["cod", "bacs", "bank_transfer", "cheque"];
      const isOfflinePayment = offlinePaymentMethods.includes(data.paymentMethod);

      if (!isOfflinePayment && data.paymentMethod === "paypal") {
        try {
          const paymentRes = await fetch("/api/payments/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              payment_method: data.paymentMethod,
              amount: orderTotal,
              currency: "AUD",
              billing,
              return_url: typeof window !== "undefined" ? window.location.href : "",
            }),
          });

          const paymentData = await paymentRes.json();
          if (!paymentRes.ok || !paymentData.success) {
            showError(paymentData.error || "Payment processing failed");
            setPlacing(false);
            return;
          }
          paymentProcessed = paymentData.requires_payment !== false;
        } catch (paymentError) {
          console.error("Payment processing error:", paymentError);
          showError("Payment processing failed");
          setPlacing(false);
          return;
        }
      }

      const finalShipping = data.shipToDifferentAddress ? shipping : billing;

      let shippingMethodData: any = null;
      if (data.shippingMethod) {
        const sm = data.shippingMethod as ShippingMethodType;
        shippingMethodData = {
          method_id: sm.method_id || "flat_rate",
          total: String(sm.total || sm.cost || 0),
        };
      }

      const checkoutPayload: any = {
        billing,
        shipping: {
          first_name: finalShipping.first_name || "",
          last_name: finalShipping.last_name || "",
          company: finalShipping.company || "",
          address_1: finalShipping.address_1 || "",
          address_2: finalShipping.address_2 || "",
          city: finalShipping.city || "",
          state: finalShipping.state || "",
          postcode: finalShipping.postcode || "",
          country: finalShipping.country || "AU",
        },
        payment_method: data.paymentMethod || "",
        payment_processed: paymentProcessed,
        line_items: items.map((i) => ({
          product_id: i.productId,
          variation_id: i.variationId || undefined,
          quantity: i.qty,
          name: i.name || "",
          price: i.price || "0",
          sku: i.sku || "",
          slug: i.slug || "",
        })),
        shipping_lines: shippingMethodData ? [shippingMethodData] : [],
        total: orderTotal,
      };

      const couponCode = appliedCoupon?.code || searchParams.get("coupon");
      if (couponCode) {
        checkoutPayload.coupon_code = couponCode;
      }

      if (csrfToken) {
        checkoutPayload.csrf_token = csrfToken;
      }

      const ndisNum = data.cust_woo_ndis_number ?? data.ndis_number;
      const ndisName = data.cust_woo_ndis_participant_name ?? data.ndis_participant_name;
      const ndisDob = data.cust_woo_ndis_dob ?? data.ndis_dob;
      const ndisFunding = data.cust_woo_ndis_funding_type ?? data.ndis_funding_type;
      const ndisApproval = data.cust_woo_ndis_approval ?? data.ndis_approval;
      const ndisEmail = data.cust_woo_invoice_email ?? data.billing_ndis_invoice_email;
      const hcpNum = data.cust_woo_hcp_number ?? data.hcp_number;
      const hcpName = data.cust_woo_hcp_participant_name ?? data.hcp_participant_name;
      const hcpEmail = data.cust_woo_provider_email ?? data.hcp_provider_email;
      const hcpApproval = data.cust_woo_hcp_approval ?? data.hcp_approval;
      if (ndisNum) checkoutPayload.ndis_number = ndisNum;
      if (ndisName) checkoutPayload.ndis_participant_name = ndisName;
      if (ndisDob) checkoutPayload.ndis_dob = ndisDob;
      if (ndisFunding) checkoutPayload.ndis_funding_type = ndisFunding;
      if (ndisApproval) checkoutPayload.ndis_approval = ndisApproval;
      if (ndisEmail) checkoutPayload.billing_ndis_invoice_email = ndisEmail;
      if (hcpNum) checkoutPayload.hcp_number = hcpNum;
      if (hcpName) checkoutPayload.hcp_participant_name = hcpName;
      if (hcpEmail) checkoutPayload.hcp_provider_email = hcpEmail;
      if (hcpApproval) checkoutPayload.hcp_approval = hcpApproval;

      checkoutPayload.delivery_authority = data.deliveryAuthority || "with_signature";

      if (data.deliveryInstructions) {
        checkoutPayload.delivery_instructions = data.deliveryInstructions;
      }

      checkoutPayload.do_not_send_paperwork = data.doNotSendPaperwork || false;
      checkoutPayload.discreet_packaging = data.discreetPackaging || false;
      checkoutPayload.subscribe_newsletter = data.subscribe_newsletter || false;

      if (quoteConversion) {
        checkoutPayload.quote_id = quoteConversion.quote_id;
        checkoutPayload.quote_number = quoteConversion.quote_number;
      }

      const idempotencyKeyClient =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `idem-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      checkoutPayload.idempotency_key = idempotencyKeyClient;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (csrfToken) {
        headers["x-csrf-token"] = csrfToken;
      }

      let payloadString: string;
      try {
        payloadString = JSON.stringify(checkoutPayload);
      } catch (stringifyError) {
        console.error("Error stringifying checkout payload:", stringifyError);
        showError("Invalid checkout data. Please refresh and try again.");
        setPlacing(false);
        return;
      }

      const checkoutRes = await fetch("/api/checkout", {
        method: "POST",
        headers,
        body: payloadString,
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!checkoutRes.ok) {
        let errorData: any = {};
        let errorMessage = "Failed to create order";
        
        try {
          const text = await checkoutRes.text();
          if (text) {
            try {
              errorData = JSON.parse(text);
              errorMessage = errorData.error || errorData.message || errorMessage;
            } catch (parseError) {
              console.error("Error parsing error response:", parseError);
              errorMessage = text || `Server returned ${checkoutRes.status} ${checkoutRes.statusText}`;
            }
          } else {
            errorMessage = `Server returned ${checkoutRes.status} ${checkoutRes.statusText || 'error'}`;
          }
        } catch (readError) {
          console.error("Error reading error response:", readError);
          errorMessage = `Server error (${checkoutRes.status}). Please try again.`;
        }
        
        console.error("Checkout API error:", {
          status: checkoutRes.status,
          statusText: checkoutRes.statusText,
          error: errorData,
        });
        
        showError(errorMessage);
        setPlacing(false);
        return;
      }

      let checkoutData: any = null;
      try {
        const text = await checkoutRes.text();
        let parseFailed = false;

        if (text) {
          try {
            checkoutData = JSON.parse(text);
          } catch (parseError) {
            parseFailed = true;
            console.error("Error parsing checkout response:", {
              error: parseError,
              responseText: text.substring(0, 200),
              status: checkoutRes.status,
              headers: Object.fromEntries(checkoutRes.headers.entries()),
            });
          }
        }

        const validBody =
          checkoutData &&
          typeof checkoutData === "object" &&
          checkoutData.success === true &&
          checkoutData.order;

        if (!validBody) {
          const fromHeaders = buildCheckoutDataFromSuccessHeaders(checkoutRes);
          let fromCookie: Record<string, unknown> | null = null;
          if (!fromHeaders && typeof document !== "undefined") {
            // Set-Cookie from the response is applied before fetch resolves; one microtask helps edge browsers.
            await Promise.resolve();
            fromCookie = buildCheckoutDataFromSuccessCookie();
          }
          let recovered: Record<string, unknown> | null =
            (fromHeaders as Record<string, unknown> | null) ||
            fromCookie;

          if (!recovered) {
            try {
              const resultRes = await fetch(
                `/api/checkout/result?key=${encodeURIComponent(idempotencyKeyClient)}`,
                { method: "GET", credentials: "same-origin", cache: "no-store" }
              );
              if (resultRes.ok) {
                const rt = await resultRes.text();
                if (rt) {
                  const parsed = JSON.parse(rt) as Record<string, unknown>;
                  if (parsed?.success === true && parsed?.order) {
                    recovered = parsed;
                  }
                }
              }
            } catch (recoverErr) {
              console.warn("Checkout idempotency recovery request failed:", recoverErr);
            }
          }

          if (recovered) {
            console.warn("Checkout: recovered success (order was created).", {
              hadText: !!text,
              parseFailed,
              status: checkoutRes.status,
              source: fromHeaders ? "headers" : fromCookie ? "cookie" : "idempotency",
            });
            checkoutData = recovered;
          } else {
            console.warn("Checkout: response not readable — opening order confirmation to resolve order", {
              hadText: !!text,
              parseFailed,
              status: checkoutRes.status,
            });
            setIsRedirecting(true);
            redirectToOrderReviewWithRecoverKey(idempotencyKeyClient);
            return;
          }
        }
      } catch (readError: any) {
        console.error("Error reading checkout response:", readError);
        setIsRedirecting(true);
        redirectToOrderReviewWithRecoverKey(idempotencyKeyClient);
        return;
      }

      if (checkoutData.success && checkoutData.order) {
        clearCheckoutSuccessCookieClient();

        if (data.subscribe_newsletter && data.billing_email) {
          try {
            await fetch("/api/newsletter/subscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: data.billing_email }),
            });
          } catch {}
        }

        // Save checkout billing/shipping to user's address book so they appear in WP backend (Edit User → Customer Billing/Shipping Address Secondary)
        if (user) {
          const billingPayload = {
            type: "billing",
            sync_primary: true,
            first_name: billing.first_name,
            last_name: billing.last_name,
            email: billing.email,
            phone: billing.phone,
            company: billing.company,
            address_1: billing.address_1,
            address_2: billing.address_2,
            city: billing.city,
            state: billing.state,
            postcode: billing.postcode,
            country: billing.country,
            ndis_participant_name: (data.cust_woo_ndis_participant_name ?? data.ndis_participant_name) || "",
            ndis_number: (data.cust_woo_ndis_number ?? data.ndis_number) || "",
            ndis_dob: (data.cust_woo_ndis_dob ?? data.ndis_dob) || "",
            ndis_funding_type: (data.cust_woo_ndis_funding_type ?? data.ndis_funding_type) || "",
            ndis_approval: (data.cust_woo_ndis_approval ?? data.ndis_approval) || false,
            ndis_invoice_email: (data.cust_woo_invoice_email ?? data.billing_ndis_invoice_email) || "",
            hcp_participant_name: (data.cust_woo_hcp_participant_name ?? data.hcp_participant_name) || "",
            hcp_number: (data.cust_woo_hcp_number ?? data.hcp_number) || "",
            hcp_provider_email: (data.cust_woo_provider_email ?? data.hcp_provider_email) || "",
            hcp_approval: (data.cust_woo_hcp_approval ?? data.hcp_approval) || false,
          };
          try {
            await fetch("/api/dashboard/addresses", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify(billingPayload),
            });
          } catch {}
          if (data.shipToDifferentAddress) {
            const shippingPayload = {
              type: "shipping",
              sync_primary: true,
              first_name: shipping.first_name,
              last_name: shipping.last_name,
              company: shipping.company,
              address_1: shipping.address_1,
              address_2: shipping.address_2,
              city: shipping.city,
              state: shipping.state,
              postcode: shipping.postcode,
              country: shipping.country,
              phone: billing.phone,
              email: billing.email,
            };
            try {
              await fetch("/api/dashboard/addresses", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(shippingPayload),
              });
            } catch {}
          }
        }
        success("Order placed successfully!");

        const redirectUrl =
          checkoutData.redirect_url ||
          `/checkout/order-review?orderId=${checkoutData.order.number ?? checkoutData.order.order_number ?? checkoutData.order.id}`;

        setIsRedirecting(true);
        window.location.href = redirectUrl;

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
        } catch (e) {
          console.warn("Failed to fully clear cart:", e);
        }
        
        } else {
          showError("Failed to create order");
        }
        } catch (error: any) {
          console.error("Checkout error:", error);
          showError(error.message || "An error occurred while placing your order");
        } finally {
          setPlacing(false);
        }
  };

  if (!isMounted) {
    return (
      <div className="container min-h-screen bg-gray-50 py-10 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    if (isRedirecting) {
      return (
        <div className="container min-h-screen py-10">
          <div className="text-center py-20">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent mb-4"></div>
            <h1 className="text-2xl font-semibold mb-4">Redirecting to order confirmation...</h1>
          </div>
        </div>
      );
    }
    return (
      <div className="container min-h-screen py-10">
          <div className="text-center py-20">
            <h1 className="text-2xl font-semibold mb-4">Your cart is empty</h1>
            <Link
              href="/shop"
              className="inline-block rounded-md bg-gray-900 px-6 py-3 text-white hover:bg-black"
            >
              Continue Shopping
            </Link>
          </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-10 container">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Checkout</h1>
          <Link
            href={getCartUrl()}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            View Cart
          </Link>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-xl bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold">Billing Details</h2>
              {user && billingAddresses.length > 0 && (
                <div className="mb-4">
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Select Saved Billing Address
                  </label>
                  <select
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
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Enter address manually</option>
                    {billingAddresses.map((address) => (
                      <option key={address.id} value={address.id}>
                        {address.label || 'Address'} - {address.address_1}, {address.city}
                      </option>
                    ))}
                  </select>
                  {selectedBillingAddress ? (
                    <p className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                      To edit this address, select &quot;Enter address manually&quot; above.
                    </p>
                  ) : null}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    First Name <span className="text-rose-600">*</span>
                  </label>
                  <Controller
                    name="billing_first_name"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="text"
                        disabled={!!selectedBillingAddress}
                        onChange={(e) => field.onChange(nameCharsOnly(e.target.value))}
                        className={`w-full rounded border px-3 py-2 text-sm ${errors.billing_first_name ? "border-rose-500" : "border-gray-300"} ${selectedBillingAddress ? "bg-gray-100 cursor-not-allowed" : ""}`}
                      />
                    )}
                  />
                  {errors.billing_first_name && (
                    <p className="mt-1 text-xs text-rose-600">{errors.billing_first_name.message}</p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Last Name <span className="text-rose-600">*</span>
                  </label>
                  <Controller
                    name="billing_last_name"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="text"
                        disabled={!!selectedBillingAddress}
                        onChange={(e) => field.onChange(nameCharsOnly(e.target.value))}
                        className={`w-full rounded border px-3 py-2 text-sm ${errors.billing_last_name ? "border-rose-500" : "border-gray-300"} ${selectedBillingAddress ? "bg-gray-100 cursor-not-allowed" : ""}`}
                      />
                    )}
                  />
                  {errors.billing_last_name && (
                    <p className="mt-1 text-xs text-rose-600">{errors.billing_last_name.message}</p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Email <span className="text-rose-600">*</span>
                  </label>
                  <Controller
                    name="billing_email"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="email"
                        disabled={!!selectedBillingAddress}
                        className={`w-full rounded border px-3 py-2 text-sm ${errors.billing_email ? "border-rose-500" : "border-gray-300"} ${selectedBillingAddress ? "bg-gray-100 cursor-not-allowed" : ""}`}
                      />
                    )}
                  />
                  {errors.billing_email && (
                    <p className="mt-1 text-xs text-rose-600">{errors.billing_email.message}</p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Phone <span className="text-rose-600">*</span>
                  </label>
                  <Controller
                    name="billing_phone"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="tel"
                        disabled={!!selectedBillingAddress}
                        maxLength={10}
                        onChange={(e) => field.onChange(digitsOnly(e.target.value).slice(0, 10))}
                        className={`w-full rounded border px-3 py-2 text-sm ${errors.billing_phone ? "border-rose-500" : "border-gray-300"} ${selectedBillingAddress ? "bg-gray-100 cursor-not-allowed" : ""}`}
                      />
                    )}
                  />
                  {errors.billing_phone && (
                    <p className="mt-1 text-xs text-rose-600">{errors.billing_phone.message}</p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Company (Optional)</label>
                  <Controller
                    name="billing_company"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="text"
                        disabled={!!selectedBillingAddress}
                        className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedBillingAddress ? "bg-gray-100 cursor-not-allowed" : ""}`}
                      />
                    )}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Address <span className="text-rose-600">*</span>
                  </label>
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
                        disabled={!!selectedBillingAddress}
                        error={!!errors.billing_address_1}
                        placeholder="Start typing your address..."
                        className={`w-full rounded border px-3 py-2 text-sm ${errors.billing_address_1 ? "border-rose-500" : "border-gray-300"} ${selectedBillingAddress ? "bg-gray-100 cursor-not-allowed" : ""}`}
                      />
                    )}
                  />
                  {errors.billing_address_1 && (
                    <p className="mt-1 text-xs text-rose-600">{errors.billing_address_1.message}</p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Address 2 (Optional)</label>
                  <Controller
                    name="billing_address_2"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="text"
                        disabled={!!selectedBillingAddress}
                        className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${selectedBillingAddress ? "bg-gray-100 cursor-not-allowed" : ""}`}
                      />
                    )}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    City <span className="text-rose-600">*</span>
                  </label>
                  <Controller
                    name="billing_city"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="text"
                        disabled={!!selectedBillingAddress}
                        className={`w-full rounded border px-3 py-2 text-sm ${errors.billing_city ? "border-rose-500" : "border-gray-300"} ${selectedBillingAddress ? "bg-gray-100 cursor-not-allowed" : ""}`}
                      />
                    )}
                  />
                  {errors.billing_city && (
                    <p className="mt-1 text-xs text-rose-600">{errors.billing_city.message}</p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Postcode <span className="text-rose-600">*</span>
                  </label>
                  <Controller
                    name="billing_postcode"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="text"
                        disabled={!!selectedBillingAddress}
                        className={`w-full rounded border px-3 py-2 text-sm ${errors.billing_postcode ? "border-rose-500" : "border-gray-300"} ${selectedBillingAddress ? "bg-gray-100 cursor-not-allowed" : ""}`}
                      />
                    )}
                  />
                  {errors.billing_postcode && (
                    <p className="mt-1 text-xs text-rose-600">{errors.billing_postcode.message}</p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    State <span className="text-rose-600">*</span>
                  </label>
                  <Controller
                    name="billing_state"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="text"
                        disabled={!!selectedBillingAddress}
                        className={`w-full rounded border px-3 py-2 text-sm ${errors.billing_state ? "border-rose-500" : "border-gray-300"} ${selectedBillingAddress ? "bg-gray-100 cursor-not-allowed" : ""}`}
                      />
                    )}
                  />
                  {errors.billing_state && (
                    <p className="mt-1 text-xs text-rose-600">{errors.billing_state.message}</p>
                  )}
                </div>
                <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Country <span className="text-rose-600">*</span>
                </label>

                <>
                  {/* Hidden field sent to WooCommerce */}
                  <input
                    type="hidden"
                    value="AU"
                    {...register("billing_country", { required: true })}
                  />

                  {/* Display only */}
                  <input
                    type="text"
                    value="Australia"
                    disabled
                    className="w-full rounded border border-gray-300 bg-gray-100 px-3 py-2 text-sm"
                  />
                </>

                {errors.billing_country && (
                  <p className="mt-1 text-xs text-rose-600">
                    Country is required
                  </p>
                )}
              </div>
              </div>

              <div className="mt-6 space-y-4 border-t border-gray-200 pt-6">
                  <div className="rounded-lg border border-gray-200 bg-gray-50/50">
                    <button
                      type="button"
                      onClick={() => setOpenNdisSection((v) => !v)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left"
                    >
                      <span className="text-sm font-medium text-gray-700">Enter your NDIS information</span>
                      <span className="text-gray-500 text-sm">{openNdisSection ? "−" : "+"}</span>
                    </button>
                    {openNdisSection && (
                      <div className="border-t border-gray-200 bg-white px-4 py-4">
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
                    )}
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50/50">
                    <button
                      type="button"
                      onClick={() => setOpenHcpSection((v) => !v)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left"
                    >
                      <span className="text-sm font-medium text-gray-700">Enter your Home Care Package information</span>
                      <span className="text-gray-500 text-sm">{openHcpSection ? "−" : "+"}</span>
                    </button>
                    {openHcpSection && (
                      <div className="border-t border-gray-200 bg-white px-4 py-4">
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
                    )}
                  </div>
              </div>
            </div>

            <div className="rounded-xl bg-white p-6">
              <label className="flex items-center gap-2">
                <Controller
                  name="shipToDifferentAddress"
                  control={control}
                  render={({ field: { value, onChange, ...field } }) => (
                    <input
                      type="checkbox"
                      {...field}
                      checked={value || false}
                      onChange={(e) => onChange(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  )}
                />
                <span className="text-sm font-medium text-gray-700">Ship to a different address</span>
              </label>

              {watchedShipToDifferent ? (
                <div className="mt-4 space-y-4">
                  {user && shippingAddresses.length > 0 && (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Select Saved Shipping Address
                      </label>
                      <select
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
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="">Enter address manually</option>
                        {shippingAddresses.map((address) => (
                          <option key={address.id} value={address.id}>
                            {address.label || 'Address'} - {address.address_1}, {address.city}
                          </option>
                        ))}
                      </select>
                      {selectedShippingAddress ? (
                        <p className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
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
            </div>

{/* Additional Information */}
<div className="rounded-xl bg-white p-6">
  <h2 className="mb-4 text-lg font-semibold">Additional Information</h2>

  <div className="space-y-6">

    {/* Delivery Authority */}
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700">
        Delivery Authority
      </label>

      <div className="flex gap-6">

        {/* With Signature */}
        <label className="flex items-center gap-2">
          <Controller
            name="deliveryAuthority"
            control={control}
            render={({ field }) => (
              <input
                type="checkbox"
                checked={field.value === "with_signature"}
                onChange={() =>
                  field.onChange(
                    field.value === "with_signature" ? "" : "with_signature"
                  )
                }
                className="h-4 w-4 rounded border-gray-300"
              />
            )}
          />
          <span className="text-sm text-gray-700">
            With Signature Required
          </span>
        </label>

        {/* Without Signature */}
        <label className="flex items-center gap-2">
          <Controller
            name="deliveryAuthority"
            control={control}
            render={({ field }) => (
              <input
                type="checkbox"
                checked={field.value === "without_signature"}
                onChange={() =>
                  field.onChange(
                    field.value === "without_signature"
                      ? ""
                      : "without_signature"
                  )
                }
                className="h-4 w-4 rounded border-gray-300"
              />
            )}
          />
          <span className="text-sm text-gray-700">
            Without Signature
          </span>
        </label>

      </div>
    </div>

    {/* Do not send paperwork */}
    <label className="flex items-center gap-2">
      <Controller
        name="doNotSendPaperwork"
        control={control}
        render={({ field: { value, onChange, ...field } }) => (
          <input
            type="checkbox"
            {...field}
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
        )}
      />
      <span className="text-sm text-gray-700">
        Do not Send Paperwork With Delivery (optional)
      </span>
    </label>

    {/* Discreet Packaging */}
    <label className="flex items-center gap-2">
      <Controller
        name="discreetPackaging"
        control={control}
        render={({ field: { value, onChange, ...field } }) => (
          <input
            type="checkbox"
            {...field}
            checked={value || false}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
        )}
      />
      <span className="text-sm text-gray-700">
        Discreet Packaging (optional)
      </span>
    </label>

    {/* Newsletter */}
    <label className="flex items-center gap-2">
      <Controller
        name="subscribe_newsletter"
        control={control}
        render={({ field: { value, onChange, ...field } }) => (
          <input
            type="checkbox"
            {...field}
            checked={value || false}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
        )}
      />
      <span className="text-sm text-gray-700">
        Subscribe to our newsletter
      </span>
    </label>

    {/* Delivery Instructions */}
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        Delivery Instructions (Optional)
      </label>
      <Controller
        name="deliveryInstructions"
        control={control}
        render={({ field }) => (
          <textarea
            {...field}
            rows={3}
            placeholder="Special delivery instructions..."
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        )}
      />
    </div>

  </div>
</div>
          </div>

          <div className="lg:col-span-1">
            <div className="rounded-xl bg-white p-6 sticky top-[12.5rem]">
              <h2 className="mb-4 text-lg font-semibold">Order Summary</h2>

              <div className="mb-4 space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 text-sm">
                    <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded bg-gray-100">
                      {item.imageUrl ? (
                        <Image src={item.imageUrl} alt={item.name} fill sizes="64px" className="object-cover" />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-xs text-gray-400">No Image</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900">{item.name}</div>
                      <div className="text-xs text-gray-500">Qty: {item.qty}</div>
                      <div className="font-semibold text-gray-900">{formatPrice(Number(item.price) * item.qty)}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mb-4">
                <CouponInput />
              </div>

              <div className="space-y-2 border-t pt-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium">{formatPrice(subtotal)}</span>
                </div>
                {couponDiscount > 0 && (
                  <div className="flex items-center justify-between text-emerald-600">
                    <span>Discount {appliedCoupon && `(${appliedCoupon.code})`}</span>
                    <span className="font-medium">-{formatPrice(couponDiscount)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Shipping</span>
                  <span className="font-medium">{formatPrice(shippingCost)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">GST (10%)</span>
                  <span className="font-medium">{formatPrice(gst)}</span>
                </div>
                <div className="mt-4 border-t pt-3">
                  <div className="flex items-center justify-between text-base">
                    <span className="font-semibold">Total</span>
                    <span className="font-bold text-lg">{formatPrice(orderTotal)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 border-t pt-4">
                <h2 className="mb-4 text-lg font-semibold">Shipping Method</h2>
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
                {errors.shippingMethod && (
                  <p className="mt-2 text-xs text-rose-600">{errors.shippingMethod.message}</p>
                )}
              </div>

              <div className="mt-6 border-t pt-4">
                <h2 className="mb-4 text-lg font-semibold">Payment Method</h2>
                <div className="space-y-2">
                  {enabledPaymentMethods.map((method) => (
                    <label
                      key={method.id}
                      className="flex cursor-pointer items-start gap-3 rounded border p-3 hover:bg-gray-50"
                    >
                      <Controller
                        name="paymentMethod"
                        control={control}
                        render={({ field }) => (
                          <input
                            type="radio"
                            {...field}
                            value={method.id}
                            checked={field.value === method.id}
                            className="mt-1 h-4 w-4"
                          />
                        )}
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{method.title}</div>
                        {method.description && <div className="mt-1 text-xs text-gray-500">{method.description}</div>}
                      </div>
                    </label>
                  ))}
                </div>
                {errors.paymentMethod && (
                  <p className="mt-1 text-xs text-rose-600">{errors.paymentMethod.message}</p>
                )}
              </div>

              <div className="mt-6 border-t pt-4">
                <label className="flex items-start gap-2">
                  <Controller
                    name="termsAccepted"
                    control={control}
                    render={({ field: { value, onChange, ...field } }) => (
                      <input
                        type="checkbox"
                        {...field}
                        checked={value || false}
                        onChange={(e) => onChange(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-gray-300"
                      />
                    )}
                  />
                  <span className="text-sm text-gray-700">
                    I agree to the <Link href="/terms" className="text-blue-600 hover:underline">Terms and Conditions</Link> and{" "}
                    <Link href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>
                  </span>
                </label>
                {errors.termsAccepted && (
                  <p className="mt-1 text-xs text-rose-600">{errors.termsAccepted.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={placing}
                className="mt-6 w-full rounded-md bg-gray-900 px-4 py-3 text-center text-sm font-medium text-white hover:bg-black disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {placing ? "Processing..." : "Place Order"}
              </button>
            </div>
          </div>
        </form>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 py-10 container flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </div>
      }
    >
      <CheckoutPageContent />
    </Suspense>
  );
}