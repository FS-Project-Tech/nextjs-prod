# Thank You Page - SSR Data Fetching Notes

## Current Implementation

The thank-you page currently uses **client-side data fetching** with `useEffect` and `fetch`. This is suitable for:
- Dynamic order IDs from query parameters
- User-specific order data
- Real-time updates

## Server-Side Rendering (SSR) Alternative

For better SEO and initial load performance, you can use Next.js App Router server components with SSR.

### Option 1: Server Component with Props (Recommended for SSR)

```typescript
// app/checkout/thank-you/page.tsx
import { Suspense } from "react";
import ThankYouServer from "./ThankYouServer";

export default async function ThankYouPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>;
}) {
  const params = await searchParams;
  const orderId = params.order_id;

  if (!orderId) {
    return (
      <div className="min-h-screen bg-gray-50 py-10">
        <div className="mx-auto w-[85vw] px-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-6">
            <h1 className="text-xl font-semibold text-red-900">Error</h1>
            <p className="text-red-700">No order ID provided</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<ThankYouSkeleton />}>
      <ThankYouServer orderId={orderId} />
    </Suspense>
  );
}

function ThankYouSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 py-10 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
        <p className="mt-4 text-gray-600">Loading...</p>
      </div>
    </div>
  );
}
```

```typescript
// app/checkout/thank-you/ThankYouServer.tsx
import { fetchOrderDetails } from "@/lib/orders";
import ThankYouClient from "./ThankYouClient";

export default async function ThankYouServer({ orderId }: { orderId: string }) {
  try {
    // Fetch order on server
    const order = await fetchOrderDetails(orderId);

    if (!order) {
      return (
        <div className="min-h-screen bg-gray-50 py-10">
          <div className="mx-auto w-[85vw] px-4">
            <div className="rounded-lg border border-red-200 bg-red-50 p-6">
              <h1 className="text-xl font-semibold text-red-900">Error</h1>
              <p className="text-red-700">Order not found</p>
            </div>
          </div>
        </div>
      );
    }

    // Pass data to client component
    return <ThankYouClient order={order} />;
  } catch (error: any) {
    return (
      <div className="min-h-screen bg-gray-50 py-10">
        <div className="mx-auto w-[85vw] px-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-6">
            <h1 className="text-xl font-semibold text-red-900">Error</h1>
            <p className="text-red-700">{error.message || "Failed to load order"}</p>
          </div>
        </div>
      </div>
    );
  }
}
```

```typescript
// lib/orders.ts
import wcAPI from "@/lib/woocommerce";

export async function fetchOrderDetails(orderId: string) {
  try {
    const { data } = await wcAPI.get(`/orders/${orderId}`);
    return data;
  } catch (error: any) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}
```

### Option 2: Hybrid Approach (Current + SSR)

Use SSR for initial load, then client-side for updates:

```typescript
// app/checkout/thank-you/page.tsx
import ThankYouPageClient from "./ThankYouPageClient";

export default async function ThankYouPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>;
}) {
  const params = await searchParams;
  const orderId = params.order_id;

  // Fetch order on server for initial render
  let initialOrder = null;
  if (orderId) {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/orders/${orderId}`,
        { cache: "no-store" }
      );
      if (response.ok) {
        const data = await response.json();
        initialOrder = data.order;
      }
    } catch (error) {
      console.error("Failed to fetch order on server:", error);
    }
  }

  return <ThankYouPageClient orderId={orderId} initialOrder={initialOrder} />;
}
```

## Why Client-Side is Better Here

For the thank-you page, **client-side fetching is actually preferred** because:

1. **Query Parameters**: Order ID comes from URL query params (`?order_id=123`)
2. **User-Specific**: Orders are user-specific and may require authentication
3. **Real-time**: Order status may change after page load
4. **Cart Clearing**: Client-side cart clearing happens after successful order
5. **No SEO Need**: Thank-you pages don't need SEO (they're post-purchase)

## Current Implementation Benefits

✅ **Fast Initial Load** - No server-side API call blocking render  
✅ **Dynamic Updates** - Can refresh order status without page reload  
✅ **Error Handling** - Client-side error states are more flexible  
✅ **User Experience** - Loading states and transitions work better client-side  

## When to Use SSR

Use SSR for thank-you pages if:
- You need SEO (unlikely for post-purchase pages)
- Order data is public (not user-specific)
- You want to reduce client-side JavaScript
- Initial load performance is critical

## Summary

**Current Implementation**: Client-side fetching with `useEffect`  
**Best For**: Dynamic, user-specific order confirmation pages  
**Alternative**: SSR with server components (see examples above)  
**Recommendation**: Keep current client-side approach for flexibility

