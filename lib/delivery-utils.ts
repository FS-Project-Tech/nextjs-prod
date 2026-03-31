/**
 * Delivery Utilities
 * Functions for handling delivery-related logic
 */

/**
 * Get human-readable label for delivery frequency plan
 */
export function getDeliveryFrequencyLabel(plan?: string | null): string {
  if (!plan || plan === "none") return "One-time";
  if (plan === "7") return "Every 7 days";
  if (plan === "14") return "Every 14 days";
  if (plan === "30") return "Every month";
  return "One-time";
}

