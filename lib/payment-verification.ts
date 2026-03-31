/**
 * Payment Verification Utilities
 * Functions for verifying payment status before order creation
 */

interface PaymentVerificationResult {
  verified: boolean;
  transactionId?: string;
  amount?: number;
  currency?: string;
  error?: string;
}

/**
 * Verify payment with payment gateway
 * Supports PayPal, Stripe, and other payment methods
 */
export async function verifyPayment(
  paymentMethod: string,
  paymentIntentId: string | null,
  amount?: number,
  currency: string = "AUD"
): Promise<PaymentVerificationResult> {
  if (!paymentIntentId) {
    return {
      verified: false,
      error: "Payment intent ID is required",
    };
  }

  try {
    // PayPal verification
    if (paymentMethod === "paypal") {
      // In production, verify with PayPal API
      // For now, return verified if paymentIntentId exists
      return {
        verified: true,
        transactionId: paymentIntentId,
        amount,
        currency,
      };
    }

    // Stripe verification
    if (paymentMethod === "stripe" || paymentMethod === "stripe_cc") {
      // In production, verify with Stripe API
      // For now, return verified if paymentIntentId exists
      return {
        verified: true,
        transactionId: paymentIntentId,
        amount,
        currency,
      };
    }

    // Other payment methods - basic verification
    return {
      verified: !!paymentIntentId,
      transactionId: paymentIntentId,
      amount,
      currency,
    };
  } catch (error) {
    return {
      verified: false,
      error: error?.message || "Payment verification failed",
    };
  }
}

/**
 * Verify payment amount matches order total
 */
export function verifyPaymentAmount(
  paymentAmount: number,
  orderTotal: number,
  tolerance: number = 0.01
): boolean {
  return Math.abs(paymentAmount - orderTotal) <= tolerance;
}

