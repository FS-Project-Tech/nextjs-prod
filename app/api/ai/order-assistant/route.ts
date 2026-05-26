import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getTypesenseClient,
  getTypesenseCollectionName,
  isTypesenseConfigured,
} from "@/lib/typesenseClient";
import {
  TS_FIELDS,
  TYPESENSE_DEFAULT_QUERY_BY,
  mapSortToTypesense,
  tsEscapeFilterValue,
  typesenseHitToSearchProduct,
} from "@/lib/typesense-products";
import {
  MAX_SKU_SEARCH_QUERY_LEN,
  isExactSkuSearchQuery,
  isLikelySkuToken,
  parseSkuTokens,
  toTypesenseExactArray,
} from "@/lib/sku-search-tokens";
import { rateLimitMemory, validateTrustedBrowserOrigin } from "@/lib/api-security";
import { createApiErrorResponse, getRequestId, withRequestId } from "@/lib/utils/api-safe";
import { readJsonBody, zodFail } from "@/utils/api-parse";
import wcAPI from "@/lib/woocommerce";
import { resolveOrderPostId } from "@/lib/services/wooService";
import {
  buildMachshipTrackingUrl,
  extractMachshipTrackingTokenFromOrderMeta,
} from "@/lib/machship/tracking";

export const dynamic = "force-dynamic";

const MAX_CANDIDATES = 12;
const MAX_HISTORY_MESSAGES = 6;

const AssistantActionSchema = z
  .enum([
    "suggestions",
    "top_selling",
    "on_sale",
    "shipping_info",
    "order_tracking",
    "page_suggest",
    "similar_category",
    "similar_brand",
  ])
  .default("suggestions");

const CartLineSchema = z.object({
  productId: z.number().int().positive(),
  variationId: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(220),
  sku: z.string().nullable().optional(),
  qty: z.number().int().positive().max(999),
  price: z.string().optional(),
});

const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(1200),
});

const RequestSchema = z.object({
  message: z.string().trim().min(2).max(1200),
  action: AssistantActionSchema,
  cartItems: z.array(CartLineSchema).max(80).default([]),
  history: z.array(ChatMessageSchema).max(MAX_HISTORY_MESSAGES).default([]),
});

const ModelProposalSchema = z.object({
  candidateId: z.string().trim().min(1).max(80),
  quantity: z.number().int().min(1).max(99),
  reason: z.string().trim().max(220),
});

const ModelResponseSchema = z.object({
  reply: z.string().trim().min(1).max(1400),
  proposedItems: z.array(ModelProposalSchema).max(8),
  questions: z.array(z.string().trim().min(1).max(180)).max(3),
});

type ProductCandidate = {
  candidateId: string;
  productId: number;
  variationId?: number;
  name: string;
  slug: string;
  sku?: string | null;
  price: string;
  imageUrl?: string;
  attributes?: Record<string, string>;
  tax_class?: string;
  tax_status?: string;
  inStock: boolean;
  categorySlug?: string;
  categoryName?: string;
  brandSlug?: string;
  brandName?: string;
  popularity?: number;
};

type AssistantItem = ProductCandidate & {
  qty: number;
  reason: string;
};

type AssistantAction = z.infer<typeof AssistantActionSchema>;

type PageSuggestion = {
  title: string;
  description: string;
  href: string;
  kind: "page" | "category" | "brand" | "search" | "shipping" | "tracking";
};

type OrderTrackingSummary = {
  orderNumber: string;
  status: string;
  statusLabel: string;
  dateCreated?: string;
  dateModified?: string;
  paymentMethod?: string;
  itemCount?: number;
  total?: string;
  currency?: string;
  trackingToken?: string;
  trackingUrl?: string;
};

type TypesenseHit = {
  document?: Record<string, unknown>;
  text_match?: number;
};

type TypesenseSearchResult = {
  hits?: TypesenseHit[];
  grouped_hits?: Array<{ hits?: TypesenseHit[] }>;
};

function flattenHits(result: TypesenseSearchResult): TypesenseHit[] {
  if (Array.isArray(result.grouped_hits) && result.grouped_hits.length > 0) {
    return result.grouped_hits.flatMap((group) => group.hits ?? []);
  }
  return result.hits ?? [];
}

function normalizePrice(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n.toFixed(2) : "0.00";
}

function firstStringish(...values: unknown[]): string {
  for (const value of values) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      const nested = firstStringish(...value);
      if (nested) return nested;
      continue;
    }
    const s = String(value).trim();
    if (s) return s;
  }
  return "";
}

function labelFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function safePathSegment(value: string): string {
  return encodeURIComponent(value.trim().replace(/^\/+|\/+$/g, ""));
}

function candidateFromDocument(doc: Record<string, unknown>): ProductCandidate | null {
  const product = typesenseHitToSearchProduct(doc);
  const isVariation = product.docType === "variation";
  const productId = isVariation ? Number(product.parentId) : Number(product.id);
  const variationId = isVariation ? Number(product.id) : undefined;

  if (!Number.isFinite(productId) || productId <= 0) return null;
  if (variationId != null && (!Number.isFinite(variationId) || variationId <= 0)) return null;
  if (!product.slug || !product.name) return null;

  const price = normalizePrice(product.price);
  const candidateId = `${productId}:${variationId ?? 0}`;
  const categorySlug = firstStringish(
    doc.category_slug,
    doc.categorySlug,
    doc.category,
    doc.categories_slug
  );
  const categoryName = firstStringish(doc.category_name, doc.categoryName, doc.category_title);
  const brandSlug = firstStringish(doc.brand_slug, doc.brandSlug, doc.brand);
  const brandName = firstStringish(doc.brand_name, doc.brandName, doc.brand_title);
  const popularity = Number(doc.popularity ?? doc.total_sales ?? 0);

  return {
    candidateId,
    productId,
    variationId,
    name: product.name,
    slug: product.slug,
    sku: product.sku || null,
    price,
    imageUrl: product.image || undefined,
    attributes: product.attributes,
    tax_class: product.tax_class,
    tax_status: product.tax_status,
    inStock: product.inStock,
    categorySlug: categorySlug || undefined,
    categoryName: categoryName || (categorySlug ? labelFromSlug(categorySlug) : undefined),
    brandSlug: brandSlug || undefined,
    brandName: brandName || (brandSlug ? labelFromSlug(brandSlug) : undefined),
    popularity: Number.isFinite(popularity) && popularity > 0 ? popularity : undefined,
  };
}

