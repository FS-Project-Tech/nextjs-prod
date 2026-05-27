"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import Image from "next/image";
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
  | "order_tracking"
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
  inStock?: boolean;
  categorySlug?: string;
  categoryName?: string;
  brandSlug?: string;
  brandName?: string;
  qty: number;
  reason: string;
};

type ChatEntry = {
  id: string;
  role: ChatRole;
  content: string;
  items?: AssistantItem[];
  relatedItems?: AssistantItem[];
  questions?: string[];
  pages?: PageSuggestion[];
  tracking?: OrderTrackingSummary;
};

type AssistantResponse = {
  success?: boolean;
  reply?: string;
  items?: AssistantItem[];
  relatedItems?: AssistantItem[];
  questions?: string[];
  pages?: PageSuggestion[];
  tracking?: OrderTrackingSummary;
  error?: string;
};

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

type QuickOption = {
  label: string;
  action: AssistantAction;
  prompt: string;
  Icon: typeof Sparkles;
};

const starterPrompts = [
  "I am looking for gloves and wipes",
  "Track order #12345",
  "Help me find continence products",
  "Show dressings and tape for wound care",
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
    label: "Track order",
    action: "order_tracking",
    prompt: "Track my order",
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

const PRODUCT_IMAGE_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='320' viewBox='0 0 320 320'%3E%3Crect fill='%23f8fafc' width='320' height='320'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-family='Arial,sans-serif' font-size='16'%3ENo image%3C/text%3E%3C/svg%3E";

function priceLabel(price: string): string {
  const n = Number(price || 0);
  return Number.isFinite(n) && n > 0 ? `$${n.toFixed(2)}` : "Price on product page";
}

type ProductAttributeEntry = {
  key: string;
  label: string;
  value: string;
  isPackaging: boolean;
};

function prettyAttributeLabel(key: string): string {
  const normalized = key.trim().toLowerCase();
  if (/(^|[-_])(pkt|pack|package|packaging|box|ctn|carton|each|unit)([-_]|$)/.test(normalized)) {
    return "Packaging";
  }
  return key
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isPackagingAttribute(key: string, value: string): boolean {
  const normalizedKey = key.trim().toLowerCase();
  const normalizedValue = value.trim().toLowerCase();
  if (normalizedKey === "size") return false;
  return (
    /(^|[-_])(pkt|pack|package|packaging|box|ctn|carton|each|unit)([-_]|$)/.test(normalizedKey) ||
    /\b(pack|box|ctn|carton|each|unit|pair|pcs|pieces)\b/.test(normalizedValue)
  );
}

function attributeEntries(item: AssistantItem): ProductAttributeEntry[] {
  return Object.entries(item.attributes ?? {})
    .map(([key, value]) => {
      const cleanValue = String(value || "").trim();
      return {
        key,
        label: prettyAttributeLabel(key),
        value: cleanValue,
        isPackaging: isPackagingAttribute(key, cleanValue),
      };
    })
    .filter((entry) => Boolean(entry.label && entry.value));
}

function packagingValue(item: AssistantItem): string {
  return attributeEntries(item).find((entry) => entry.isPackaging)?.value || "";
}

function normalizeOption(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function packagingOptionsForItem(item: AssistantItem, relatedItems: AssistantItem[]) {
  const sameProductItems = relatedItems.filter(
    (candidate) => candidate.productId === item.productId || candidate.slug === item.slug
  );
  const options = [
    item,
    ...sameProductItems.filter((candidate) => candidate.candidateId !== item.candidateId),
  ];
  const seen = new Set<string>();

  return options
    .map((candidate) => ({
      candidate,
      label: packagingValue(candidate) || "Default packaging",
    }))
    .filter((option) => {
      const key = normalizeOption(option.label);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function ProductResultCard({
  item,
  relatedItems,
  onAdd,
}: {
  item: AssistantItem;
  relatedItems: AssistantItem[];
  onAdd: (item: AssistantItem) => void;
}) {
  const packagingOptions = packagingOptionsForItem(item, relatedItems);
  const [selectedCandidateId, setSelectedCandidateId] = useState(item.candidateId);
  const [qty, setQty] = useState(Math.max(1, item.qty || 1));
  const activeItem =
    packagingOptions.find((option) => option.candidate.candidateId === selectedCandidateId)
      ?.candidate || item;
  const [imageError, setImageError] = useState(false);
  const imageSrc =
    !imageError && activeItem.imageUrl ? activeItem.imageUrl : PRODUCT_IMAGE_PLACEHOLDER;
  const attrs = attributeEntries(activeItem).filter((entry) => !entry.isPackaging);
  const selectedPackaging = packagingValue(activeItem) || "Default packaging";

  const handleQtyChange = (value: string) => {
    const nextQty = Number.parseInt(value, 10);
    if (!Number.isFinite(nextQty)) {
      setQty(1);
      return;
    }
    setQty(Math.min(999, Math.max(1, nextQty)));
  };

  return (
    <article className="overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white shadow-sm transition hover:border-teal-200 hover:shadow-md">
      <div className="grid gap-4 p-4 sm:grid-cols-[150px_1fr]">
        <Link
          href={productHref(activeItem)}
          prefetch={false}
          className="relative block aspect-square overflow-hidden rounded-2xl bg-gray-50"
        >
          <Image
            src={imageSrc}
            alt={activeItem.name}
            fill
            sizes="(max-width: 640px) 45vw, 150px"
            className="object-contain p-3"
            onError={() => setImageError(true)}
          />
        </Link>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            {activeItem.brandName ? (
              <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700">
                {activeItem.brandName}
              </span>
            ) : null}
            {activeItem.categoryName ? (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                {activeItem.categoryName}
              </span>
            ) : null}
            {activeItem.inStock === false ? (
              <span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700">
                Out of stock
              </span>
            ) : (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-700">
                In stock
              </span>
            )}
          </div>

          <Link
            href={productHref(activeItem)}
            className="mt-3 block text-base font-semibold leading-6 text-gray-950 hover:text-teal-700"
            prefetch={false}
          >
            {activeItem.name}
          </Link>

          {activeItem.reason ? (
            <p className="mt-2 text-sm leading-6 text-gray-600">{activeItem.reason}</p>
          ) : null}

          <div className="mt-4 grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
            <div>
              <span className="text-gray-500">Price: </span>
              <span className="font-semibold text-gray-950">{priceLabel(activeItem.price)}</span>
            </div>
            <div>
              <span className="text-gray-500">SKU: </span>
              <span className="font-medium text-gray-950">{activeItem.sku || "N/A"}</span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Packaging
              </span>
              <select
                value={selectedCandidateId}
                onChange={(event) => {
                  setSelectedCandidateId(event.target.value);
                  setImageError(false);
                }}
                className="w-full rounded-full border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                disabled={packagingOptions.length <= 1}
              >
                {packagingOptions.map((option) => (
                  <option key={option.candidate.candidateId} value={option.candidate.candidateId}>
                    {option.label}
                  </option>
                ))}
              </select>
              {packagingOptions.length <= 1 ? (
                <span className="mt-1 block text-xs text-gray-500">{selectedPackaging}</span>
              ) : null}
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Qty
              </span>
              <input
                type="number"
                min={1}
                max={999}
                value={qty}
                onChange={(event) => handleQtyChange(event.target.value)}
                className="w-full rounded-full border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </label>
          </div>

          {attrs.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {attrs.map(({ key, label, value }) => (
                <span
                  key={`${key}-${value}`}
                  className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700"
                >
                  {label}: {value}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onAdd({ ...activeItem, qty })}
              className="inline-flex items-center gap-2 rounded-full bg-gray-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
            >
              <ShoppingCart className="h-4 w-4" aria-hidden />
              Add to cart
            </button>
            <Link
              href={productHref(activeItem)}
              prefetch={false}
              className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
            >
              View product
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function formatDateLabel(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function OrderTrackingCard({ tracking }: { tracking: OrderTrackingSummary }) {
  return (
    <article className="rounded-[1.75rem] border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
            Order tracking
          </p>
          <h3 className="mt-2 text-xl font-semibold text-gray-950">
            Order #{tracking.orderNumber}
          </h3>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
          {tracking.statusLabel}
        </span>
      </div>

      <div className="mt-5 grid gap-3 text-sm text-gray-700 sm:grid-cols-2 lg:grid-cols-4">
        {tracking.dateCreated ? (
          <div className="rounded-2xl bg-gray-50 p-3">
            <span className="block text-xs font-medium text-gray-500">Placed</span>
            <span className="mt-1 block font-semibold text-gray-950">
              {formatDateLabel(tracking.dateCreated)}
            </span>
          </div>
        ) : null}
        {tracking.dateModified ? (
          <div className="rounded-2xl bg-gray-50 p-3">
            <span className="block text-xs font-medium text-gray-500">Last updated</span>
            <span className="mt-1 block font-semibold text-gray-950">
              {formatDateLabel(tracking.dateModified)}
            </span>
          </div>
        ) : null}
        {tracking.itemCount != null ? (
          <div className="rounded-2xl bg-gray-50 p-3">
            <span className="block text-xs font-medium text-gray-500">Items</span>
            <span className="mt-1 block font-semibold text-gray-950">{tracking.itemCount}</span>
          </div>
        ) : null}
        {tracking.total ? (
          <div className="rounded-2xl bg-gray-50 p-3">
            <span className="block text-xs font-medium text-gray-500">Order total</span>
            <span className="mt-1 block font-semibold text-gray-950">
              {tracking.currency || "AUD"} {tracking.total}
            </span>
          </div>
        ) : null}
      </div>

      {tracking.paymentMethod ? (
        <p className="mt-4 text-sm text-gray-600">Payment method: {tracking.paymentMethod}</p>
      ) : null}

      {tracking.trackingUrl ? (
        <Link
          href={tracking.trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-gray-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          Open carrier tracking
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      ) : (
        <p className="mt-5 rounded-2xl bg-blue-50 p-3 text-sm leading-6 text-blue-800">
          Carrier tracking is not available yet. If your order has just been placed, tracking may
          appear once dispatch is booked.
        </p>
      )}
    </article>
  );
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
        "Hi, I can help you find products, compare options, show related items, or track an order. What would you like to do?",
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
    setIsOpen(false);
    open();
    toast.success(`Added ${item.name} to cart`);
  };

  const openPage = (href: string) => {
    if (/^https?:\/\//i.test(href)) {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }
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
          relatedItems: data.relatedItems || [],
          questions: data.questions || [],
          pages: data.pages || [],
          tracking: data.tracking,
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
    const shouldAppendContext =
      context &&
      option.action !== "top_selling" &&
      option.action !== "on_sale" &&
      option.action !== "order_tracking";
    const prompt = shouldAppendContext ? `${option.prompt}: ${context}` : option.prompt;
    void submitPrompt(prompt, option.action);
  };

  return (
    <>
      {/* <button
        type="button"
        onClick={openAssistant}
        className="fixed bottom-24 left-4 z-[80] inline-flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-2xl shadow-gray-900/15 transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-teal-900/20 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 md:bottom-5 md:left-5"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="Open AI shopping assistant"
      >
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-emerald-500 text-white shadow-md">
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <span className="text-left leading-tight">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
            Joya Assistant
          </span>
          <span className="block">What are you looking for?</span>
        </span>
      </button> */}

      {isOpen ? (
        <div
          className="fixed inset-0 z-[200] bg-[#f8fbff]"
          role="dialog"
          aria-modal="true"
          aria-label="AI shopping assistant"
        >
          <div className="flex h-dvh flex-col overflow-hidden">
            <header className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white/85 px-4 py-3 backdrop-blur md:px-8">
              <button
                type="button"
                onClick={() => inputRef.current?.focus()}
                className="inline-flex items-center gap-3 rounded-full px-1 py-1 text-left"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-emerald-500 text-white shadow-sm">
                  <Sparkles className="h-5 w-5" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-gray-950">Joya Assistance</span>
                  <span className="block text-xs text-gray-500">
                    Product answers with catalogue links
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
                aria-label="Close AI shopping assistant"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </header>

            <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
              <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
                {messages.length <= 1 ? (
                  <section className="pt-4 text-center md:pt-12">
                    <div className="mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-emerald-500 text-white shadow-lg">
                      <Bot className="h-7 w-7" aria-hidden />
                    </div>
                    <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600">
                      Joya AI Mode
                    </p>
                    <h2 className="mt-3 text-3xl font-semibold tracking-tight text-gray-950 md:text-5xl">
                      What are you looking for?
                    </h2>
                    <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-gray-600">
                      Ask for a product, SKU, category, brand, care need, or order number. I can
                      search the catalogue, show related products, and help track orders.
                    </p>
                  </section>
                ) : null}

                {messages.map((message) => {
                  const isAssistant = message.role === "assistant";

                  return (
                    <section key={message.id} className="space-y-4">
                      <div className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
                        <div
                          className={`max-w-3xl rounded-[1.5rem] px-5 py-4 text-sm shadow-sm md:text-base ${
                            isAssistant
                              ? "border border-gray-200 bg-white text-gray-800"
                              : "bg-gray-950 text-white"
                          }`}
                        >
                          <p className="whitespace-pre-line leading-7">{message.content}</p>
                        </div>
                      </div>

                      {message.tracking ? <OrderTrackingCard tracking={message.tracking} /> : null}

                      {message.items && message.items.length > 0 ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-lg font-semibold text-gray-950">Product results</h3>
                          </div>
                          <div className="grid gap-4">
                            {message.items.map((item) => (
                              <ProductResultCard
                                key={`${message.id}-${item.candidateId}`}
                                item={item}
                                relatedItems={message.items || []}
                                onAdd={addSuggestedItem}
                              />
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {message.relatedItems && message.relatedItems.length > 0 ? (
                        <div className="space-y-4">
                          <div>
                            <h3 className="text-lg font-semibold text-gray-950">
                              Frequently bought or related products
                            </h3>
                            <p className="mt-1 text-sm text-gray-600">
                              These are popular related items from similar categories or brands.
                            </p>
                          </div>
                          <div className="grid gap-4">
                            {message.relatedItems.map((item) => (
                              <ProductResultCard
                                key={`${message.id}-related-${item.candidateId}`}
                                item={item}
                                relatedItems={message.relatedItems || []}
                                onAdd={addSuggestedItem}
                              />
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {message.pages && message.pages.length > 0 ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {message.pages.map((page) => (
                            <button
                              key={`${message.id}-${page.href}`}
                              type="button"
                              onClick={() => openPage(page.href)}
                              className="rounded-[1.5rem] border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-teal-200 hover:shadow-md"
                            >
                              <span className="text-sm font-semibold text-gray-950">
                                {page.title}
                              </span>
                              <span className="mt-1 block text-sm leading-6 text-gray-600">
                                {page.description}
                              </span>
                              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-teal-700">
                                Open link
                                <ArrowRight className="h-4 w-4" aria-hidden />
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {message.questions && message.questions.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {message.questions.map((question) => (
                            <button
                              key={question}
                              type="button"
                              onClick={() => setInput(question)}
                              className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700"
                            >
                              {question}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </section>
                  );
                })}

                {isLoading ? (
                  <div className="flex max-w-3xl items-center gap-3 rounded-[1.5rem] border border-gray-200 bg-white px-5 py-4 text-sm text-gray-600 shadow-sm">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-600" aria-hidden />
                    Searching catalogue and building product links...
                  </div>
                ) : null}
              </div>
            </main>

            <footer className="shrink-0 border-t border-gray-200 bg-white/90 px-4 py-4 backdrop-blur md:px-8">
              <div className="mx-auto w-full max-w-5xl">
                <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                  {quickOptions.map(({ label, action, Icon, prompt }) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => runQuickOption({ label, action, Icon, prompt })}
                      disabled={isLoading}
                      className="inline-flex shrink-0 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Icon className="h-4 w-4" aria-hidden />
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
                        className="shrink-0 rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-700 transition hover:bg-blue-50 hover:text-blue-700"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                ) : null}

                <form
                  onSubmit={onSubmit}
                  className="flex items-center gap-2 rounded-[2rem] border border-gray-200 bg-white p-2 shadow-lg shadow-gray-900/10 focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-100"
                >
                  <div className="relative flex-1">
                    <MessageCircle className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                    <input
                      ref={inputRef}
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      placeholder="Ask for a product, related items, or track order #..."
                      className="w-full rounded-full border-0 bg-transparent py-3 pl-11 pr-4 text-base text-gray-950 outline-none placeholder:text-gray-400"
                      disabled={isLoading}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading || !input.trim()}
                    className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-950 text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300"
                    aria-label="Send message"
                  >
                    {isLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    ) : (
                      <Send className="h-5 w-5" aria-hidden />
                    )}
                  </button>
                </form>

                <p className="mt-2 text-center text-[11px] leading-4 text-gray-500">
                  AI answers can be wrong. Check product pages and checkout for final prices, stock,
                  shipping, and eligibility.
                </p>
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
