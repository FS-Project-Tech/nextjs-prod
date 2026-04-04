import { NextResponse } from "next/server";
import wcAPI from "@/lib/woocommerce";
import { getWpBaseUrl } from "@/lib/wp-utils";
import { verifyEwayPayment } from "@/lib/services/ewayService";
 
/**
 * GET - Fetch order details by ID (post ID) or order number
 *
 * WooCommerce REST API expects post ID for GET /orders/{id}.
 * If the URL has an order number (e.g. from Sequential Order Numbers plugin),
 * we try direct fetch first, then fall back to searching by order number.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const reqUrl = new URL(req.url);
    const accessCode =
      reqUrl.searchParams.get("AccessCode") ||
      reqUrl.searchParams.get("accessCode") ||
      "";
 
    // Await params (Next.js 15+ requires this)
    const resolvedParams = await params;
    const orderId = resolvedParams?.id;
 
    if (!orderId) {
      console.error("Order API: Missing order ID in params");
      return NextResponse.json(
        { error: "Order ID is required" },
        { status: 400 }
      );
    }
 
    console.log(`Order API: Fetching order ${orderId}`);
 
    // 1. Try direct fetch (works when orderId is post ID)
    try {
      const { data: order } = await wcAPI.get(`/orders/${orderId}`);
 
      if (order) {
        if (
          accessCode &&
          String(order.status || "").toLowerCase() === "pending" &&
          String(order.payment_method || "").toLowerCase() === "eway"
        ) {
          const verification = await verifyEwayPayment(accessCode);
          if (verification.ok && verification.success) {
            try {
              const patch: Record<string, unknown> = {
                status: "processing",
                set_paid: true,
              };
              if (verification.transactionId) {
                patch.transaction_id = verification.transactionId;
              }
              await wcAPI.put(`/orders/${order.id}`, patch);
              // Woo PUT / indexing can lag; refetch a few times so the client never lands on an empty 200.
              let refreshed: Record<string, unknown> | null = null;
              for (let r = 0; r < 6; r++) {
                const { data: again } = await wcAPI.get(`/orders/${order.id}`);
                if (again && typeof again === "object") {
                  refreshed = again as Record<string, unknown>;
                  break;
                }
                await new Promise((res) => setTimeout(res, 350 + r * 120));
              }
              if (!refreshed || typeof refreshed !== "object") {
                console.error("Order API: eWAY verified but refetch returned no order body after retries");
                return NextResponse.json(
                  { error: "Order was updated but details could not be loaded. Please refresh." },
                  { status: 502 }
                );
              }
              const updatedOrder = refreshed;
              // Best-effort: add payment verification audit trail in Woo order notes.
              try {
                const note = [
                  "eWAY payment verified from order-review return.",
                  verification.transactionId
                    ? `TransactionID: ${verification.transactionId}.`
                    : null,
                  verification.responseCode
                    ? `ResponseCode: ${verification.responseCode}.`
                    : null,
                  "Order moved to Processing and marked paid.",
                ]
                  .filter(Boolean)
                  .join(" ");
                await wcAPI.post(`/orders/${order.id}/notes`, {
                  note,
                  customer_note: false,
                });
              } catch (noteErr) {
                console.warn("Order API: eWAY verified but note write failed", noteErr);
              }
              console.log(
                `Order API: eWAY verified. Updated order ${order.id} to processing`
              );
              return NextResponse.json({ order: updatedOrder });
            } catch (updateErr) {
              console.warn("Order API: eWAY verified but order update failed", updateErr);
            }
          } else {
            // Best-effort: keep an audit note for failed/unsuccessful verification attempts.
            try {
              const note = [
                "eWAY payment verification attempt was not successful.",
                verification.ok
                  ? "Verification response indicates payment is not complete."
                  : `Verification error: ${verification.ok === false ? verification.error : "Unknown"}`,
                verification.ok && verification.responseCode
                  ? `ResponseCode: ${verification.responseCode}.`
                  : null,
                "Order remains Pending.",
              ]
                .filter(Boolean)
                .join(" ");
              await wcAPI.post(`/orders/${order.id}/notes`, {
                note,
                customer_note: false,
              });
            } catch (noteErr) {
              console.warn(
                "Order API: eWAY unsuccessful verification note write failed",
                noteErr
              );
            }
          }
        }
        console.log(`Order API: Successfully fetched order ${orderId} (post ID: ${order.id})`);
        return NextResponse.json({ order });
      }
    } catch (directErr) {
      const err = directErr as Error & { response?: { status?: number } };
      // If 404, try resolving by order number
      if (err.response?.status !== 404) {
        throw directErr;
      }
    }
 
    // 2. Fallback: search by order number (for Sequential Order Numbers plugin, etc.)
    console.log(`Order API: Direct fetch failed, searching by order number ${orderId}`);
    const { data: orders } = await wcAPI.get("/orders", {
      params: { search: orderId, per_page: 20 },
    });
 
    const match = Array.isArray(orders)
      ? orders.find(
          (o: { id?: number; number?: string; order_number?: string }) =>
            String(o.number ?? o.order_number ?? o.id) === orderId
        )
      : null;
 
    if (match) {
      // Fetch full order by post ID
      const { data: fullOrder } = await wcAPI.get(`/orders/${match.id}`);
      if (fullOrder) {
        console.log(
          `Order API: Resolved order number ${orderId} to post ID ${match.id}`
        );
        return NextResponse.json({ order: fullOrder });
      }
    }
 
    // 3. Fallback: custom WordPress endpoint (order-by-number) when search fails
    const wpBase = getWpBaseUrl();
    if (wpBase) {
      try {
        const lookupRes = await fetch(
          `${wpBase}/wp-json/custom/v1/order-by-number/${orderId}`,
          { cache: "no-store" }
        );
        if (lookupRes.ok) {
          const { post_id } = (await lookupRes.json()) as { post_id: number };
          if (post_id) {
            const { data: fullOrder } = await wcAPI.get(`/orders/${post_id}`);
            if (fullOrder) {
              console.log(
                `Order API: Resolved order number ${orderId} to post ID ${post_id} via custom endpoint`
              );
              return NextResponse.json({ order: fullOrder });
            }
          }
        }
      } catch (lookupErr) {
        console.warn("Order API: Custom order-by-number endpoint failed:", lookupErr);
      }
    }
 
    console.error(`Order API: Order ${orderId} not found in WooCommerce`);
    return NextResponse.json(
      { error: "Order not found" },
      { status: 404 }
    );
  } catch (error) {
    // Type assertion for axios-style errors
    const err = error as Error & {
      response?: { data?: unknown; status?: number };
      config?: { params?: unknown };
      stack?: string;
    };
   
    console.error("Order API Error:", {
      message: err.message || 'An error occurred',
      stack: err.stack,
      response: err.response?.data,
      status: err.response?.status,
      params: err.config?.params,
    });
   
    if (err.response?.status === 404) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }
 
    if (err.response?.status === 401 || err.response?.status === 403) {
      return NextResponse.json(
        { error: "Authentication required to view this order" },
        { status: 401 }
      );
    }
 
    return NextResponse.json(
      {
        error: err.message || "Failed to fetch order details",
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined
      },
      { status: err.response?.status || 500 }
    );
  }
}