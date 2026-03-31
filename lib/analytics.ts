/**
 * Analytics & Tracking Integration
 * Google Analytics 4, Meta Pixel, and custom event tracking
 */

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    fbq?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

// Google Analytics 4
export function initGA4(measurementId: string) {
  if (typeof window === 'undefined') return;

  // Load GA4 script
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);

  // Initialize dataLayer
  window.dataLayer = window.dataLayer || [];
  function gtag(...args: any[]) {
    window.dataLayer!.push(args);
  }
  window.gtag = gtag;

  gtag('js', new Date());
  gtag('config', measurementId);
}

// Meta Pixel
export function initMetaPixel(pixelId: string) {
  if (typeof window === 'undefined') return;

  // Load Meta Pixel script
  (function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
    if (f.fbq) return;
    n = f.fbq = function (...args: any[]) {
      n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = '2.0';
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode!.insertBefore(t, s);
  })(
    window,
    document,
    'script',
    'https://connect.facebook.net/en_US/fbevents.js'
  );

  (window as any).fbq = (window as any).fbq || function (...args: any[]) {
    ((window as any).fbq.q = (window as any).fbq.q || []).push(args);
  };

  (window as any).fbq('init', pixelId);
  (window as any).fbq('track', 'PageView');
}

// E-commerce Events

export function trackViewItem(product: {
  id: number;
  name: string;
  price: number;
  category?: string;
  sku?: string;
}) {
  if (typeof window === 'undefined') return;

  // GA4
  if (window.gtag) {
    window.gtag('event', 'view_item', {
      currency: 'AUD',
      value: product.price,
      items: [{
        item_id: product.id.toString(),
        item_name: product.name,
        price: product.price,
        item_category: product.category,
        item_sku: product.sku,
      }],
    });
  }

  // Meta Pixel
  if (window.fbq) {
    window.fbq('track', 'ViewContent', {
      content_name: product.name,
      content_ids: [product.id.toString()],
      content_type: 'product',
      value: product.price,
      currency: 'AUD',
    });
  }
}

export function trackAddToCart(item: {
  id: number;
  name: string;
  price: number;
  quantity: number;
  category?: string;
  sku?: string;
}) {
  if (typeof window === 'undefined') return;

  // GA4
  if (window.gtag) {
    window.gtag('event', 'add_to_cart', {
      currency: 'AUD',
      value: item.price * item.quantity,
      items: [{
        item_id: item.id.toString(),
        item_name: item.name,
        price: item.price,
        quantity: item.quantity,
        item_category: item.category,
        item_sku: item.sku,
      }],
    });
  }

  // Meta Pixel
  if (window.fbq) {
    window.fbq('track', 'AddToCart', {
      content_name: item.name,
      content_ids: [item.id.toString()],
      content_type: 'product',
      value: item.price * item.quantity,
      currency: 'AUD',
    });
  }
}

export function trackRemoveFromCart(item: {
  id: number;
  name: string;
  price: number;
  quantity: number;
}) {
  if (typeof window === 'undefined') return;

  // GA4
  if (window.gtag) {
    window.gtag('event', 'remove_from_cart', {
      currency: 'AUD',
      value: item.price * item.quantity,
      items: [{
        item_id: item.id.toString(),
        item_name: item.name,
        price: item.price,
        quantity: item.quantity,
      }],
    });
  }
}

export function trackBeginCheckout(items: Array<{
  id: number;
  name: string;
  price: number;
  quantity: number;
  category?: string;
}>, value: number) {
  if (typeof window === 'undefined') return;

  // GA4
  if (window.gtag) {
    window.gtag('event', 'begin_checkout', {
      currency: 'AUD',
      value,
      items: items.map(item => ({
        item_id: item.id.toString(),
        item_name: item.name,
        price: item.price,
        quantity: item.quantity,
        item_category: item.category,
      })),
    });
  }

  // Meta Pixel
  if (window.fbq) {
    window.fbq('track', 'InitiateCheckout', {
      content_ids: items.map(item => item.id.toString()),
      content_type: 'product',
      value,
      currency: 'AUD',
      num_items: items.reduce((sum, item) => sum + item.quantity, 0),
    });
  }
}

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
  if (typeof window === 'undefined') return;

  // GA4
  if (window.gtag) {
    window.gtag('event', 'purchase', {
      transaction_id: order.id.toString(),
      value: order.revenue,
      currency: 'AUD',
      tax: order.tax || 0,
      shipping: order.shipping || 0,
      coupon: order.coupon,
      items: order.items.map(item => ({
        item_id: item.id.toString(),
        item_name: item.name,
        price: item.price,
        quantity: item.quantity,
        item_category: item.category,
        item_sku: item.sku,
      })),
    });
  }

  // Meta Pixel
  if (window.fbq) {
    window.fbq('track', 'Purchase', {
      content_ids: order.items.map(item => item.id.toString()),
      content_type: 'product',
      value: order.revenue,
      currency: 'AUD',
      num_items: order.items.reduce((sum, item) => sum + item.quantity, 0),
    });
  }

  // Sync to WooCommerce analytics (if needed)
  // This would typically be done server-side via API
}

export function trackApplyCoupon(coupon: string, discount: number) {
  if (typeof window === 'undefined') return;

  // GA4
  if (window.gtag) {
    window.gtag('event', 'add_payment_info', {
      coupon,
      value: discount,
      currency: 'AUD',
    });
  }

  // Meta Pixel
  if (window.fbq) {
    window.fbq('track', 'AddPaymentInfo', {
      content_type: 'coupon',
      value: discount,
      currency: 'AUD',
    });
  }
}

