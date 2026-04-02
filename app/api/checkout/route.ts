import { NextRequest, NextResponse } from "next/server";
import wcAPI from "@/lib/woocommerce";
import { getWpBaseUrl } from "@/lib/auth";
import { getAuthToken, validateCSRFToken as validateAuthCSRF } from "@/lib/auth-server";
import {
  CHECKOUT_SUCCESS_COOKIE,
  encodeCheckoutSuccessCookie,
} from "@/lib/checkout-success-cookie";
import {
  generateIdempotencyKey,
  checkIdempotency,
  storeIdempotencyResult,
  acquireOrderLock,
  releaseOrderLock,
} from "@/lib/checkout-security";
import { syncCartToWooCommerce } from "@/lib/cart-sync";
import { INSURANCE_OPTION_META_KEY } from "@/lib/checkout-parcel-protection";
import type { CartItem } from "@/lib/types/cart";
import { getToken } from 'next-auth/jwt';
import {
  PAY_ON_ACCOUNT_PAYMENT_METHODS,
  assertPayOnAccountAllowed,
} from "@/lib/checkout-payment-roles";
 
/**
 * POST /api/checkout
 *
 * Secure checkout endpoint with:
 * - CSRF protection
 * - Idempotency (prevents duplicate orders)
 * - Order locking (prevents race conditions)
 * - Payment validation
 * - WooCommerce order creation
 */
