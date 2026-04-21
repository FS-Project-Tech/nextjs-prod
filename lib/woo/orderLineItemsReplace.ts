import type { WooLineItem } from "@/services/woocommerce";

/**
 * WooCommerce REST often **appends** line items on PUT when new rows omit `id`, which duplicates
 * rows on every headless checkout update. Build a payload that zeroes existing line ids then adds
 * the new cart lines in one request (pending orders only).
 *
 * @see https://github.com/woocommerce/woocommerce/issues/22177
 */
export function buildWooLineItemsFullReplacePayload(
  existingOrder: unknown,
  newLines: WooLineItem[],
): Array<Record<string, unknown>> {
  const raw = Array.isArray((existingOrder as { line_items?: unknown })?.line_items)
    ? (existingOrder as { line_items: Array<Record<string, unknown>> }).line_items
    : [];

  const zeroOut: Array<Record<string, unknown>> = [];
  for (const li of raw) {
    const id = Number(li?.id);
    if (Number.isFinite(id) && id > 0) {
      zeroOut.push({ id, quantity: 0 });
    }
  }

  const additions = newLines.map((li) => {
    const row: Record<string, unknown> = {
      product_id: li.product_id,
      quantity: li.quantity,
    };
    if (li.variation_id != null && li.variation_id > 0) {
      row.variation_id = li.variation_id;
    }
    if (li.subtotal != null && String(li.subtotal).trim() !== "") row.subtotal = li.subtotal;
    if (li.total != null && String(li.total).trim() !== "") row.total = li.total;
    if (li.meta_data != null && li.meta_data.length > 0) {
      row.meta_data = li.meta_data;
    }
    return row;
  });

  return [...zeroOut, ...additions];
}
