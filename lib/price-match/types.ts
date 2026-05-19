export type PriceMatchEvidenceMode = "link" | "file" | "photo";

export type PriceMatchProduct = {
  productId: number;
  variationId?: number;
  name: string;
  sku?: string;
  imageUrl?: string;
  /** Unit/base line price used for the request */
  price: string;
  /** e.g. "$42.00 excl. GST" */
  currentPriceLabel: string;
  attributes?: Record<string, string>;
  tax_class?: string | null;
  tax_status?: string | null;
};

export type PriceMatchEvidenceFile = {
  name: string;
  mime: string;
  base64: string;
};

export type PriceMatchRequestBody = {
  email: string;
  userName: string;
  phone: string;
  product: PriceMatchProduct;
  askPrice: string;
  priceIncludesGst: boolean;
  evidenceMode: PriceMatchEvidenceMode;
  competitorLink?: string;
  evidenceFile?: PriceMatchEvidenceFile;
  notes?: string;
};
