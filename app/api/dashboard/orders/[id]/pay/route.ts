import { NextRequest, NextResponse } from "next/server";
import { getWpBaseUrl } from "@/lib/auth";
import { getAuthToken } from "@/lib/auth-server";
import wcAPI from "@/lib/woocommerce";
import { orderBelongsToDashboardUser } from "@/lib/dashboard/orderOwnership";

/**
 * POST /api/dashboard/orders/[id]/pay
 * Initiate payment for a pending order
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = await getAuthToken();

    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const resolvedParams = await params;
    const orderId = resolvedParams.id;

    if (!orderId) {
      return NextResponse.json({ error: "Order ID is required" }, { status: 400 });
    }

    // Verify the order belongs to the authenticated user
    const wpBase = getWpBaseUrl();
    if (!wpBase) {
      return NextResponse.json({ error: "WordPress URL not configured" }, { status: 500 });
    }

    // Get user data
    const userResponse = await fetch(`${wpBase}/wp-json/wp/v2/users/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!userResponse.ok) {
      return NextResponse.json({ error: "Failed to get user data" }, { status: 401 });
    }

    const user = await userResponse.json();

    // Get the order to verify ownership and status
    let order;
    try {
      const orderResponse = await wcAPI.get(`/orders/${orderId}`);
      order = orderResponse.data;
    } catch (error) {
      const axiosLike = error as { response?: { status?: number } };
      if (axiosLike.response?.status === 404) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }
      throw error;
    }

    const userEmail = typeof user.email === "string" ? user.email : "";
    const { getCustomerIdWithFallback } = await import("@/lib/customer");
    const wooCustomerId = await getCustomerIdWithFallback(userEmail, token);

    if (
      !orderBelongsToDashboardUser({
        order,
        userEmail,
        wooCustomerId,
      })
    ) {
      return NextResponse.json(
        { error: "You do not have permission to pay for this order" },
        { status: 403 }
      );
    }

    // Pending = unpaid checkout; failed = payment attempt failed (retry eWAY / order-pay)
    const payRetryStatuses = new Set(["pending", "failed"]);
    if (!payRetryStatuses.has(String(order.status || "").toLowerCase())) {
      return NextResponse.json(
        { error: `This order cannot be paid. Current status: ${order.status}` },
        { status: 400 }
      );
    }

    // Get payment URL from order meta or generate checkout URL
    // WooCommerce stores payment URLs in different ways depending on the gateway
    const paymentUrl = order.meta_data?.find(
      (meta: any) =>
        meta.key === "_payment_url" ||
        meta.key === "payment_url" ||
        meta.key === "_checkout_payment_url"
    )?.value;

    // If no payment URL in meta, construct one based on payment method
    let finalPaymentUrl = paymentUrl;

    if (!finalPaymentUrl) {
      // For most gateways, redirect to order pay page
      finalPaymentUrl = `${wpBase}/checkout/order-pay/${orderId}/?pay_for_order=true&key=${order.order_key}`;
    }

    return NextResponse.json({
      success: true,
      payment_url: finalPaymentUrl,
      order_id: orderId,
      message: "Redirecting to payment...",
    });
  } catch (error) {
    console.error("Pay order API error:", error);
    return NextResponse.json(
      { error: "An error occurred while initiating payment" },
      { status: 500 }
    );
  }
}
