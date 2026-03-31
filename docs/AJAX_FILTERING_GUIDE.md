# AJAX Product Filtering System

This document explains how the AJAX product filtering system works in the WooCommerce headless store.

## Overview

The filtering system provides a smooth, no-reload experience when users apply filters. Products update dynamically via AJAX while maintaining shareable URLs with filter parameters.

## Architecture

### Components

1. **FilterSidebar** (`components/FilterSidebar.tsx`)
   - Handles all filter UI (category, price, brand, rating, availability, sort)
   - Updates URL parameters without page reload
   - Maintains filter state in URL for shareability

2. **ProductGrid** (`components/ProductGrid.tsx`)
   - Displays products in a responsive grid
   - Watches URL changes and fetches products via AJAX
   - Handles pagination and infinite scroll
   - Shows loading states during filter changes

3. **ProductsPageClient** (`components/ProductsPageClient.tsx`)
   - Main shop page (`/shop`)
   - Combines FilterSidebar and ProductGrid

4. **CategoryPageClient** (`components/CategoryPageClient.tsx`)
   - Category pages (`/product-category/{slug}`)
   - Uses same filtering system with category context

## How It Works

### 1. Filter Interaction Flow

```
User clicks filter → FilterSidebar updates URL → ProductGrid detects change → AJAX fetch → Update products
```

1. User interacts with a filter (checkbox, slider, etc.)
2. `FilterSidebar` calls `updateFilters()` which uses `router.replace()` with `scroll: false`
3. URL parameters are updated (e.g., `?categories=electronics&brands=apple&minPrice=100`)
4. `ProductGrid` detects URL change via polling (200ms interval) and `popstate` listener
5. `ProductGrid` fetches new products via `/api/products` endpoint
6. Products update smoothly with fade animation

### 2. URL Parameter Management

All filters are stored in URL query parameters:

- `categories` - Comma-separated category slugs
- `brands` - Comma-separated brand slugs
- `minPrice` - Minimum price
- `maxPrice` - Maximum price
- `minRating` - Minimum rating (1-5)
- `availability` - `in_stock` or `out_of_stock`
- `sortBy` - Sort option (relevance, price_low, price_high, newest, rating, popularity)
- `search` - Search query
- `page` - Current page number

**Example URL:**
```
/shop?categories=electronics,computers&brands=apple&minPrice=100&maxPrice=1000&sortBy=price_low
```

### 3. AJAX Request Flow

```typescript
// ProductGrid watches for URL changes
useEffect(() => {
  const checkUrlChange = () => {
    const currentUrl = window.location.search;
    if (currentUrl !== lastUrlRef.current) {
      // Cancel any pending requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Clear products for smooth transition
      setProducts([]);
      
      // Fetch new products
      fetchProducts(1, false);
    }
  };
  
  // Check every 200ms for URL changes
  const interval = setInterval(checkUrlChange, 200);
  
  return () => clearInterval(interval);
}, []);
```

### 4. Request Cancellation

When filters change quickly, pending requests are cancelled using `AbortController`:

```typescript
const controller = new AbortController();
const res = await fetch(`/api/products?${params}`, {
  signal: controller.signal,
  cache: 'no-store',
});
```

This prevents:
- Race conditions
- Stale data
- Unnecessary network requests

## Features

### ✅ Smooth Updates
- No page reload
- Fade animations between filter changes
- Loading overlays during updates

### ✅ Shareable URLs
- All filters in URL parameters
- Browser back/forward works
- Direct links to filtered views work

### ✅ Performance
- Request cancellation on rapid filter changes
- Debounced URL checking (200ms)
- Efficient state management

### ✅ User Experience
- Loading skeletons on initial load
- Smooth overlays during filter changes
- Clear feedback on active filters
- Product count display

## Supported Pages

### `/shop`
Main shop page with all products and filters.

### `/product-category/{slug}`
Category-specific pages that:
- Pre-filter by category
- Show category name
- Support additional filters on top of category

## API Endpoint

### `GET /api/products`

**Query Parameters:**
- `categorySlug` - Single category slug (for category pages)
- `categories` - Comma-separated category slugs
- `brands` - Comma-separated brand slugs
- `minPrice` - Minimum price
- `maxPrice` - Maximum price
- `minRating` - Minimum rating
- `availability` - Stock status
- `sortBy` - Sort option
- `search` - Search query
- `page` - Page number
- `per_page` - Products per page (default: 24)

**Response:**
```json
{
  "products": [...],
  "totalPages": 5,
  "page": 1,
  "total": 120
}
```

## Styling

The system uses:
- **Tailwind CSS** for styling
- **Framer Motion** for animations
- **Responsive grid** (1-5 columns based on screen size)
- **Modern eCommerce** design (Amazon/Myntra style)

### Grid Breakpoints
- Mobile: 1 column
- Small: 2 columns
- Medium: 3 columns
- Large: 4 columns
- XL: 5 columns

## Browser Compatibility

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Requires JavaScript enabled
- Works with browser extensions (handles attribute mismatches)

## Performance Considerations

1. **Request Cancellation**: Prevents unnecessary requests
2. **URL Polling**: 200ms interval balances responsiveness and performance
3. **State Management**: Efficient React state updates
4. **Caching**: Uses `cache: 'no-store'` for fresh data
5. **AbortController**: Cancels stale requests

## Troubleshooting

### Filters not updating
- Check browser console for errors
- Verify API endpoint is accessible
- Check network tab for failed requests

### URL parameters not working
- Ensure `router.replace()` is being called
- Check that `scroll: false` is set
- Verify URL polling is active

### Slow filter updates
- Check API response time
- Verify network connection
- Check for too many concurrent requests

## Future Enhancements

- [ ] Debounce filter changes for better performance
- [ ] Add filter presets/saved filters
- [ ] Implement filter history
- [ ] Add filter animation improvements
- [ ] Optimize for very large product catalogs

