"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgePercent,
  Bot,
  Layers3,
  Loader2,
  MessageCircle,
  PackageSearch,
  Send,
  ShoppingCart,
  Sparkles,
  Tags,
  Truck,
  X,
} from "lucide-react";
import { useCart } from "@/components/CartProvider";
import { useToast } from "@/components/ToastProvider";
import type { CartItem } from "@/lib/types/cart";

type ChatRole = "user" | "assistant";
type AssistantAction =
  | "suggestions"
  | "top_selling"
  | "on_sale"
  | "shipping_info"
  | "page_suggest"
  | "similar_category"
  | "similar_brand";

type AssistantItem = {
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
  qty: number;
  reason: string;
};

type ChatEntry = {
  id: string;
  role: ChatRole;
  content: string;
  items?: AssistantItem[];
  questions?: string[];
  pages?: PageSuggestion[];
};

type AssistantResponse = {
  success?: boolean;
  reply?: string;
  items?: AssistantItem[];
  questions?: string[];
  pages?: PageSuggestion[];
  error?: string;
};

type PageSuggestion = {
  title: string;
  description: string;
  href: string;
  kind: "page" | "category" | "brand" | "search" | "shipping";
};

type QuickOption = {
  label: string;
  action: AssistantAction;
  prompt: string;
  Icon: typeof Sparkles;
};

const starterPrompts = [
  "I need gloves and wipes for a small clinic",
  "Help me reorder 2 cartons of continence products",
  "Find dressings and tape for wound care",
];

const quickOptions: QuickOption[] = [
  {
    label: "Suggestions",
    action: "suggestions",
    prompt: "Suggest products for my order",
    Icon: Sparkles,
  },
  {
    label: "Top selling",
    action: "top_selling",
    prompt: "Show top selling products",
    Icon: PackageSearch,
  },
  {
    label: "On sale",
    action: "on_sale",
    prompt: "Show on sale products",
    Icon: BadgePercent,
  },
  {
    label: "Shipping info",
    action: "shipping_info",
    prompt: "Show shipping information",
    Icon: Truck,
  },
  {
    label: "Suggest page",
    action: "page_suggest",
    prompt: "Suggest the best page for this",
    Icon: ArrowRight,
  },
  {
    label: "Similar category",
    action: "similar_category",
    prompt: "Show similar categories",
    Icon: Layers3,
  },
  {
    label: "Similar brand",
    action: "similar_brand",
    prompt: "Show similar brands",
    Icon: Tags,
  },
];

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function productHref(item: AssistantItem): string {
  const base = `/product/${encodeURIComponent(item.slug)}`;
  return item.variationId ? `${base}?variation_id=${item.variationId}` : base;
}

function toCartInput(item: AssistantItem): Omit<CartItem, "id"> {
  return {
    productId: item.productId,
    variationId: item.variationId,
    name: item.name,
    slug: item.slug,
    imageUrl: item.imageUrl,
    price: item.price,
    qty: item.qty,
    sku: item.sku || undefined,
    attributes: item.attributes,
    tax_class: item.tax_class,
    tax_status: item.tax_status,
  };
}

