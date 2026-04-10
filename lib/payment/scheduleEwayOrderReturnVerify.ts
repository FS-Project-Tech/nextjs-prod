import { after } from "next/server";
import wcAPI from "@/lib/woocommerce";
import { verifyEwayAndMarkWooPaid } from "@/lib/services/paymentService";

/**
 * Runs eWAY verify + optional Woo order note **after** the HTTP response is sent so the client gets
 * order JSON immediately on return from the gateway (webhook / refresh still reconcile state).
 */
export function scheduleEwayOrderReturnVerify(params: {
  accessCode: string;
  orderId: number | string;
  mutationTimeoutMs: number;
  logTag: string;
}): void {
  const { accessCode, orderId, mutationTimeoutMs, logTag } = params;
  const id = orderId;
  const code = accessCode;

  after(async () => {
    try {
      const payResult = await verifyEwayAndMarkWooPaid({
        accessCode: code,
        orderRef: String(id),
      });

      const noteLines =
        payResult.ok && payResult.paid
          ? [
              "eWAY payment verified (deferred after order load).",
              payResult.transactionId ? `TransactionID: ${payResult.transactionId}.` : null,
              payResult.responseCode ? `ResponseCode: ${payResult.responseCode}.` : null,
            ]
          : [
              "eWAY payment verification attempt was not successful (deferred).",
              payResult.error ? `Details: ${payResult.error}` : null,
              payResult.ok && !payResult.paid ? "Payment not approved or order unresolved." : null,
            ];
      const note = noteLines.filter(Boolean).join(" ");

      await wcAPI.post(
        `/orders/${id}/notes`,
        { note, customer_note: false },
        { timeout: mutationTimeoutMs },
      );
    } catch (e) {
      console.warn(`${logTag} deferred eWAY verify or note failed`, e);
    }
  });
}
