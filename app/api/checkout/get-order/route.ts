import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import wcAPI from "@/lib/woocommerce";
import { verifyEwayPayment } from "@/lib/services/ewayService";
import { resolveOrderPostId } from "@/lib/services/wooService";

/**
 * GET /api/checkout/get-order?orderId=<id>&key=<wc_order_key>[&AccessCode=…]
 * Loads order via WooCommerce REST (wc/v3) only. Requires matching order_key (guest-safe).
 */
export const dynamic = "force-dynamic";

function keysMatch(wooKey: string, provided: string): boolean {
  const a = String(wooKey || "");
  const b = String(provided || "");
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const orderIdParam = (sp.get("orderId") || sp.get("order_id") || "").trim();
    const keyParam = (sp.get("key") || "").trim();
    const accessCode = (sp.get("AccessCode") || sp.get("accessCode") || "").trim();

    if (!orderIdParam || !keyParam) {
      return NextResponse.json(
        { error: "orderId and key (WooCommerce order_key) are required" },
        { status: 400 }
      );
    }

    let order: Record<string, unknown> | null = null;
    try {
      const { data } = await wcAPI.get(`/orders/${encodeURIComponent(orderIdParam)}`);
      order = data as Record<string, unknown>;
    } catch (firstErr: unknown) {
      const status = (firstErr as { response?: { status?: number } }).response?.status;
      if (status !== 404) throw firstErr;
    }

    if (!order) {
      const postId = await resolveOrderPostId(orderIdParam);
      if (!postId) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }
      const { data } = await wcAPI.get(`/orders/${postId}`);
      order = data as Record<string, unknown>;
    }

    const wooKey = typeof order.order_key === "string" ? order.order_key : "";
    if (!wooKey || !keysMatch(wooKey, keyParam)) {
      return NextResponse.json({ error: "Invalid order key" }, { status: 403 });
    }

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
            return NextResponse.json(
              { error: "Order was updated but details could not be loaded. Please refresh." },
              { status: 502 }
            );
          }
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
            console.warn("[checkout/get-order] eWAY note write failed", noteErr);
          }
          order = refreshed;
        } catch (updateErr) {
          console.warn("[checkout/get-order] eWAY verified but Woo update failed", updateErr);
        }
      } else {
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
          console.warn("[checkout/get-order] eWAY unsuccessful note write failed", noteErr);
        }
      }
    }

    return NextResponse.json(
      { order },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    const err = error as Error & { response?: { status?: number; data?: unknown } };
    console.error("[checkout/get-order]", err.message, err.response?.status);
    if (err.response?.status === 404) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: err.message || "Failed to load order" },
      { status: err.response?.status || 500 }
    );
  }
}
