/**
 * Formatting Utilities
 * Standardized formatting functions for prices and currency
 */

/**
 * Format price to 2 decimal places with $ prefix
 */
export function formatPrice(price: string | number | null | undefined): string {
  const num = typeof price === "string" ? parseFloat(price) : (price || 0);
  if (!isFinite(num) || num <= 0) return "$0.00";
  return `$${num.toFixed(2)}`;
}

/**
 * Format currency amount to 2 decimal places
 */
export function formatCurrency(amount: number): string {
  if (!isFinite(amount) || amount <= 0) return "$0.00";
  return `$${amount.toFixed(2)}`;
}

/**
 * Format price without currency symbol (for calculations)
 */
export function formatPriceNumber(price: string | number | null | undefined): number {
  const num = typeof price === "string" ? parseFloat(price) : (price || 0);
  return isFinite(num) && num > 0 ? Number(num.toFixed(2)) : 0;
}

/**
 * Format price with tax class label (GST Free, Incl. GST, Excl. GST)
 * Returns an object with the formatted price and label
 */
export type TaxDisplayType = "gst_10" | "gst_free";

export function getTaxDisplayType(tax_class?: string | null, tax_status?: string | null): TaxDisplayType {
  const slug = (tax_class || "").toLowerCase().replace(/\s+/g, "-");
  const status = (tax_status || "").toLowerCase();

  if (slug === "gst-free" || slug === "gstfree" || status === "none") {
    return "gst_free";
  }

  if (
    slug === "gst-10" ||
    slug === "gst10" ||
    slug === "gst" ||
    status === "taxable" ||
    status === "shipping" ||
    status === "standard"
  ) {
    return "gst_10";
  }

  // Default to GST 10% so pricing always shows the GST context
  return "gst_10";
}

export function formatPriceWithLabel(
  price: string | number | null | undefined,
  tax_class?: string | null,
  tax_status?: string | null
): { price: string; label: string | null; exclPrice?: string; inclPrice?: string; taxType: TaxDisplayType | null } {
  const raw = typeof price === "string" ? parseFloat(price) : (price || 0);
  if (!isFinite(raw) || raw <= 0) {
    return { price: "$0.00", label: null, taxType: null };
  }

  const taxType = getTaxDisplayType(tax_class, tax_status);

  if (taxType === "gst_10") {
    const excl = raw;
    const incl = raw * 1.10;
    return {
      price: `$${incl.toFixed(2)}`,
      label: "Incl. GST",
      exclPrice: `$${excl.toFixed(2)}`,
      inclPrice: `$${incl.toFixed(2)}`,
      taxType,
    };
  }

  // GST Free fallback
  return {
    price: `$${raw.toFixed(2)}`,
    label: "GST Free",
    taxType,
  };
}