export const dynamic = "force-dynamic";
const WOOCOMMERCE_CHECKOUT_PLACE_ORDER = "woocommerce_checkout_place_order";
 
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
   
    // 1. Validate required fields
    const {
      billing,
      shipping,
      payment_method,
      line_items,
      shipping_lines,
      coupon_code,
      csrf_token,
      idempotency_key,
      ndis_number,
      hcp_number,
      delivery_authority,
      delivery_instructions,
      do_not_send_paperwork,
      discreet_packaging,
      quote_id,
      quote_number,
      insurance_option,
    } = body;
 
    // Basic validation
    if (!billing || !billing.email || !billing.first_name || !billing.last_name) {
      return NextResponse.json(
        { error: "Billing information is required" },
        { status: 400 }
      );
    }
 
    if (!line_items || !Array.isArray(line_items) || line_items.length === 0) {
      return NextResponse.json(
        { error: "Cart is empty" },
        { status: 400 }
      );
    }
 
    if (!payment_method) {
      return NextResponse.json(
        { error: "Payment method is required" },
        { status: 400 }
      );
    }

    if (String(payment_method).toLowerCase() === "eway") {
      return NextResponse.json(
        {
          error:
            "Card payments use the eWAY secure redirect from checkout — do not POST eWAY to this endpoint.",
        },
        { status: 400 }
      );
    }

    if (PAY_ON_ACCOUNT_PAYMENT_METHODS.has(String(payment_method).toLowerCase())) {
      const gate = await assertPayOnAccountAllowed();
      if (gate.ok === false) {
        return NextResponse.json(
          { error: gate.error },
          { status: 403 }
        );
      }
    }
 
    // 2. CSRF Protection (only for authenticated users)
    if (csrf_token) {
      const token = await getAuthToken();
      // Only validate CSRF if user is logged in
      if (token) {
        const isValidCSRF = await validateAuthCSRF(csrf_token);
        if (!isValidCSRF) {
          return NextResponse.json(
            { error: "Invalid CSRF token" },
            { status: 403 }
          );
        }
      }
      // Guest checkouts proceed without CSRF validation
    }
 
    // 3. Idempotency Check
    const cartTotal = body.total || 0;
    const idempotencyKey = idempotency_key || generateIdempotencyKey(
      line_items.map((item: any) => ({
        productId: item.product_id,
        quantity: item.quantity,
      })),
      cartTotal
    );
 
    const idempotencyCheck = checkIdempotency(idempotencyKey);
    if (idempotencyCheck.isDuplicate) {
      const r = idempotencyCheck.result || {};
      const dupRedirect = `/checkout/order-review?orderId=${r.number ?? r.order_number ?? r.id ?? ""}`;
      const dupOrder = {
        id: r.id,
        number: r.number,
        order_number: r.order_number,
        order_key: r.order_key,
        status: r.status,
        total: r.total,
      };
      const dupRes = NextResponse.json(
        {
          success: true,
          order: dupOrder,
          message: "Order already processed",
          redirect_url: dupRedirect,
        },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
            ...checkoutSuccessHeaders(
              r.id,
              r.number ?? r.order_number ?? r.id,
              dupRedirect
            ),
          },
        }
      );
      return withCheckoutSuccessCookie(
        dupRes,
        r.id,
        r.number ?? r.order_number ?? r.id
      );
    }
 
    // 4. Order Lock (prevent duplicate orders)
    const orderLockKey = `guest-${Date.now()}-${idempotencyKey.slice(0, 8)}`;
    const lockResult = acquireOrderLock(orderLockKey);
   
    if (!lockResult.success) {
      return NextResponse.json(
        { error: "Order is being processed. Please wait." },
        { status: 409 }
      );
    }
 
    try {
      // 5. Validate cart items and sync with WooCommerce
      const cartItems: CartItem[] = line_items.map((item: any) => ({
        id: `${item.product_id}${item.variation_id ? ':' + item.variation_id : ''}`,
        productId: item.product_id,
        variationId: item.variation_id,
        name: item.name || '',
        slug: item.slug || '',
        price: String(item.price || 0),
        qty: item.quantity,
        sku: item.sku,
      }));
 
      const cartSync = await syncCartToWooCommerce(cartItems, coupon_code);
      if (!cartSync) {
        releaseOrderLock(orderLockKey);
        return NextResponse.json(
          { error: "Failed to validate cart items" },
          { status: 400 }
        );
      }
 
      // 6. Determine payment status and order status based on payment method
      const offlinePaymentMethods = ['cod', 'bacs', 'bank_transfer', 'cheque'];
      const isOfflinePayment = offlinePaymentMethods.includes(payment_method);
     
      // Determine setPaid and orderStatus based on payment method
      let setPaid = false;
      let orderStatus = 'processing'; // Default to pending
     
      if (payment_method === 'cod') {
        // Cash on Delivery - Order is being processed/fulfilled, payment will be received on delivery
        // Order status: "processing" (order is being prepared/shipped)
        // Payment status: "Pending Payment" (will be paid on delivery) - this is handled by set_paid: false
        orderStatus = 'processing';
        setPaid = false; // Payment pending (will be paid on delivery)
      } else if (payment_method === 'bacs' || payment_method === 'bank_transfer' || payment_method === 'cheque') {
        // Bank Transfer / Cheque - remains pending until payment confirmed
        orderStatus = 'processing';
        setPaid = false; // Payment pending (waiting for confirmation)
      } else {
        // Online payment methods (PayPal, Stripe, etc.)
        // Payment must be processed before order creation
        setPaid = body.payment_processed === true;
        orderStatus = setPaid ? 'processing' : 'pending';
      }
 
      // 7. Build order meta data
      const metaData: Array<{ key: string; value: any }> = [];
 
      if (ndis_number) {
        metaData.push({ key: "NDIS Number", value: ndis_number });
      }
 
      if (hcp_number) {
        metaData.push({ key: "HCP Number", value: hcp_number });
      }
 
      if (delivery_authority) {
        const authorityLabel = delivery_authority === "with_signature"
          ? "With Signature"
          : "Without Signature";
        metaData.push({ key: "Delivery Authority", value: authorityLabel });
      }
// Build WooCommerce order meta data
 
 
// Signature Required
metaData.push({
  key: "Signature Required",
  value: delivery_authority === "with_signature" ? "yes" : "no",
});
 
// Delivery Instructions
if (delivery_instructions) {
  metaData.push({
    key: "Delivery Instructions",
    value: delivery_instructions,
  });
}
 
// Do not send paperwork
metaData.push({
  key: "Do not Send Paperwork With Delivery",
  value: do_not_send_paperwork ? "yes" : "no",
});
 
// Discreet packaging
metaData.push({
  key: "Discreet Packaging",
  value: discreet_packaging ? "yes" : "no",
});
 
// Newsletter subscription
metaData.push({
  key: "Newsletter Subscription",
  value: body.subscribe_newsletter ? "yes" : "no",
});

      // Parcel protection (WooCommerce custom checkout field)
      const insuranceOpt: "yes" | "no" =
        insurance_option === "yes" ? "yes" : "no";
      metaData.push({ key: INSURANCE_OPTION_META_KEY, value: insuranceOpt });
 
      // Add idempotency key to meta for tracking
      metaData.push({ key: "_idempotency_key", value: idempotencyKey });
      metaData.push({
        key: "_checkout_button_name",
        value: WOOCOMMERCE_CHECKOUT_PLACE_ORDER,
      });
 
      // Add quote information if order is from quote conversion
      if (quote_id) {
        metaData.push({ key: "_quote_id", value: quote_id });
      }
      if (quote_number) {
        metaData.push({ key: "Quote Number", value: quote_number });
      }
 
      // 8. Get customer IP
      const forwarded = req.headers.get("x-forwarded-for");
      const realIp = req.headers.get("x-real-ip");
      const customerIp = forwarded?.split(",")[0]?.trim() || realIp || req.headers.get("cf-connecting-ip") || "";
 
 // 8.5. Get customer ID if user is logged in
let customerId: number | null = null;
try {
  // 1) Try NextAuth session first
  const nextAuthToken = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const wpToken = (nextAuthToken as any)?.wpToken;
 
  // 2) Fallback to legacy getAuthToken if wpToken is not set
  const legacyToken = wpToken ? null : await getAuthToken();
  const token = wpToken || legacyToken;  // this is the JWT we use below
 
  if (token) {
    const wpBase = getWpBaseUrl();
    if (wpBase) {
      const userResponse = await fetch(`${wpBase}/wp-json/wp/v2/users/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });
 
      if (userResponse.ok) {
        const user = await userResponse.json();
        const userEmail = user.email || billing.email;
 
        if (userEmail) {
          const { getCustomerIdWithFallback, toIntCustomerId } = await import('@/lib/customer-utils');
          customerId = await getCustomerIdWithFallback(userEmail, token);
 
          // Fallback to WordPress user ID if WooCommerce customer not found
          if (!customerId && user.id) {
            customerId = toIntCustomerId(user.id);
          }
        }
      }
    }
  }
} catch (authError) {
  console.warn('Could not get customer ID, creating guest order:', authError);
}
 
      // 9. Build WooCommerce order payload
      const orderPayload: any = {
        payment_method: payment_method,
        payment_method_title: getPaymentMethodTitle(payment_method),
        set_paid: setPaid,
        status: orderStatus,
        customer_ip_address: customerIp,
        ...(customerId && { customer_id: customerId }), // Add customer_id if user is logged in
        billing: {
          first_name: billing.first_name,
          last_name: billing.last_name,
          email: billing.email,
          phone: billing.phone || '',
          address_1: billing.address_1 || '',
          address_2: billing.address_2 || '',
          city: billing.city || '',
          state: billing.state || '',
          postcode: billing.postcode || '',
          country: (billing.country && String(billing.country).trim()) || 'AU',
        },
        shipping: {
          ...(shipping || {
            first_name: billing.first_name,
            last_name: billing.last_name,
            address_1: billing.address_1 || '',
            address_2: billing.address_2 || '',
            city: billing.city || '',
            state: billing.state || '',
            postcode: billing.postcode || '',
          }),
          country: (shipping?.country && String(shipping.country).trim()) || (billing.country && String(billing.country).trim()) || 'AU',
        },
        line_items: cartSync.items.map((item) => ({
          product_id: item.product_id,
          variation_id: item.variation_id,
          quantity: item.quantity,
        })),
        shipping_lines: shipping_lines || [],
        meta_data: metaData,
      };
 
      // Add coupon if provided
      if (coupon_code) {
        orderPayload.coupon_lines = [{ code: coupon_code }];
      }
 
      // 10. Create order in WooCommerce
      const orderResponse = await wcAPI.post("/orders", orderPayload);
      const order = orderResponse.data;
 
      // 10.5. Mark quote as converted if this order is from a quote
      if (quote_id) {
        try {
          const { markQuoteAsConverted, getQuoteById } = await import('@/lib/quote-storage');
          const { sendQuoteConvertedEmail } = await import('@/lib/quote-email');
         
          // Mark quote as converted
          await markQuoteAsConverted(
            quote_id,
            order.id,
            order.number || order.order_number || undefined
          );
         
          // Send conversion email notification
          const quote = await getQuoteById(quote_id);
          if (quote) {
            await sendQuoteConvertedEmail(
              quote,
              order.id,
              order.number || order.order_number || undefined
            );
          }
        } catch (quoteError) {
          // Log but don't fail the order if quote update fails
          console.warn('Failed to mark quote as converted or send email:', quoteError);
        }
      }
 
      // 11. Store idempotency result
      storeIdempotencyResult(idempotencyKey, {
        id: order.id,
        number: order.number,
        order_number: order.order_number,
        order_key: order.order_key,
        status: order.status,
        total: order.total,
      });
 
      // 12. Release lock
      releaseOrderLock(orderLockKey);
 
      // 13. Return success response (minimal JSON — large line_items/billing blobs can break
      // proxies or serialization; order-review loads full order from WooCommerce.)
      const redirectUrl = `/checkout/order-review?orderId=${order.number ?? order.order_number ?? order.id}`;
      const successResponse = {
        success: true,
        order: {
          id: order.id,
          number: order.number,
          order_number: order.order_number,
          order_key: order.order_key,
          status: order.status,
          total: order.total,
          payment_method: order.payment_method,
          payment_method_title: order.payment_method_title,
        },
        idempotency_key: idempotencyKey,
        redirect_url: redirectUrl,
        checkout_button_name: WOOCOMMERCE_CHECKOUT_PLACE_ORDER,
      };
 
      const successRes = NextResponse.json(successResponse, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          ...checkoutSuccessHeaders(
            order.id,
            order.number ?? order.order_number ?? order.id,
            redirectUrl
          ),
        },
      });
      return withCheckoutSuccessCookie(
        successRes,
        order.id,
        order.number ?? order.order_number ?? order.id
      );
 
    } catch (error) {
      // Release lock on error
      releaseOrderLock(orderLockKey);
 
      // Log full error for debugging (server-side only)
      console.error("Checkout error:", error);
     
      // Type assertion for axios-style errors
      const err = error as Error & {
        response?: { data?: { code?: string }; status?: number };
      };
     
      // Return sanitized error message (don't leak internal details)
      const status = err.response?.status || 500;
     
      // Map known error codes to user-friendly messages
      let userMessage = "Failed to process your order. Please try again.";
      const errorCode = err.response?.data?.code;
     
      if (status === 400 || errorCode === 'woocommerce_rest_invalid_data') {
        userMessage = "Invalid order data. Please check your cart and try again.";
      } else if (status === 401 || status === 403) {
        userMessage = "Session expired. Please refresh and try again.";
      } else if (status === 409) {
        userMessage = "This order is already being processed.";
      } else if (errorCode === 'woocommerce_rest_product_out_of_stock') {
        userMessage = "One or more items are out of stock.";
      } else if (errorCode === 'woocommerce_rest_invalid_coupon') {
        userMessage = "Invalid or expired coupon code.";
      }
 
      return NextResponse.json(
        {
          error: userMessage,
          code: "CHECKOUT_ERROR",
        },
        {
          status: status >= 400 && status < 500 ? status : 500,
          headers: {
            'X-Content-Type-Options': 'nosniff',
          },
        }
      );
    }
  } catch (error) {
    // Log for debugging (server-side only)
    console.error("Checkout API error:", error);
   
    // Return generic error (don't leak parsing details)
    return NextResponse.json(
      {
        error: "Invalid request format. Please try again.",
        code: "INVALID_REQUEST",
      },
      {
        status: 400,
        headers: {
          'X-Content-Type-Options': 'nosniff',
        },
      }
    );
  }
}
 
function getPaymentMethodTitle(method: string): string {
  const titles: Record<string, string> = {
    paypal: "PayPal",
    bacs: "On account",
    bank_transfer: "On account",
    cod: "Cash on Delivery",
    cheque: "Cheque Payment",
    stripe: "Credit Card (Stripe)",
    eway: "eWAY",
  };
  return titles[method] || method;
}
 
/** Headers so the browser can finish checkout if the JSON body is stripped by a proxy/CDN. */
function checkoutSuccessHeaders(
  orderId: string | number | undefined,
  orderNumberForUrl: string | number | undefined,
  redirectUrl: string
): Record<string, string> {
  return {
    "X-Checkout-Success": "1",
    "X-Order-Id": orderId != null && orderId !== "" ? String(orderId) : "",
    "X-Order-Number": orderNumberForUrl != null && orderNumberForUrl !== "" ? String(orderNumberForUrl) : "",
    "X-Redirect-Url": redirectUrl,
  };
}
 
function withCheckoutSuccessCookie(
  res: NextResponse,
  orderId: string | number | undefined | null,
  orderRefForUrl: string | number | undefined | null
): NextResponse {
  res.cookies.set(
    CHECKOUT_SUCCESS_COOKIE,
    encodeCheckoutSuccessCookie(orderId, orderRefForUrl),
    {
      path: "/",
      maxAge: 120,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: false,
    }
  );
  return res;
}