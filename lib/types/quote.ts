export interface QuoteItem {
  name: string;
  sku?: string | null;
  price: string | number;
  qty: number;
  attributes?: Record<string, string>;
  deliveryPlan?: string;
  product_id?: number;
  variation_id?: number;
}

export interface QuoteStatusHistory {
  status: 'pending' | 'sent' | 'accepted' | 'rejected' | 'expired';
  changed_at: string;
  changed_by?: string;
  reason?: string;
  notes?: string;
}

export interface QuoteComment {
  id: string;
  quote_id: string;
  author: string;
  author_email: string;
  author_type: 'customer' | 'admin';
  content: string;
  created_at: string;
  updated_at?: string;
  is_internal?: boolean; // Internal notes only visible to admins
}

export interface Quote {
  id: string;
  quote_number: string;
  user_id?: number;
  user_email: string;
  user_name: string;
  items: QuoteItem[];
  subtotal: number;
  shipping: number;
  shipping_method?: string;
  discount: number;
  total: number;
  status: 'pending' | 'sent' | 'accepted' | 'rejected' | 'expired';
  notes?: string;
  admin_notes?: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  accepted_at?: string;
  rejected_at?: string;
  rejected_reason?: string;
  status_history?: QuoteStatusHistory[];
  comments?: QuoteComment[];
}

export interface QuoteRequestPayload {
  email: string;
  userName: string;
  items: QuoteItem[];
  subtotal: number;
  shipping: number;
  shippingMethod?: string;
  discount: number;
  total: number;
  notes?: string;
}

