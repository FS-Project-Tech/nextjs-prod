export type CartItem = {
  product_id: number;
  variation_id?: number;
  quantity: number;
};

export type Address = {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  company?: string;
  address_1: string;
  address_2?: string;
  city: string;
  state?: string;
  postcode: string;
  country: string;
};

export type CheckoutPayload = {
  billing: Address;
  shipping: Address;
  line_items: CartItem[];
  shipping_method_id: string;
  payment_method: "eway" | "cod";
  coupon_code?: string;
  ndis_type?: string;
  // Optional client hint; never trusted for pricing/totals.
  requested_total?: number;
};

export type WooOrder = {
  id: number;
  number?: string;
  order_number?: string;
  status: string;
  set_paid: boolean;
  payment_method?: string;
  total?: string;
  currency?: string;
  billing?: Record<string, unknown>;
};

export type EwayResponse = {
  transactionOk: boolean;
  transactionStatus?: string;
  transactionId?: string;
  invoiceNumber?: string;
  totalAmountCents?: number;
};
