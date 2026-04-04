type LineItemLog = {
  product_id: number;
  variation_id?: number | null;
  name?: string;
  quantity?: number;
  subtotal?: string;
};

export function logWooBaseUrl(): void {
  const baseUrl = process.env.WC_API_URL || process.env.NEXT_PUBLIC_WP_URL || "";
  console.info("[woo] api_base_url", { baseUrl });
}

export function logRequestedItems(
  items: Array<{ product_id?: number; variation_id?: number; sku?: string; quantity: number }>
): void {
  console.info("[woo] requested_line_items", { items });
}

export function logValidatedItems(
  items: Array<{ product_id: number; variation_id?: number; quantity: number }>
): void {
  console.info("[woo] validated_line_items", { items });
}

export function logWooOrderLineItems(lineItems: LineItemLog[]): void {
  console.info("[woo] order.line_items", { lineItems });
}
