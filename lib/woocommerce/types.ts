export interface WooCommerceProduct {
  id: number;
  name: string;
  slug: string;
  type?: "simple" | "grouped" | "external" | "variable";
  permalink: string;
  description: string;
  short_description: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  date_on_sale_from: string | null;
  date_on_sale_to: string | null;
  on_sale: boolean;
  status: string;
  featured: boolean;
  purchasable: boolean;
  total_sales: number;
  virtual: boolean;
  downloadable: boolean;
  downloads: any[];
  download_limit: number;
  download_expiry: number;
  external_url: string;
  button_text: string;
  tax_status: string;
  tax_class: string;
  manage_stock: boolean;
  stock_quantity: number | null;
  stock_status: string;
  backorders: string;
  backorders_allowed: boolean;
  backordered: boolean;
  sold_individually: boolean;
  weight: string;
  dimensions: {
    length: string;
    width: string;
    height: string;
  };
  shipping_required: boolean;
  shipping_taxable: boolean;
  shipping_class: string;
  shipping_class_id: number;
  reviews_allowed: boolean;
  average_rating: string;
  rating_count: number;
  related_ids: number[];
  upsell_ids: number[];
  cross_sell_ids: number[];
  parent_id: number;
  purchase_note: string;
  categories: Array<{
    id: number;
    name: string;
    slug: string;
  }>;
  tags: Array<{
    id: number;
    name: string;
    slug: string;
  }>;
  images: Array<{
    id: number;
    src: string;
    name: string;
    alt: string;
  }>;
  attributes: any[];
  default_attributes: any[];
  variations: number[];
  grouped_products: number[];
  menu_order: number;
  meta_data: any[];
  date_created?: string;
  date_created_gmt?: string;
}

export interface WooCommerceVariationAttribute {
  id?: number;
  name: string;
  option: string;
}

export interface WooCommerceVariation {
  id: number;
  sku: string | null;
  status?: string;
  enabled?: boolean;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  tax_status?: string;
  tax_class?: string;
  image?: { id: number; src: string; name: string; alt: string } | null;
  attributes: WooCommerceVariationAttribute[];
  stock_status: string;
}

export interface PaginatedProductResponse {
  products: WooCommerceProduct[];
  total: number;
  totalPages: number;
  page: number;
  perPage: number;
}

export interface WooCommerceProductReview {
  id: number;
  date_created: string;
  reviewer: string;
  reviewer_email: string;
  review: string;
  rating: number;
  verified: boolean;
}

export interface WooCommerceCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
  count: number;
  description?: string;
  image?: { src: string; alt?: string };
}