export default function AIOrderAssistant() {
  const featureDisabled = process.env.NEXT_PUBLIC_AI_ORDER_ASSISTANT_ENABLED === "false";
  const router = useRouter();
  const { items: cartItems, addItem, open } = useCart();
  const toast = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatEntry[]>([
    {
      id: makeId(),
      role: "assistant",
      content:
        "Tell me what you are ordering, a product name, SKU, or care setting. I can suggest matching items and add them to your cart for review.",
    },
  ]);
  const inputRef = useRef<HTMLInputElement>(null);

  const cartContext = useMemo(
    () =>
      cartItems.map((item) => ({
        productId: item.productId,
        variationId: item.variationId,
        name: item.name,
        sku: item.sku ?? null,
        qty: item.qty,
        price: item.price,
      })),
    [cartItems]
  );

  if (featureDisabled) return null;

  const openAssistant = () => {
    setIsOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 100);
  };

  const addSuggestedItem = (item: AssistantItem) => {
    addItem(toCartInput(item));
    open();
    toast.success(`Added ${item.name} to cart`);
  };

  const addAllSuggestedItems = (items: AssistantItem[]) => {
    for (const item of items) addItem(toCartInput(item));
    open();
    toast.success(`Added ${items.length} suggested item${items.length === 1 ? "" : "s"} to cart`);
  };

  const openPage = (href: string) => {
    setIsOpen(false);
    router.push(href);
  };

  const submitPrompt = async (prompt?: string, action: AssistantAction = "suggestions") => {
    const text = (prompt ?? input).trim();
    if (!text || isLoading) return;

    const userMessage: ChatEntry = { id: makeId(), role: "user", content: text };
    const history = messages
      .slice(-6)
      .map((message) => ({ role: message.role, content: message.content }));

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/ai/order-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          message: text,
          action,
          cartItems: cartContext,
          history,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as AssistantResponse;

      if (!res.ok || data.success === false) {
        throw new Error(data.error || "AI order assistant is unavailable");
      }

      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: "assistant",
          content: data.reply || "I found a few possible matches.",
          items: data.items || [],
          questions: data.questions || [],
          pages: data.pages || [],
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI order assistant is unavailable";
      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: "assistant",
          content: message,
        },
      ]);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitPrompt();
  };

  const runQuickOption = (option: QuickOption) => {
    const context = input.trim();
    const prompt =
      context && option.action !== "top_selling" && option.action !== "on_sale"
        ? `${option.prompt}: ${context}`
        : option.prompt;
    void submitPrompt(prompt, option.action);
  };

  return (
    <>
      <button
        type="button"
        onClick={openAssistant}
        className="fixed bottom-5 left-5 z-[80] inline-flex items-center gap-2 rounded-full bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-xl shadow-teal-900/20 transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <Sparkles className="h-4 w-4" aria-hidden />
        AI Order Help
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-start bg-black/25 p-3 sm:items-end sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-label="AI order assistant"
        >
          <div className="flex h-[min(760px,calc(100vh-2rem))] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-teal-700 to-teal-600 px-4 py-3 text-white">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
                  <Bot className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">AI Order Assistant</h2>
                  <p className="text-xs text-teal-50">
                    Suggestions are reviewed in your cart before checkout.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full p-2 text-white/90 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
                aria-label="Close AI order assistant"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto bg-gray-50 px-4 py-4">
              {messages.map((message) => {
                const isAssistant = message.role === "assistant";
                return (
                  <div key={message.id} className={isAssistant ? "pr-6" : "pl-10"}>
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm shadow-sm ${
                        isAssistant
                          ? "rounded-tl-sm border border-gray-200 bg-white text-gray-800"
                          : "rounded-tr-sm bg-teal-700 text-white"
                      }`}
                    >
                      <p className="whitespace-pre-line leading-6">{message.content}</p>
                    </div>

                    {message.items && message.items.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {message.items.map((item) => (
                          <div
                            key={`${message.id}-${item.candidateId}`}
                            className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <Link
                                  href={productHref(item)}
                                  className="line-clamp-2 text-sm font-semibold text-gray-900 hover:text-teal-700"
                                  prefetch={false}
                                >
                                  {item.name}
                                </Link>
                                <p className="mt-1 text-xs text-gray-500">
                                  {item.sku ? `SKU: ${item.sku} · ` : ""}
                                  Qty {item.qty} · ${Number(item.price || 0).toFixed(2)}
                                </p>
                                {item.reason ? (
                                  <p className="mt-2 text-xs leading-5 text-gray-600">
                                    {item.reason}
                                  </p>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                onClick={() => addSuggestedItem(item)}
                                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-teal-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
                              >
                                <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
                                Add
                              </button>
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addAllSuggestedItems(message.items || [])}
                          className="w-full rounded-full border border-teal-700 px-3 py-2 text-xs font-semibold text-teal-800 transition hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
                        >
                          Add all suggestions to cart
                        </button>
                      </div>
                    ) : null}

                    {message.pages && message.pages.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {message.pages.map((page) => (
                          <div
                            key={`${message.id}-${page.href}`}
                            className="rounded-xl border border-teal-100 bg-white p-3 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900">{page.title}</p>
                                <p className="mt-1 text-xs leading-5 text-gray-600">
                                  {page.description}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => openPage(page.href)}
                                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-teal-700 px-3 py-2 text-xs font-semibold text-teal-800 transition hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
                              >
                                Open
                                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {message.questions && message.questions.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {message.questions.map((question) => (
                          <button
                            key={question}
                            type="button"
                            onClick={() => setInput(question)}
                            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 transition hover:border-teal-300 hover:text-teal-800"
                          >
                            {question}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {isLoading ? (
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-teal-700" aria-hidden />
                  Finding suitable products...
                </div>
              ) : null}
            </div>

            <div className="border-t border-gray-100 bg-white p-3">
              <div className="mb-3 grid grid-cols-2 gap-2">
                {quickOptions.map(({ label, action, Icon, prompt }) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => runQuickOption({ label, action, Icon, prompt })}
                    disabled={isLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {label}
                  </button>
                ))}
              </div>

              {messages.length <= 1 ? (
                <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                  {starterPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void submitPrompt(prompt)}
                      className="shrink-0 rounded-full bg-gray-100 px-3 py-1.5 text-xs text-gray-700 transition hover:bg-teal-50 hover:text-teal-800"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              ) : null}

              <form onSubmit={onSubmit} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <MessageCircle className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Ask for products, SKUs, or reorder help..."
                    className="w-full rounded-full border border-gray-200 py-3 pl-9 pr-4 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                    disabled={isLoading}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-teal-700 text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300"
                  aria-label="Send message"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Send className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </form>
              <p className="mt-2 text-center text-[11px] leading-4 text-gray-500">
                AI suggestions can be wrong. Prices, stock, shipping, and eligibility are confirmed
                at checkout.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
