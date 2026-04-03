import { createWooOrder, type WooCreateOrderInput } from "@/services/woocommerce";
import { logWooOrderLineItems, logValidatedItems } from "@/lib/woo/debugLogger";

export async function createWooOrderWithDebug(input: WooCreateOrderInput): Promise<any> {
  logValidatedItems(
    input.line_items.map((li) => ({
      product_id: li.product_id,
      variation_id: li.variation_id,
      quantity: li.quantity,
    }))
  );

  const order = await createWooOrder(input);
  const lineItems = Array.isArray((order as any)?.line_items)
    ? ((order as any).line_items as Array<any>)
    : [];

  logWooOrderLineItems(
    lineItems.map((li) => ({
      product_id: Number(li?.product_id || 0),
      variation_id:
        li?.variation_id != null ? Number(li.variation_id || 0) : null,
      name: typeof li?.name === "string" ? li.name : "",
      quantity: Number(li?.quantity || 0),
      subtotal: String(li?.subtotal ?? ""),
    }))
  );

  const invalidMap = lineItems.some((li) => Number(li?.product_id || 0) <= 0);
  if (invalidMap) {
    const err = new Error(
      "Invalid product mapping from WooCommerce. Likely product type or plugin issue."
    );
    (err as any).data = {
      type: "woo_invalid_product_mapping",
      line_items: lineItems,
      warning:
        "Possible plugin modifying REST order (woocommerce_rest_pre_insert_shop_order_object).",
    };
    throw err;
  }

  return order;
}

