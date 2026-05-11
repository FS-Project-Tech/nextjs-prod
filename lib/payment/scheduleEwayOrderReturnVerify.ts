import { after } from "next/server";
import wcAPI from "@/lib/woocommerce";
import { verifyEwayAndMarkWooPaid } from "@/lib/services/paymentService";

function buildDeferredEwayOrderNote(payResult: Awaited<ReturnType<typeof verifyEwayAndMarkWooPaid>>): string {
  const lines: string[] = [];

  if (payResult.ok && payResult.paid) {
    lines.push("eWAY payment verified (deferred after order load).");
    if (payResult.transactionId) lines.push(`TransactionID: ${payResult.transactionId}.`);
    if (payResult.responseCode) lines.push(`ResponseCode: ${payResult.responseCode}.`);
    if (payResult.responseMessage) lines.push(`ResponseMessage: ${payResult.responseMessage}.`);
    return lines.join(" ");
  }

  if (!payResult.ok && payResult.paymentVerifiedButWooUpdateFailed) {
    lines.push(
      "eWAY payment was verified, but this app could not update the order in WooCommerce (REST timeout or server error). Check order status in WooCommerce; if it is already Processing/Completed, no action is needed. Retry from the customer order-pay link if still Pending."
    );
    if (payResult.error) lines.push(`Details: ${payResult.error}`);
    if (payResult.transactionId) lines.push(`TransactionID: ${payResult.transactionId}.`);
    if (payResult.responseCode != null && String(payResult.responseCode).trim() !== "") {
      lines.push(`ResponseCode: ${payResult.responseCode}.`);
    }
    return lines.join(" ");
  }

  if (!payResult.ok) {
    lines.push("eWAY verify API call failed (deferred — order may still be pending).");
    if (payResult.error) lines.push(`Details: ${payResult.error}`);
    if (payResult.transactionId) lines.push(`TransactionID: ${payResult.transactionId}.`);
    if (payResult.responseCode != null && String(payResult.responseCode).trim() !== "") {
      lines.push(`ResponseCode: ${payResult.responseCode}.`);
    }
    return lines.join(" ");
  }

  lines.push("eWAY payment not approved or verification incomplete (deferred).");
  if (payResult.transactionId) lines.push(`TransactionID: ${payResult.transactionId}.`);
  if (payResult.responseCode != null && String(payResult.responseCode).trim() !== "") {
    lines.push(`ResponseCode: ${payResult.responseCode}.`);
  }
  if (payResult.responseMessage) {
    lines.push(`ResponseMessage: ${payResult.responseMessage}.`);
  }
  if (payResult.error) lines.push(`Details: ${payResult.error}`);
  const hasGatewayDetail =
    Boolean(payResult.responseMessage) ||
    (payResult.responseCode != null &&
      String(payResult.responseCode).trim() !== "" &&
      payResult.responseCode !== "00");
  if (!hasGatewayDetail && !payResult.error) {
    lines.push("Payment not approved or order unresolved.");
  }

  return lines.join(" ");
}

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
    const logBase = { logTag, orderId: id, accessCodeLength: code.length };
    try {
      console.log("[eway-deferred] start verify + Woo order note", logBase);

      const payResult = await verifyEwayAndMarkWooPaid({
        accessCode: code,
        orderRef: String(id),
      });

      console.log("[eway-deferred] verifyEwayAndMarkWooPaid result", {
        ...logBase,
        ok: payResult.ok,
        paid: payResult.paid,
        transactionId: payResult.transactionId ?? null,
        responseCode: payResult.responseCode ?? null,
        wooUpdateFailed: payResult.paymentVerifiedButWooUpdateFailed ?? false,
        error: payResult.error ?? null,
      });

      const note = buildDeferredEwayOrderNote(payResult);

      await wcAPI.post(
        `/orders/${id}/notes`,
        { note, customer_note: false },
        { timeout: mutationTimeoutMs },
      );

      console.log("[eway-deferred] Woo order note created", {
        ...logBase,
        noteLength: note.length,
        transactionIdInNote: /\bTransactionID:/i.test(note),
      });
    } catch (e) {
      console.warn(`${logTag} deferred eWAY verify or note failed`, logBase, e);
    }
  });
}
