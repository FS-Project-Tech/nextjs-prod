/**
 * Quote Template Types
 * Templates allow users to save quote configurations for quick reuse
 */

import type { QuoteItem } from './quote';

export interface QuoteTemplate {
  id: string;
  name: string;
  description?: string;
  user_id?: number;
  user_email: string;
  items: QuoteItem[];
  shipping_method?: string;
  notes?: string;
  is_default?: boolean;
  created_at: string;
  updated_at: string;
  usage_count?: number; // Track how many times template has been used
}

export interface QuoteTemplatePayload {
  name: string;
  description?: string;
  items: QuoteItem[];
  shipping_method?: string;
  notes?: string;
  is_default?: boolean;
}

