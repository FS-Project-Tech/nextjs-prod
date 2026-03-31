import { NextResponse } from "next/server";
import wcAPI from "@/lib/woocommerce";
import { addPaymentStatusNote, addStatusUpdateNote } from "@/lib/order-notes";

/**
 * Webhook endpoint for payment status updates
 * Handles webhooks from payment gateways (Stripe, PayPal, etc.)
 * Updates order status based on payment status
 * 
 * This follows WooCommerce's default webhook pattern
 */
export async function POST(req: Request) {
  try {
    const headersList = req.headers;
    const signature = headersList.get("paypal-transmission-id") || headersList.get("x-paypal-transmission-sig");
    
    // Get raw body for signature verification
    const body = await req.text();
    const payload = JSON.parse(body);

    // Verify webhook signature (security)
    if (!verifyWebhookSignature(payload, signature, headersList)) {
      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 401 }
      );
    }

    // Handle different webhook types
    const eventType = payload.type || payload.event_type;
    
    switch (eventType) {
      // PayPal webhooks
      case "PAYMENT.CAPTURE.COMPLETED":
        return await handlePayPalPaymentSuccess(payload);
      
      case "PAYMENT.CAPTURE.DENIED":
        return await handlePayPalPaymentFailed(payload);
      
      default:
        // Acknowledge webhook even if we don't handle it
        return NextResponse.json({ received: true });
    }
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

/**
 * Verify webhook signature for security
 * IMPORTANT: In production, ALWAYS verify signatures to prevent unauthorized access
 */
function verifyWebhookSignature(payload: any, signature: string | null, headers: Headers): boolean {
  // TODO: Implement actual signature verification
  // Payment gateway webhook verification would go here
  // PayPal: Verify X-PAYPAL-TRANSMISSION-SIG header using PayPal SDK
  
  // For development/testing, you might want to skip verification
  // In production, ALWAYS verify signatures
  if (process.env.NODE_ENV === "development" && process.env.SKIP_WEBHOOK_VERIFICATION === "true") {
    console.warn("⚠️  Webhook signature verification skipped (development mode)");
    return true; // Skip in development if explicitly enabled
  }
  
  // Production: Verify signature
  if (!signature) {
    console.error("Webhook signature missing");
    return false;
  }
  
  // TODO: Implement actual signature verification based on payment gateway
  // This is a placeholder - replace with actual verification
  console.warn("⚠️  Webhook signature verification not implemented - implement before production!");
  return true;
}

/**
 * Handle successful payment (placeholder for future payment gateway integration)
 */
async function handlePaymentSuccess(payload: any) {
  try {
    const paymentIntent = payload.data.object;
    const orderId = paymentIntent.metadata?.order_id;
    
    if (!orderId) {
      return NextResponse.json({ received: true, warning: "No order_id in metadata" });
    }

    // Get current order status before update
    const currentOrder = await wcAPI.get(`/orders/${orderId}`);
    const oldStatus = currentOrder.data.status;

    // Update order status to processing
    await wcAPI.put(`/orders/${orderId}`, {
      status: "processing",
      set_paid: true,
    });

    // Add payment transaction ID to order meta
    await wcAPI.put(`/orders/${orderId}`, {
      meta_data: [
        {
          key: "_transaction_id",
          value: paymentIntent.id,
        },
        {
          key: "_payment_method_title",
          value: "Online Payment",
        },
      ],
    });

    // Add only payment status note (order status change is handled by WooCommerce)
    await addPaymentStatusNote(orderId, "Online Payment", paymentIntent.id, "success");

    return NextResponse.json({ received: true, order_id: orderId });
  } catch (error) {
    console.error("Error handling payment success:", error);
    return NextResponse.json({ received: true, error: (error instanceof Error ? error.message : 'An error occurred') });
  }
}

/**
 * Handle failed payment (placeholder for future payment gateway integration)
 */
async function handlePaymentFailed(payload: any) {
  try {
    const paymentIntent = payload.data.object;
    const orderId = paymentIntent.metadata?.order_id;
    
    if (orderId) {
      // Get current order status before update
      try {
        const currentOrder = await wcAPI.get(`/orders/${orderId}`);
        const oldStatus = currentOrder.data.status;

        // Update order status to failed
        await wcAPI.put(`/orders/${orderId}`, {
          status: "failed",
        });

        // Add only payment status note
        await addPaymentStatusNote(orderId, "Online Payment", paymentIntent.id, "failed");
      } catch (error) {
        console.error("Error updating failed order:", error);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Error handling payment failure:", error);
    return NextResponse.json({ received: true });
  }
}

/**
 * Handle successful PayPal payment
 */
async function handlePayPalPaymentSuccess(payload: any) {
  try {
    const resource = payload.resource;
    const orderId = resource.custom_id || resource.invoice_id;
    
    if (!orderId) {
      return NextResponse.json({ received: true, warning: "No order_id found" });
    }

    // Get current order status before update
    const currentOrder = await wcAPI.get(`/orders/${orderId}`);
    const oldStatus = currentOrder.data.status;

    // Update order status
    await wcAPI.put(`/orders/${orderId}`, {
      status: "processing",
      set_paid: true,
    });

    // Add transaction ID
    await wcAPI.put(`/orders/${orderId}`, {
      meta_data: [
        {
          key: "_transaction_id",
          value: resource.id,
        },
        {
          key: "_payment_method_title",
          value: "PayPal",
        },
      ],
    });

    // Add only payment status note
    await addPaymentStatusNote(orderId, "PayPal", resource.id, "success");

    return NextResponse.json({ received: true, order_id: orderId });
  } catch (error) {
    console.error("Error handling PayPal payment success:", error);
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ received: true, error: message });
  }
}

/**
 * Handle failed PayPal payment
 */
async function handlePayPalPaymentFailed(payload: any) {
  try {
    const resource = payload.resource;
    const orderId = resource.custom_id || resource.invoice_id;
    
    if (orderId) {
      // Get current order status before update
      try {
        const currentOrder = await wcAPI.get(`/orders/${orderId}`);
        const oldStatus = currentOrder.data.status;

        await wcAPI.put(`/orders/${orderId}`, {
          status: "failed",
        });

        // Add only payment status note
        await addPaymentStatusNote(orderId, "PayPal", resource.id, "failed");
      } catch (error) {
        console.error("Error updating failed order:", error);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Error handling PayPal payment failure:", error);
    return NextResponse.json({ received: true });
  }
}