function uniqPush(out: string[], value: string): void {
  const cleaned = value
    .replace(/[<>"'`;\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length < 2) return;
  if (out.some((item) => item.toLowerCase() === cleaned.toLowerCase())) return;
  out.push(cleaned.slice(0, 160));
}

const SEARCH_STOP_WORDS = new Set([
  "a",
  "about",
  "and",
  "are",
  "best",
  "buy",
  "can",
  "could",
  "exact",
  "find",
  "for",
  "get",
  "help",
  "i",
  "im",
  "in",
  "is",
  "item",
  "items",
  "looking",
  "me",
  "my",
  "need",
  "of",
  "or",
  "order",
  "please",
  "product",
  "products",
  "recommend",
  "result",
  "results",
  "search",
  "show",
  "suggest",
  "the",
  "to",
  "want",
  "what",
  "with",
  "you",
]);

function normalizeComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCoreProductQuery(message: string): string {
  const cleaned = message
    .replace(/[?!.]/g, " ")
    .replace(
      /\b(?:i am|i'm|im|we are|we're|looking for|look for|do you have|can you|could you|help me find|help me|show me|find me|search for|suggest|recommend|please|products?|items?)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

  const terms = cleaned
    .split(/[^a-z0-9._/-]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && !SEARCH_STOP_WORDS.has(term.toLowerCase()));

  return terms.join(" ").slice(0, 160);
}

function searchTerms(value: string): string[] {
  return normalizeComparable(value)
    .split(/\s+/)
    .filter((term) => term.length >= 2 && !SEARCH_STOP_WORDS.has(term));
}

function extractSkuSearchTokens(message: string): string[] {
  const raw = String(message || "")
    .trim()
    .slice(0, MAX_SKU_SEARCH_QUERY_LEN);
  const parsedTokens = parseSkuTokens(raw);
  const out: string[] = [];

  if (isExactSkuSearchQuery(raw, parsedTokens)) {
    for (const token of parsedTokens) uniqPush(out, token);
  }

  const inlineTokens = raw.match(/[a-z0-9][a-z0-9._/-]{2,}[a-z0-9]/gi) ?? [];
  for (const token of inlineTokens) {
    if (isLikelySkuToken(token)) uniqPush(out, token);
  }

  return out.slice(0, 8);
}

function buildSearchQueries(message: string, fallbackQuery = ""): string[] {
  const queries: string[] = [];
  const coreQuery = extractCoreProductQuery(message);

  for (const token of extractSkuSearchTokens(message)) {
    uniqPush(queries, token);
  }

  uniqPush(queries, coreQuery);

  for (const part of message.split(/[,;\n\r]+|\b(?:and|or)\b/i).slice(0, 6)) {
    uniqPush(queries, extractCoreProductQuery(part));
  }

  const terms = searchTerms(coreQuery);
  if (terms.length > 1 && terms.length <= 5) {
    for (const term of terms) uniqPush(queries, term);
  }

  uniqPush(queries, fallbackQuery);
  uniqPush(queries, message);

  return queries.slice(0, 10);
}

function buildOnSaleFilter(): string {
  const onSaleField = TS_FIELDS.onSale;
  const salePriceField = TS_FIELDS.salePrice;
  if (onSaleField && salePriceField) return `(${onSaleField}:=true || ${salePriceField}:>0)`;
  if (onSaleField) return `${onSaleField}:=true`;
  if (salePriceField) return `${salePriceField}:>0`;
  return "";
}

function combineFilters(...parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" && ");
}

function candidateSearchHaystack(candidate: ProductCandidate): string {
  return normalizeComparable(
    [
      candidate.name,
      candidate.sku || "",
      candidate.categoryName || "",
      candidate.categorySlug || "",
      candidate.brandName || "",
      candidate.brandSlug || "",
      ...Object.values(candidate.attributes ?? {}),
    ].join(" ")
  );
}

function rankCandidate(params: {
  candidate: ProductCandidate;
  message: string;
  query: string;
  queryIndex: number;
  hitIndex: number;
  textMatch?: number;
  baseBoost?: number;
}): number {
  const { candidate, message, query, queryIndex, hitIndex, textMatch = 0, baseBoost = 0 } = params;
  const coreQuery = extractCoreProductQuery(message);
  const coreComparable = normalizeComparable(coreQuery || message);
  const queryComparable = normalizeComparable(query);
  const nameComparable = normalizeComparable(candidate.name);
  const skuComparable = normalizeComparable(candidate.sku || "");
  const haystack = candidateSearchHaystack(candidate);
  const messageTerms = searchTerms(coreQuery || message);
  const queryTerms = searchTerms(query);

  let score = baseBoost;
  score += Math.max(0, 1200 - queryIndex * 100);
  score += Math.max(0, 180 - hitIndex * 8);
  score += Math.min(500, Math.max(0, textMatch) / 10_000);
  score += Math.min(900, Math.max(0, candidate.popularity ?? 0) * 6);

  for (const skuToken of extractSkuSearchTokens(message)) {
    const skuTokenComparable = normalizeComparable(skuToken);
    if (!skuTokenComparable || !skuComparable) continue;
    if (skuComparable === skuTokenComparable) score += 20_000;
    else if (skuComparable.includes(skuTokenComparable)) score += 8_000;
  }

  if (coreComparable) {
    if (nameComparable === coreComparable) score += 6_000;
    else if (nameComparable.startsWith(coreComparable)) score += 3_500;
    else if (nameComparable.includes(coreComparable)) score += 2_500;

    if (haystack.includes(coreComparable)) score += 1_200;
  }

  if (queryComparable && nameComparable.includes(queryComparable)) score += 1_000;

  const matchedMessageTerms = messageTerms.filter((term) => haystack.includes(term));
  const matchedNameTerms = messageTerms.filter((term) => nameComparable.includes(term));
  if (messageTerms.length > 0 && matchedNameTerms.length === messageTerms.length) score += 1_800;
  if (messageTerms.length > 0 && matchedMessageTerms.length === messageTerms.length) score += 1_000;
  score += matchedNameTerms.length * 180;
  score += matchedMessageTerms.length * 90;
  score += queryTerms.filter((term) => haystack.includes(term)).length * 120;

  return score;
}

type ProductSearchOptions = {
  action: AssistantAction;
  fallbackQuery?: string;
  onSaleOnly?: boolean;
  sortBy?: "relevance" | "popularity";
};

async function searchProductCandidates(
  message: string,
  options: ProductSearchOptions
): Promise<ProductCandidate[]> {
  if (!isTypesenseConfigured()) return [];

  const client = getTypesenseClient();
  const collection = getTypesenseCollectionName();
  const ranked = new Map<string, { candidate: ProductCandidate; score: number; order: number }>();
  let order = 0;
  const queries =
    options.action === "top_selling" || options.action === "on_sale"
      ? ["*"]
      : buildSearchQueries(message, options.fallbackQuery);
  const onSaleFilter = options.onSaleOnly ? buildOnSaleFilter() : "";
  const sort_by = mapSortToTypesense(options.sortBy || "relevance");

  const addHit = (
    hit: TypesenseHit,
    query: string,
    queryIndex: number,
    hitIndex: number,
    baseBoost = 0
  ) => {
    if (!hit.document) return;
    const candidate = candidateFromDocument(hit.document);
    if (!candidate || !candidate.inStock) return;
    const score = rankCandidate({
      candidate,
      message,
      query,
      queryIndex,
      hitIndex,
      textMatch: hit.text_match,
      baseBoost,
    });
    const existing = ranked.get(candidate.candidateId);
    if (!existing) {
      ranked.set(candidate.candidateId, { candidate, score, order: order++ });
      return;
    }
    if (score > existing.score) {
      ranked.set(candidate.candidateId, {
        candidate,
        score,
        order: existing.order,
      });
    }
  };

  const runSearch = async (
    query: string,
    queryIndex: number,
    filter_by: string,
    baseBoost = 0,
    queryBy = process.env.TYPESENSE_QUERY_BY || TYPESENSE_DEFAULT_QUERY_BY
  ) => {
    const result = (await client
      .collections(collection)
      .documents()
      .search({
        q: query,
        query_by: queryBy,
        per_page: 10,
        page: 1,
        sort_by,
        ...(filter_by ? { filter_by } : {}),
      })) as TypesenseSearchResult;

    flattenHits(result).forEach((hit, hitIndex) =>
      addHit(hit, query, queryIndex, hitIndex, baseBoost)
    );
  };

  const exactSkuSearchTokens = extractSkuSearchTokens(message);
  if (exactSkuSearchTokens.length > 0 && options.action === "suggestions") {
    const skuFilter = `sku:=${toTypesenseExactArray(exactSkuSearchTokens)}`;
    await runSearch("*", -1, combineFilters(onSaleFilter, skuFilter), 10_000, "name,sku");
  }

  for (let i = 0; i < queries.length; i += 1) {
    await runSearch(queries[i], i, onSaleFilter);
  }

  const sortedCandidates = Array.from(ranked.values())
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, MAX_CANDIDATES)
    .map((item) => item.candidate);

  const exactSkuTokens = exactSkuSearchTokens.map(normalizeComparable).filter(Boolean);
  if (exactSkuTokens.length > 0) {
    const exactSkuMatches = sortedCandidates.filter((candidate) => {
      const sku = normalizeComparable(candidate.sku || "");
      return sku && exactSkuTokens.includes(sku);
    });
    if (exactSkuMatches.length > 0) return exactSkuMatches;
  }

  return sortedCandidates;
}

function productCandidateToAssistantItem(
  candidate: ProductCandidate,
  reason: string
): AssistantItem {
  return {
    ...candidate,
    qty: 1,
    reason,
  };
}

async function searchRelatedProductCandidates(
  primaryItems: AssistantItem[],
  candidates: ProductCandidate[]
): Promise<AssistantItem[]> {
  if (!isTypesenseConfigured()) return [];
  const seeds =
    primaryItems.length > 0
      ? primaryItems
      : candidates
          .slice(0, 3)
          .map((candidate) =>
            productCandidateToAssistantItem(candidate, "Relevant product match.")
          );
  if (seeds.length === 0) return [];

  const exclude = new Set([...primaryItems, ...candidates].map((item) => item.candidateId));
  const filters: string[] = [];
  for (const seed of seeds.slice(0, 3)) {
    if (seed.categorySlug) {
      filters.push(`${TS_FIELDS.categorySlug}:=${tsEscapeFilterValue(seed.categorySlug)}`);
    }
    if (seed.brandSlug) {
      filters.push(`${TS_FIELDS.brandSlug}:=${tsEscapeFilterValue(seed.brandSlug)}`);
    }
  }

  const uniqueFilters = Array.from(new Set(filters)).slice(0, 4);
  if (uniqueFilters.length === 0) return [];

  const client = getTypesenseClient();
  const collection = getTypesenseCollectionName();
  const byId = new Map<string, AssistantItem>();

  for (const filter_by of uniqueFilters) {
    const result = (await client
      .collections(collection)
      .documents()
      .search({
        q: "*",
        query_by: process.env.TYPESENSE_QUERY_BY || TYPESENSE_DEFAULT_QUERY_BY,
        per_page: 8,
        page: 1,
        sort_by: mapSortToTypesense("popularity"),
        filter_by,
      })) as TypesenseSearchResult;

    for (const hit of flattenHits(result)) {
      if (!hit.document) continue;
      const candidate = candidateFromDocument(hit.document);
      if (!candidate || !candidate.inStock || exclude.has(candidate.candidateId)) continue;
      if (!byId.has(candidate.candidateId)) {
        byId.set(
          candidate.candidateId,
          productCandidateToAssistantItem(candidate, "Related product customers often consider.")
        );
      }
      if (byId.size >= 6) break;
    }
    if (byId.size >= 6) break;
  }

  return Array.from(byId.values());
}

function extractOrderReference(message: string): string {
  const cleaned = String(message || "").trim();
  const labeled = cleaned.match(
    /\b(?:order|order id|order number|tracking)\s*#?\s*([a-z0-9-]{3,32})\b/i
  );
  if (labeled?.[1]) return labeled[1].trim();
  const hash = cleaned.match(/#\s*([a-z0-9-]{3,32})/i);
  if (hash?.[1]) return hash[1].trim();
  const numeric = cleaned.match(/\b\d{4,12}\b/);
  return numeric?.[0] || "";
}

function isOrderTrackingIntent(message: string): boolean {
  return /\b(track|tracking|order status|where is my order|where's my order)\b/i.test(message);
}

function orderStatusLabel(status: string): string {
  const normalized = status.trim().toLowerCase();
  const labels: Record<string, string> = {
    pending: "Pending payment",
    processing: "Processing",
    "on-hold": "On hold",
    completed: "Completed",
    cancelled: "Cancelled",
    refunded: "Refunded",
    failed: "Failed",
  };
  return labels[normalized] || labelFromSlug(normalized || "unknown");
}

function trackingReply(summary: OrderTrackingSummary): string {
  const trackingText = summary.trackingUrl
    ? " A carrier tracking link is available below."
    : " I could not find a carrier tracking link yet, but the order status is shown below.";
  return `Order ${summary.orderNumber} is currently ${summary.statusLabel}.${trackingText}`;
}

async function fetchOrderTrackingSummary(message: string): Promise<{
  reply: string;
  tracking?: OrderTrackingSummary;
  questions: string[];
  pages: PageSuggestion[];
}> {
  const orderRef = extractOrderReference(message);
  if (!orderRef) {
    return {
      reply: "Please enter your order ID or order number and I can check the latest status.",
      questions: ["Track order #12345", "Where do I find my order ID?"],
      pages: [],
    };
  }

  const postId = await resolveOrderPostId(orderRef);
  if (!postId) {
    return {
      reply:
        "I could not find that order number. Please check the order ID from your confirmation email and try again.",
      questions: ["Track another order", "Contact support"],
      pages: [
        {
          title: "Contact JOYA",
          description: "Ask our team to help locate your order.",
          href: "/contact",
          kind: "tracking",
        },
      ],
    };
  }

  const { data } = await wcAPI.get(`/orders/${postId}`, {
    params: {
      _fields:
        "id,number,order_number,status,total,currency,date_created,date_modified,payment_method_title,line_items,meta_data",
    },
    timeout: 15_000,
  });
  const order = data as Record<string, unknown>;
  const status = String(order.status ?? "");
  const trackingToken = extractMachshipTrackingTokenFromOrderMeta(
    Array.isArray(order.meta_data)
      ? (order.meta_data as Array<{ key?: string; value?: unknown }>)
      : undefined
  );
  const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
  const tracking: OrderTrackingSummary = {
    orderNumber: String(order.number ?? order.order_number ?? order.id ?? orderRef),
    status,
    statusLabel: orderStatusLabel(status),
    dateCreated: firstStringish(order.date_created),
    dateModified: firstStringish(order.date_modified),
    paymentMethod: firstStringish(order.payment_method_title),
    itemCount: lineItems.length,
    total: firstStringish(order.total),
    currency: firstStringish(order.currency) || "AUD",
    ...(trackingToken
      ? {
          trackingToken,
          trackingUrl: buildMachshipTrackingUrl(trackingToken),
        }
      : {}),
  };

  return {
    reply: trackingReply(tracking),
    tracking,
    questions: ["Track another order", "Show shipping information", "Contact support"],
    pages: tracking.trackingUrl
      ? [
          {
            title: "Carrier tracking",
            description: "Open the live carrier tracking page for this order.",
            href: tracking.trackingUrl,
            kind: "tracking",
          },
        ]
      : [],
  };
}

function productCatalogForPrompt(candidates: ProductCandidate[]): string {
  if (candidates.length === 0) return "No matching product candidates were found.";
  return candidates
    .map((item, index) => ({
      rank: index + 1,
      candidateId: item.candidateId,
      productId: item.productId,
      variationId: item.variationId ?? null,
      name: item.name,
      sku: item.sku ?? "",
      price: item.price,
      popularity: item.popularity ?? 0,
      attributes: item.attributes ?? {},
    }))
    .map((item) => JSON.stringify(item))
    .join("\n");
}

function cartForPrompt(cartItems: z.infer<typeof CartLineSchema>[]): string {
  if (cartItems.length === 0) return "Cart is currently empty.";
  return cartItems
    .map((item) =>
      JSON.stringify({
        productId: item.productId,
        variationId: item.variationId ?? null,
        name: item.name,
        sku: item.sku ?? "",
        qty: item.qty,
        price: item.price ?? "",
      })
    )
    .join("\n");
}

function pushUniquePage(pages: PageSuggestion[], page: PageSuggestion): void {
  if (pages.some((item) => item.href === page.href)) return;
  pages.push(page);
}

function pageSuggestionsForAction(
  action: AssistantAction,
  message: string,
  candidates: ProductCandidate[]
): PageSuggestion[] {
  const pages: PageSuggestion[] = [];
  const lower = message.toLowerCase();

  if (action === "shipping_info" || /\b(ship|shipping|delivery|return|freight)\b/.test(lower)) {
    pushUniquePage(pages, {
      title: "Shipping & Returns",
      description: "Review delivery, freight, and returns information before checkout.",
      href: "/info/shipping",
      kind: "shipping",
    });
    pushUniquePage(pages, {
      title: "Cart Shipping Estimate",
      description: "Estimate available shipping options from your current cart.",
      href: "/cart",
      kind: "shipping",
    });
  }

  if (
    action === "order_tracking" ||
    /\b(track|tracking|order status|where is my order)\b/.test(lower)
  ) {
    pushUniquePage(pages, {
      title: "Contact JOYA",
      description: "Need help with an order? Our team can check details for you.",
      href: "/contact",
      kind: "tracking",
    });
  }

  if (action === "top_selling") {
    pushUniquePage(pages, {
      title: "Top Selling Products",
      description: "Browse popular products across the catalogue.",
      href: "/recommended?sortBy=popularity",
      kind: "page",
    });
  }

  if (action === "on_sale" || /\b(sale|discount|clearance|deal|deals)\b/.test(lower)) {
    pushUniquePage(pages, {
      title: "Clearance Products",
      description: "Browse discounted and on-sale products.",
      href: "/clearance",
      kind: "page",
    });
  }

  if (action === "page_suggest") {
    pushUniquePage(pages, {
      title: "All Products",
      description: "Search and filter the full product catalogue.",
      href: `/products?query=${encodeURIComponent(extractCoreProductQuery(message) || message)}`,
      kind: "search",
    });
    pushUniquePage(pages, {
      title: "Categories",
      description: "Browse products by medical supply category.",
      href: "/categories",
      kind: "page",
    });
    pushUniquePage(pages, {
      title: "Brands",
      description: "Browse products by manufacturer or brand.",
      href: "/brands",
      kind: "page",
    });
  }

  if (action === "suggestions" && candidates.length > 0) {
    const query = extractCoreProductQuery(message) || message;
    pushUniquePage(pages, {
      title: "All matching products",
      description: "Open the full product search page for this request.",
      href: `/products?query=${encodeURIComponent(query)}`,
      kind: "search",
    });
  }

  for (const candidate of candidates) {
    if ((action === "similar_category" || action === "page_suggest") && candidate.categorySlug) {
      pushUniquePage(pages, {
        title: candidate.categoryName || labelFromSlug(candidate.categorySlug),
        description: `Browse more products in ${candidate.categoryName || labelFromSlug(candidate.categorySlug)}.`,
        href: `/product-category/${safePathSegment(candidate.categorySlug)}`,
        kind: "category",
      });
    }

    if ((action === "similar_brand" || action === "page_suggest") && candidate.brandSlug) {
      pushUniquePage(pages, {
        title: candidate.brandName || labelFromSlug(candidate.brandSlug),
        description: `View more products from ${candidate.brandName || labelFromSlug(candidate.brandSlug)}.`,
        href: `/brands/${safePathSegment(candidate.brandSlug)}`,
        kind: "brand",
      });
    }

    if (pages.length >= 8) break;
  }

  return pages.slice(0, 8);
}

function ruleBasedItems(action: AssistantAction, candidates: ProductCandidate[]): AssistantItem[] {
  if (action === "shipping_info" || action === "order_tracking" || action === "page_suggest") {
    return [];
  }
  return candidates.slice(0, 6).map((candidate) => ({
    ...candidate,
    qty: 1,
    reason:
      action === "top_selling"
        ? "Popular product based on catalogue ranking."
        : action === "on_sale"
          ? "On-sale catalogue match."
          : action === "similar_category"
            ? "Related product from a matching category."
            : action === "similar_brand"
              ? "Related product from a matching brand."
              : "Relevant product match.",
  }));
}

function ruleBasedResponse(
  action: AssistantAction,
  message: string,
  candidates: ProductCandidate[]
): { reply: string; items: AssistantItem[]; questions: string[]; pages: PageSuggestion[] } {
  const pages = pageSuggestionsForAction(action, message, candidates);
  const items = ruleBasedItems(action, candidates);

  if (action === "shipping_info") {
    return {
      reply:
        "For shipping, the best next step is the Shipping & Returns page or your cart shipping estimate. Exact rates depend on address, cart subtotal, and product rules.",
      items,
      questions: ["Estimate shipping from my cart", "Show delivery and returns info"],
      pages,
    };
  }

  if (action === "order_tracking") {
    return {
      reply: "Share your order ID or order number and I can check the latest status.",
      items,
      questions: ["Track order #12345", "Where do I find my order ID?", "Contact support"],
      pages,
    };
  }

  if (action === "page_suggest") {
    return {
      reply:
        pages.length > 0
          ? "I found a few pages that should help. Choose one to open it."
          : "Try a product name, SKU, category, brand, or topic and I can suggest the best page.",
      items,
      questions: ["Show sale page", "Show brands", "Show categories"],
      pages,
    };
  }

  const replyByAction: Record<AssistantAction, string> = {
    suggestions:
      items.length > 0
        ? "Here are product suggestions I found. Review them before adding to cart."
        : "I could not find a strong product match yet. Try a product name, SKU, category, or brand.",
    top_selling:
      items.length > 0
        ? "Here are popular products from the catalogue."
        : "I could not load top-selling products right now.",
    on_sale:
      items.length > 0
        ? "Here are on-sale products and the clearance page."
        : "I could not find on-sale matches right now. You can still browse clearance.",
    shipping_info: "",
    order_tracking: "",
    page_suggest: "",
    similar_category:
      items.length > 0
        ? "Here are related products and category pages based on your request."
        : "I could not find a matching category yet. Try a product name or category keyword.",
    similar_brand:
      items.length > 0
        ? "Here are related products and brand pages based on your request."
        : "I could not find a matching brand yet. Try a brand or product keyword.",
  };

  return {
    reply: replyByAction[action],
    items,
    questions:
      items.length > 0
        ? ["Show similar categories", "Show similar brands", "Show on-sale items"]
        : ["Search by SKU", "Browse categories", "Browse brands"],
    pages,
  };
}

async function callOpenAI(params: {
  message: string;
  history: z.infer<typeof ChatMessageSchema>[];
  cartItems: z.infer<typeof CartLineSchema>[];
  candidates: ProductCandidate[];
}): Promise<z.infer<typeof ModelResponseSchema>> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_ORDER_ASSISTANT_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "order_assistant_response",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["reply", "proposedItems", "questions"],
              properties: {
                reply: { type: "string" },
                proposedItems: {
                  type: "array",
                  maxItems: 8,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["candidateId", "quantity", "reason"],
                    properties: {
                      candidateId: { type: "string" },
                      quantity: { type: "integer", minimum: 1, maximum: 99 },
                      reason: { type: "string" },
                    },
                  },
                },
                questions: {
                  type: "array",
                  maxItems: 3,
                  items: { type: "string" },
                },
              },
            },
          },
        },
        messages: [
          {
            role: "system",
            content:
              "You are a friendly ecommerce shopping assistant for a medical supplies website. Help customers find products, compare options, track orders, and choose next steps in a conversational way. You are not a clinician and must not provide diagnosis or medical advice. Only propose products from the provided candidate list, using candidateId exactly. The candidate list is ranked by catalogue search quality and popularity, so prefer the lowest rank numbers and top-selling matches, especially exact SKU or name matches. Only say 'exact match' when the customer gave an exact SKU or the product name exactly matches; for broad category requests say 'relevant match' or 'category match'. If candidates are weak or missing, ask a concise clarification question instead of guessing. Do not claim stock, delivery, final price, tax, payment, or eligibility is guaranteed; checkout validates those.",
          },
          ...params.history.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          {
            role: "user",
            content: [
              "Current cart:",
              cartForPrompt(params.cartItems),
              "",
              "Allowed product candidates:",
              productCatalogForPrompt(params.candidates),
              "",
              "Selection rule: choose only the strongest ranked products that directly match the customer request. If no candidate directly matches, return no proposedItems and ask one clarification question.",
              "",
              "Customer request:",
              params.message,
            ].join("\n"),
          },
        ],
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string } }>;
    };

    if (!res.ok) {
      throw new Error(data.error?.message || "AI assistant request failed");
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI assistant returned an empty response");

    return ModelResponseSchema.parse(JSON.parse(content));
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeModelResponse(
  modelResponse: z.infer<typeof ModelResponseSchema>,
  candidates: ProductCandidate[]
): { reply: string; items: AssistantItem[]; questions: string[] } {
  const byId = new Map(candidates.map((item) => [item.candidateId, item]));
  const rankById = new Map(candidates.map((item, index) => [item.candidateId, index]));
  const items: AssistantItem[] = [];

  for (const proposal of modelResponse.proposedItems) {
    const candidate = byId.get(proposal.candidateId);
    if (!candidate) continue;
    items.push({
      ...candidate,
      qty: proposal.quantity,
      reason: proposal.reason,
    });
  }

  items.sort(
    (a, b) =>
      (rankById.get(a.candidateId) ?? Number.MAX_SAFE_INTEGER) -
      (rankById.get(b.candidateId) ?? Number.MAX_SAFE_INTEGER)
  );

  return {
    reply: modelResponse.reply,
    items,
    questions: modelResponse.questions,
  };
}

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);

  if (!validateTrustedBrowserOrigin(req)) {
    return withRequestId(NextResponse.json({ error: "Forbidden" }, { status: 403 }), requestId);
  }

  const limit = await rateLimitMemory({
    windowMs: 60_000,
    maxRequests: 20,
    routeKey: "ai-order-assistant",
  })(req);
  if (limit) return withRequestId(limit, requestId);

  try {
    const parsed = RequestSchema.safeParse(await readJsonBody(req));
    if (!parsed.success) {
      return withRequestId(NextResponse.json(zodFail(parsed.error), { status: 400 }), requestId);
    }

    const action = parsed.data.action;

    if (
      action === "order_tracking" ||
      (action === "suggestions" && isOrderTrackingIntent(parsed.data.message))
    ) {
      const trackingPayload = await fetchOrderTrackingSummary(parsed.data.message);
      return withRequestId(
        NextResponse.json({
          success: true,
          requestId,
          candidates: [],
          items: [],
          relatedItems: [],
          ...trackingPayload,
        }),
        requestId
      );
    }

    const fallbackQuery = parsed.data.cartItems
      .map((item) => item.name)
      .filter(Boolean)
      .slice(0, 3)
      .join(" ");
    const candidates = await searchProductCandidates(parsed.data.message, {
      action,
      fallbackQuery,
      onSaleOnly: action === "on_sale",
      sortBy: action === "top_selling" || action === "on_sale" ? "popularity" : "relevance",
    });

    if (action !== "suggestions") {
      return withRequestId(
        NextResponse.json({
          success: true,
          requestId,
          candidates,
          ...ruleBasedResponse(action, parsed.data.message, candidates),
        }),
        requestId
      );
    }

    let payload: ReturnType<typeof ruleBasedResponse>;
    try {
      const modelResponse = await callOpenAI({
        message: parsed.data.message,
        history: parsed.data.history,
        cartItems: parsed.data.cartItems,
        candidates,
      });
      payload = {
        ...sanitizeModelResponse(modelResponse, candidates),
        pages: pageSuggestionsForAction(action, parsed.data.message, candidates),
      };
    } catch (error) {
      console.warn("[ai-order-assistant] model fallback", { requestId, error });
      payload = ruleBasedResponse(action, parsed.data.message, candidates);
    }

    const relatedItems =
      action === "suggestions" && payload.items.length > 0
        ? await searchRelatedProductCandidates(payload.items, candidates)
        : [];

    return withRequestId(
      NextResponse.json({
        success: true,
        requestId,
        candidates,
        relatedItems,
        ...payload,
      }),
      requestId
    );
  } catch (error) {
    if (error instanceof Error && error.message === "OPENAI_API_KEY is not configured") {
      return withRequestId(
        NextResponse.json(
          {
            success: false,
            requestId,
            error: "AI order assistant is not configured. Set OPENAI_API_KEY on the server.",
          },
          { status: 503 }
        ),
        requestId
      );
    }

    return createApiErrorResponse(error, {
      requestId,
      defaultMessage: "AI order assistant is temporarily unavailable.",
      fallbackBody: { success: false },
      logPrefix: "ai-order-assistant",
    });
  }
}
