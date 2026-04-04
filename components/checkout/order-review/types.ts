export interface OrderReviewOrderItem {
  id: number;
  name: string;
  quantity: number;
  price: string;
  total?: string;
  sku?: string;
  image?: { src: string; alt: string };
}

export interface OrderReviewOrder {
  id: number;
  number?: string;
  order_number?: string;
  order_key: string;
  status: string;
  total: string;
  subtotal?: string;
  total_shipping?: string;
  shipping_total?: string;
  total_tax?: string;
  tax_total?: string;
  discount_total?: string;
  payment_method: string;
  payment_method_title: string;
  date_created?: string;
  billing: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address_1: string;
    address_2?: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  shipping: {
    first_name: string;
    last_name: string;
    address_1: string;
    address_2?: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  line_items: OrderReviewOrderItem[];
  meta_data?: Array<{ key: string; value: unknown }>;
}
