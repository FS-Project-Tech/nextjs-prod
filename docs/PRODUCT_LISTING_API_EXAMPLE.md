# Product Listing Page - API Fetch Example

This document provides examples of how to fetch products from the WooCommerce REST API.

## Component Structure

The product listing page consists of:
- **ProductsPageClient** (`components/ProductsPageClient.tsx`) - Main page component with filters sidebar
- **ProductGrid** (`components/ProductGrid.tsx`) - Displays products with infinite scroll
- **FilterSidebar** (`components/FilterSidebar.tsx`) - Category, price, and brand filters
- **ProductCard** (`components/ProductCard.tsx`) - Individual product card with "Add to Cart" button

## API Route

The products are fetched through the Next.js API route at `/api/products` which handles:
- Category filtering
- Brand filtering
- Price range filtering
- Rating filtering
- Availability filtering
- Sorting
- Pagination

## Direct WooCommerce REST API Example

If you want to fetch products directly from WooCommerce REST API (server-side only):

```typescript
import wcAPI from '@/lib/woocommerce';

// Fetch products with filters
async function fetchProductsWithFilters() {
  try {
    const response = await wcAPI.get('/products', {
      params: {
        per_page: 24,        // Products per page
        page: 1,             // Page number
        category: 15,        // Category ID (optional)
        orderby: 'price',    // Sort by: date, price, popularity, rating
        order: 'asc',        // Sort order: asc, desc
        search: 'keyword',   // Search query (optional)
        featured: 1,         // Featured products only (1 or 0)
        on_sale: 1,          // On sale products only (1 or 0)
        status: 'publish',   // Product status
      }
    });
    
    const products = response.data;
    return products;
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
}
```

## Using the Next.js API Route (Recommended)

The recommended approach is to use the Next.js API route which handles filtering and pagination:

```typescript
// Client-side fetch example
async function fetchFilteredProducts(filters: {
  categories?: string[];
  brands?: string[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  availability?: 'in_stock' | 'out_of_stock';
  sortBy?: string;
  page?: number;
  per_page?: number;
}) {
  const params = new URLSearchParams();
  
  if (filters.categories?.length) {
    params.set('categories', filters.categories.join(','));
  }
  if (filters.brands?.length) {
    params.set('brands', filters.brands.join(','));
  }
  if (filters.minPrice) {
    params.set('minPrice', String(filters.minPrice));
  }
  if (filters.maxPrice) {
    params.set('maxPrice', String(filters.maxPrice));
  }
  if (filters.minRating) {
    params.set('minRating', String(filters.minRating));
  }
  if (filters.availability) {
    params.set('availability', filters.availability);
  }
  if (filters.sortBy) {
    params.set('sortBy', filters.sortBy);
  }
  
  params.set('page', String(filters.page || 1));
  params.set('per_page', String(filters.per_page || 24));
  
  const response = await fetch(`/api/products?${params.toString()}`);
  const data = await response.json();
  
  return {
    products: data.products,
    totalPages: data.totalPages,
    page: data.page,
    total: data.total,
  };
}
```

## Example Usage in Component

```typescript
"use client";

import { useEffect, useState } from 'react';

export default function ProductListing() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function loadProducts() {
      setLoading(true);
      const data = await fetchFilteredProducts({
        categories: ['electronics'],
        brands: ['apple', 'samsung'],
        minPrice: 100,
        maxPrice: 1000,
        minRating: 4,
        sortBy: 'price_low',
        page: 1,
        per_page: 24,
      });
      setProducts(data.products);
      setLoading(false);
    }
    
    loadProducts();
  }, []);
  
  if (loading) return <div>Loading...</div>;
  
  return (
    <div>
      {products.map(product => (
        <div key={product.id}>
          <h3>{product.name}</h3>
          <p>${product.price}</p>
        </div>
      ))}
    </div>
  );
}
```

## Filter Parameters

### Categories
- **URL Param**: `categories`
- **Format**: Comma-separated category slugs
- **Example**: `?categories=electronics,computers`

### Brands
- **URL Param**: `brands`
- **Format**: Comma-separated brand slugs
- **Example**: `?brands=apple,samsung`

### Price Range
- **URL Params**: `minPrice`, `maxPrice`
- **Format**: Numbers
- **Example**: `?minPrice=100&maxPrice=500`

### Rating
- **URL Param**: `minRating`
- **Format**: Number (1-5)
- **Example**: `?minRating=4`

### Availability
- **URL Param**: `availability`
- **Values**: `in_stock`, `out_of_stock`
- **Example**: `?availability=in_stock`

### Sort
- **URL Param**: `sortBy`
- **Values**: `relevance`, `price_low`, `price_high`, `newest`, `rating`, `popularity`
- **Example**: `?sortBy=price_low`

## Pagination

The API supports pagination:
- **URL Params**: `page`, `per_page`
- **Example**: `?page=2&per_page=24`
- **Response**: Includes `totalPages`, `page`, and `total` in the response

## Response Format

```json
{
  "products": [
    {
      "id": 123,
      "name": "Product Name",
      "slug": "product-name",
      "price": "99.99",
      "regular_price": "129.99",
      "sale_price": "99.99",
      "on_sale": true,
      "images": [
        {
          "src": "https://example.com/image.jpg",
          "alt": "Product image"
        }
      ],
      "categories": [
        {
          "id": 15,
          "name": "Electronics",
          "slug": "electronics"
        }
      ],
      "stock_status": "instock",
      "average_rating": "4.5",
      "rating_count": 42
    }
  ],
  "totalPages": 5,
  "page": 1,
  "total": 120
}
```

