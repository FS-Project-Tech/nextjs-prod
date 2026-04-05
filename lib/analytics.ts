/**
 * Production-Grade Analytics & Tracking
 * Supports GA4 + Meta Pixel + Ecommerce Events
 */

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    fbq?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

// 🔥 CONFIG
const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || "INR";

function isBrowser() {
  return typeof window !== "undefined";
}

// ==============================
// GOOGLE ANALYTICS 4
// ==============================
/**
 * Fallback if GA was not bootstrapped via `next/script` in layout (e.g. older deployments).
 */
export function initGA4(measurementId: string) {
  if (typeof window === "undefined") return;

  if (window.gtag) return;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  function gtag(...args: any[]) {
    window.dataLayer!.push(args);
  }

  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", measurementId, {
    send_page_view: false,
  });
}

/** SPA / client navigations — layout uses send_page_view: false so this is the source of truth. */
export function trackPageView(pagePath: string) {
  if (!isBrowser()) return;
  const gaId = process.env.NEXT_PUBLIC_GA4_ID?.trim();
  if (!gaId || !window.gtag) return;
  try {
    window.gtag("config", gaId, { page_path: pagePath });
  } catch (err) {
    console.error("trackPageView error", err);
  }
}

// ==============================
// META PIXEL
// ==============================
export function initMetaPixel(pixelId: string) {
  if (typeof window === "undefined") return;

  // جلوگیری duplicate load
  if (window.fbq) return;

  (function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
    if (f.fbq) return;
    n = f.fbq = function (...args: any[]) {
      n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = true;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode!.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

  window.fbq("init", pixelId);
  window.fbq("track", "PageView");

  console.log("✅ Meta Pixel Initialized");
}

// ==============================
// EVENTS
// ==============================

export function trackViewItem(product: {
  id: number;
  name: string;
  price: number;
  category?: string;
  sku?: string;
}) {
  if (!isBrowser()) return;

  try {
    window.gtag?.("event", "view_item", {
      currency: CURRENCY,
      value: product.price,
      items: [
        {
          item_id: product.id.toString(),
          item_name: product.name,
          price: product.price,
          item_category: product.category,
          item_sku: product.sku,
        },
      ],
    });

    window.fbq?.("track", "ViewContent", {
      content_name: product.name,
      content_ids: [product.id.toString()],
      content_type: "product",
      value: product.price,
      currency: CURRENCY,
    });
  } catch (err) {
    console.error("trackViewItem error", err);
  }
}

// ------------------------------

export function trackAddToCart(item: {
  id: number;
  name: string;
  price: number;
  quantity: number;
  category?: string;
  sku?: string;
}) {
  if (!isBrowser()) return;

  const value = item.price * item.quantity;

  try {
    window.gtag?.("event", "add_to_cart", {
      currency: CURRENCY,
      value,
      items: [
        {
          item_id: item.id.toString(),
          item_name: item.name,
          price: item.price,
          quantity: item.quantity,
          item_category: item.category,
          item_sku: item.sku,
        },
      ],
    });

    window.fbq?.("track", "AddToCart", {
      content_name: item.name,
      content_ids: [item.id.toString()],
      content_type: "product",
      value,
      currency: CURRENCY,
    });
  } catch (err) {
    console.error("trackAddToCart error", err);
  }
}

// ------------------------------

export function trackRemoveFromCart(item: {
  id: number;
  name: string;
  price: number;
  quantity: number;
}) {
  if (!isBrowser()) return;

  const value = item.price * item.quantity;

  try {
    window.gtag?.("event", "remove_from_cart", {
      currency: CURRENCY,
      value,
      items: [
        {
          item_id: item.id.toString(),
          item_name: item.name,
          price: item.price,
          quantity: item.quantity,
        },
      ],
    });
  } catch (err) {
    console.error("trackRemoveFromCart error", err);
  }
}

// ------------------------------

export function trackBeginCheckout(
  items: Array<{
    id: number;
    name: string;
    price: number;
    quantity: number;
    category?: string;
  }>,
  value: number
) {
  if (!isBrowser()) return;

  try {
    window.gtag?.("event", "begin_checkout", {
      currency: CURRENCY,
      value,
      items: items.map((item) => ({
        item_id: item.id.toString(),
        item_name: item.name,
        price: item.price,
        quantity: item.quantity,
        item_category: item.category,
      })),
    });

    window.fbq?.("track", "InitiateCheckout", {
      content_ids: items.map((item) => item.id.toString()),
      content_type: "product",
      value,
      currency: CURRENCY,
      num_items: items.reduce((sum, item) => sum + item.quantity, 0),
    });
  } catch (err) {
    console.error("trackBeginCheckout error", err);
  }
}

// ------------------------------

export function trackPurchase(order: {
  id: string | number;
  revenue: number;
  tax?: number;
  shipping?: number;
  items: Array<{
    id: number;
    name: string;
    price: number;
    quantity: number;
    category?: string;
    sku?: string;
  }>;
  coupon?: string;
}) {
  if (!isBrowser()) return;

  try {
    window.gtag?.("event", "purchase", {
      transaction_id: order.id.toString(),
      value: order.revenue,
      currency: CURRENCY,
      tax: order.tax || 0,
      shipping: order.shipping || 0,
      coupon: order.coupon,
      items: order.items.map((item) => ({
        item_id: item.id.toString(),
        item_name: item.name,
        price: item.price,
        quantity: item.quantity,
        item_category: item.category,
        item_sku: item.sku,
      })),
    });

    window.fbq?.("track", "Purchase", {
      content_ids: order.items.map((item) => item.id.toString()),
      content_type: "product",
      value: order.revenue,
      currency: CURRENCY,
      num_items: order.items.reduce((sum, item) => sum + item.quantity, 0),
    });
  } catch (err) {
    console.error("trackPurchase error", err);
  }
}

// ------------------------------

export function trackApplyCoupon(coupon: string, discount: number) {
  if (!isBrowser()) return;

  try {
    window.gtag?.("event", "add_payment_info", {
      coupon,
      value: discount,
      currency: CURRENCY,
    });

    window.fbq?.("track", "AddPaymentInfo", {
      content_type: "coupon",
      value: discount,
      currency: CURRENCY,
    });
  } catch (err) {
    console.error("trackApplyCoupon error", err);
  }
}