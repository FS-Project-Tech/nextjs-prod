/**
 * {@link computeShippingRates} builds rate ids as `method_id:instance_id` (Woo zone method instance).
 * WooCommerce order shipping lines need `method_id` and `instance_id` separately so
 * `WC_Order_Item_Shipping::get_tax_status()` can load the zone method and respect its tax setting.
 * Without a valid instance id, Woo defaults shipping to taxable (GST on shipping) even when the
 * method is configured non-taxable — often noticed on orders with taxable products (e.g. NDIS + GST lines).
 */
export function splitWooZoneShippingMethodId(compositeId: string): {
  method_id: string;
  instance_id?: string;
} {
  const raw = String(compositeId || "").trim();
  const idx = raw.indexOf(":");
  if (idx <= 0 || idx >= raw.length - 1) {
    return { method_id: raw };
  }
  return {
    method_id: raw.slice(0, idx),
    instance_id: raw.slice(idx + 1),
  };
}
