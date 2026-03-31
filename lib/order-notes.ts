/**
 * Order Notes Utilities
 * Functions for adding notes to WooCommerce orders
 */

import wcAPI from "./woocommerce";

/**
 * Add a payment status note to an order
 */
export async function addPaymentStatusNote(
  orderId: number,
  status: string,
  transactionId?: string,
  amount?: number | string
): Promise<void> {
  try {
    const amountNum = typeof amount === 'string' ? parseFloat(amount) : amount;
    const note = `Payment ${status}${transactionId ? ` - Transaction ID: ${transactionId}` : ""}${amountNum ? ` - Amount: $${amountNum.toFixed(2)}` : ""}`;
    
    await wcAPI.post(`/orders/${orderId}/notes`, {
      note,
      customer_note: false,
    });
  } catch (error) {
    console.error(`Failed to add payment status note to order ${orderId}:`, error);
    // Don't throw - note addition failure shouldn't break order processing
  }
}

/**
 * Add a status update note to an order
 */
export async function addStatusUpdateNote(
  orderId: number,
  oldStatus: string,
  newStatus: string,
  reason?: string
): Promise<void> {
  try {
    const note = `Order status changed from ${oldStatus} to ${newStatus}${reason ? ` - ${reason}` : ""}`;
    
    await wcAPI.post(`/orders/${orderId}/notes`, {
      note,
      customer_note: false,
    });
  } catch (error) {
    console.error(`Failed to add status update note to order ${orderId}:`, error);
    // Don't throw - note addition failure shouldn't break order processing
  }
}

/**
 * Add a general note to an order
 */
export async function addOrderNote(
  orderId: number,
  note: string,
  customerNote: boolean = false
): Promise<void> {
  try {
    await wcAPI.post(`/orders/${orderId}/notes`, {
      note,
      customer_note: customerNote,
    });
  } catch (error) {
    console.error(`Failed to add note to order ${orderId}:`, error);
    // Don't throw - note addition failure shouldn't break order processing
  }
}

