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
  typesenseHitToSearchProduct,
} from "@/lib/typesense-products";
import { rateLimitMemory, validateTrustedBrowserOrigin } from "@/lib/api-security";
import { createApiErrorResponse, getRequestId, withRequestId } from "@/lib/utils/api-safe";
import { readJsonBody, zodFail } from "@/utils/api-parse";

export const dynamic = "force-dynamic";

const MAX_CANDIDATES = 12;
const MAX_HISTORY_MESSAGES = 6;

const AssistantActionSchema = z
  .enum([
    "suggestions",
    "top_selling",
    "on_sale",
    "shipping_info",
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
  kind: "page" | "category" | "brand" | "search" | "shipping";
};

type TypesenseSearchResult = {
  hits?: Array<{ document?: Record<string, unknown> }>;
  grouped_hits?: Array<{ hits?: Array<{ document?: Record<string, unknown> }> }>;
};

function flattenHits(result: TypesenseSearchResult): Array<{ document?: Record<string, unknown> }> {
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

function buildSearchQueries(message: string, fallbackQuery = ""): string[] {
  const queries: string[] = [];
  uniqPush(queries, message);
  uniqPush(queries, fallbackQuery);

  const skuLikeTokens = message.match(/[a-z0-9][a-z0-9._-]{2,}/gi) ?? [];
  for (const token of skuLikeTokens.slice(0, 4)) {
    if (/[0-9]/.test(token) || /[-_.]/.test(token)) {
      uniqPush(queries, token);
    }
  }

  for (const part of message.split(/[,;\n\r]+/).slice(0, 4)) {
    uniqPush(queries, part);
  }

  return queries.slice(0, 5);
}

function buildOnSaleFilter(): string {
  const onSaleField = TS_FIELDS.onSale;
  const salePriceField = TS_FIELDS.salePrice;
  if (onSaleField && salePriceField) return `(${onSaleField}:=true || ${salePriceField}:>0)`;
  if (onSaleField) return `${onSaleField}:=true`;
  if (salePriceField) return `${salePriceField}:>0`;
  return "";
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
  const byId = new Map<string, ProductCandidate>();
  const queries =
    options.action === "top_selling" || options.action === "on_sale"
      ? ["*"]
      : buildSearchQueries(message, options.fallbackQuery);
  const onSaleFilter = options.onSaleOnly ? buildOnSaleFilter() : "";

  for (const query of queries) {
    const result = (await client
      .collections(collection)
      .documents()
      .search({
        q: query,
        query_by: process.env.TYPESENSE_QUERY_BY || TYPESENSE_DEFAULT_QUERY_BY,
        per_page: 8,
        page: 1,
        sort_by: mapSortToTypesense(options.sortBy || "relevance"),
        ...(onSaleFilter ? { filter_by: onSaleFilter } : {}),
      })) as TypesenseSearchResult;

    for (const hit of flattenHits(result)) {
      if (!hit.document) continue;
      const candidate = candidateFromDocument(hit.document);
      if (!candidate || !candidate.inStock) continue;
      if (!byId.has(candidate.candidateId)) {
        byId.set(candidate.candidateId, candidate);
      }
      if (byId.size >= MAX_CANDIDATES) break;
    }

    if (byId.size >= MAX_CANDIDATES) break;
  }

  return Array.from(byId.values());
}

function productCatalogForPrompt(candidates: ProductCandidate[]): string {
  if (candidates.length === 0) return "No matching product candidates were found.";
  return candidates
    .map((item) => ({
      candidateId: item.candidateId,
      productId: item.productId,
      variationId: item.variationId ?? null,
      name: item.name,
      sku: item.sku ?? "",
      price: item.price,
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
      href: `/products?query=${encodeURIComponent(message)}`,
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
  if (action === "shipping_info" || action === "page_suggest") return [];
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
              "You are an order assistance agent for a medical supplies ecommerce site. Help customers find suitable products, quantities, and next steps. You are not a clinician and must not provide diagnosis or medical advice. Only propose products from the provided candidate list, using candidateId exactly. If candidates are weak or missing, ask a concise clarification question. Do not claim stock, delivery, final price, tax, payment, or eligibility is guaranteed; checkout validates those.",
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

    return withRequestId(
      NextResponse.json({
        success: true,
        requestId,
        candidates,
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
