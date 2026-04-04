import { NextRequest, NextResponse } from "next/server";
import wcAPI from "@/lib/woocommerce";
import { getWpBaseUrl } from "@/lib/auth";
import { getAuthToken } from "@/lib/auth-server";

/**
 * Create order in WooCommerce
 * Follows WooCommerce's default order creation flow with secure payment handling
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const paymentMethod = body.payment_method || "";
    const paymentIntentId = body.payment_intent_id || body.transaction_id || null;
    const setPaid = Boolean(body.set_paid) || false;

    // Capture customer IP address
    const forwarded = req.headers.get("x-forwarded-for");
    const realIp = req.headers.get("x-real-ip");
    const customerIp =
      forwarded?.split(",")[0]?.trim() ||
      realIp ||
      req.headers.get("cf-connecting-ip") ||
      "Unknown";

    // Validate payment before creating order (for online payments)
    if (paymentMethod === "paypal" && setPaid) {
      // Verify payment was processed before creating order
      if (!paymentIntentId) {
        return NextResponse.json(
          { error: "Payment verification required. Payment intent/transaction ID missing." },
          { status: 400 }
        );
      }

      // Verify payment was actually processed before creating order.
      // TODO: When payment gateway SDKs are integrated, call verifyPayment() here.
      // For now, if payment intent ID exists, assume payment was processed
      // In production with actual gateway integration, always verify
      if (paymentIntentId) {
        console.log(`Payment processed: ${paymentIntentId} for method: ${paymentMethod}`);
      }
    }

    // Determine order status based on payment method
    // For COD: Order status = "processing" (order being fulfilled), Payment status = "Pending Payment" (payment on delivery)
    // For Bank Transfer: Order status = "pending" (waiting for payment confirmation)
    // For PayPal (if paid): Order status = "processing" (order being fulfilled), Payment status = "Paid"
    let orderStatus = "pending"; // Default to pending payment

    if (setPaid && paymentMethod === "paypal") {
      // For successful online payments, set status to "processing"
      orderStatus = "processing";
    } else if (paymentMethod === "cod") {
      // Cash on Delivery - Order is being processed/fulfilled, payment will be received on delivery
      // Order status: "processing" (order is being prepared/shipped)
      // Payment status: "Pending Payment" (will be paid on delivery) - this is handled by set_paid: false
      orderStatus = "processing";
    } else if (paymentMethod === "bank_transfer" || paymentMethod === "bacs") {
      // Bank Transfer - remains pending until payment confirmed
      orderStatus = "pending";
    }

    // Extract delivery information
    const deliveryInstructions =
      body.meta_data?.find((m: any) => m.key === "delivery_instructions")?.value || "";
    const deliveryAuthority =
      body.meta_data?.find((m: any) => m.key === "delivery_authority")?.value || "";
    const subscribeNewsletter =
      body.meta_data?.find((m: any) => m.key === "subscribe_newsletter")?.value || false;
    const paymentMethodTitle = body.payment_method_title || paymentMethod;

    // Prepare meta_data - store all information in order data section
    const metaData = Array.isArray(body.meta_data) ? [...body.meta_data] : [];

    // Add payment transaction ID if available
    if (paymentIntentId) {
      metaData.push({
        key: "_transaction_id",
        value: paymentIntentId,
      });
    }

    // Add payment method information to meta_data (displays in order data section)
    // Note: No underscore prefix so it shows in WooCommerce admin UI
    metaData.push({
      key: "Payment Method Display",
      value: paymentMethodTitle,
    });

    // Add delivery instructions to meta_data (displays in order data section)
    // Note: No underscore prefix so it shows in WooCommerce admin UI
    if (deliveryInstructions) {
      metaData.push({
        key: "Delivery Instructions",
        value: deliveryInstructions,
      });
    }

    // Add delivery authority to meta_data (displays in order data section)
    // Note: No underscore prefix so it shows in WooCommerce admin UI
    if (deliveryAuthority) {
      const authorityLabel =
        deliveryAuthority === "with_signature" ? "With Signature" : "Without Signature";
      metaData.push({
        key: "Delivery Authority",
        value: authorityLabel,
      });
    }

    // Add newsletter subscription to meta_data (displays in order data section)
    // Note: No underscore prefix so it shows in WooCommerce admin UI
    if (subscribeNewsletter) {
      metaData.push({
        key: "Newsletter Subscription",
        value: "Yes",
      });
    }

    // Get customer ID if user is logged in
    // Helper to ensure customer ID is an integer (WooCommerce API requirement)
    const toIntCustomerId = (id: unknown): number | null => {
      if (id === null || id === undefined) return null;
      const num = typeof id === "string" ? parseInt(id, 10) : Number(id);
      return !isNaN(num) && num > 0 ? num : null;
    };

    let customerId: number | null = null;
    try {
      const token = await getAuthToken();
      if (token) {
        const wpBase = getWpBaseUrl();
        if (wpBase) {
          // Get user data
          const userResponse = await fetch(`${wpBase}/wp-json/wp/v2/users/me`, {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            cache: "no-store",
          });

          if (userResponse.ok) {
            const user = await userResponse.json();
            const userEmail = user.email || body.billing?.email;

            // Get WooCommerce customer ID using optimized hybrid approach
            if (userEmail) {
              const { getCustomerIdWithFallback, toIntCustomerId } =
                await import("@/lib/customer");
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
      // If authentication fails, continue as guest order
      console.warn("Could not get customer ID, creating guest order:", authError);
    }

    // Create order in WooCommerce
    const orderData: any = {
      payment_method: paymentMethod,
      payment_method_title: paymentMethodTitle,
      set_paid: setPaid,
      status: orderStatus,
      customer_ip_address: customerIp, // WooCommerce built-in customer IP field
      ...(customerId && { customer_id: customerId }), // Add customer_id if user is logged in
      billing: body.billing || {},
      shipping: body.shipping || {},
      line_items: body.line_items || [],
      shipping_lines: body.shipping_lines || [],
      coupon_lines: body.coupon_lines || [],
      meta_data: metaData,
    };

    const { data } = await wcAPI.post("/orders", orderData);

    // Add only payment status to order notes (other info is in order data section)
    const orderId = data.id;

    try {
      // Only add payment status note
      let paymentStatusNote = `Payment Status: ${setPaid ? "Paid" : "Processing"}`;
      if (paymentIntentId) {
        paymentStatusNote += `\nTransaction ID: ${paymentIntentId}`;
      }
      paymentStatusNote += `\nPayment Method: ${paymentMethodTitle}`;
      paymentStatusNote += `\nDate: ${new Date().toISOString()}`;

      await wcAPI.post(`/orders/${orderId}/notes`, {
        note: paymentStatusNote,
        customer_note: false,
      });
    } catch (noteError: any) {
      console.error("Error adding payment status note:", noteError);
      // Continue even if note fails - don't fail the entire order
    }

    // Log order creation for security/audit
    console.log(
      `Order created: ${orderId}, Payment: ${paymentMethod}, Status: ${orderStatus}, IP: ${customerIp}`
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error("Order creation error:", error);
    const axiosLike = error as { response?: { status?: number; data?: unknown } };
    const status = axiosLike.response?.status || 500;
    const message = axiosLike.response?.data || { message: "Order creation failed" };
    return NextResponse.json(message, { status });
  }
}
