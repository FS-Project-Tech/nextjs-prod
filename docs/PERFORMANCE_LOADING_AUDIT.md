# Performance & Loading Audit

This document summarizes causes of slow loading across the site and the fixes applied or recommended.

---

## 1. Category-specific brands (sidebar)

**Issue:** Opening a category (e.g. Airway Management) triggered many sequential API calls to build the brand list, so the Brand section stayed on "Loading..." for a long time.

**Root cause:** `fetchBrandsForCategorySlug` in the former `/api/filters/brands` route was doing:
- Up to **20** WooCommerce product pages (2,000 products) to extract brands from product data (which often doesn’t include `product_brand`).
- Then, if empty, up to **10** WordPress requests for brand terms and up to **15** WP product pages.

**Fixes applied:**
- **Try WordPress path first** when a category is set (your store uses `product_brand` taxonomy). So we do: 1× brand term map (1–2 pages) + up to **3** WP product pages. If that returns brands, we’re done.
- **Fallback to WooCommerce** limited to **3** product pages (300 products) instead of 20.
- **Brand term map** limited to **2** pages (200 terms) instead of 10.

**Result:** Category brands load in a few requests instead of dozens, so "Loading..." is much shorter and the Brand list appears quickly.

---

## 2. Categories API (subcategories in sidebar)

**Issue:** First expand of a Department category showed "Loading..." for a long time.

**Fixes applied:**
- **Prefetch on hover:** In `FilterSidebar`, hovering a main category triggers a background fetch of its subcategories so they’re often ready when the user clicks.
- **Server-side caching:** `/api/filters/categories?category={slug}` is cached (TTL: 10 min). Repeat requests (same category or after prefetch) are fast.
- **Loading state:** "Loading..." is shown until the request finishes (or fails), so we don’t show "No subcategories" before the response.

---

## 3. Category nav (header)

**Current behavior:** `CategoriesNav` runs on every page and calls WooCommerce twice:
1. `fetchCategories({ per_page: 7, parent: 0 })` – top-level.
2. `fetchCategories({ per_page: 100, hide_empty: false })` – all categories for dropdowns.

**Recommendation:** Use the cached categories API so only the first request hits WooCommerce:
- Option A: In `CategoriesNav`, call `/api/categories?per_page=7&parent=0&hide_empty=true` and `/api/categories?per_page=100&hide_empty=false` (with your site’s base URL for server-side fetch). Responses are cached, so later page loads are fast.
- Option B: Add a small `getCategoriesForNav()` in `lib/` that uses the same `cached()` + `fetchCategories` as `/api/categories`, and use it from `CategoriesNav` so nav benefits from in-process cache without an extra HTTP hop.

**Already in place:** `CategoriesNav` is wrapped in `<Suspense>` with a simple fallback, so the rest of the layout can render while categories load.

---

## 4. Product page

**Current behavior:** Product page uses `Promise.all` for promotions, variations, category products, and reviews, which is good. Metadata uses `fetchProductSEO` (WordPress) separately.

**Recommendation:** Keep as is. If you need to squeeze more, consider:
- Shorter `revalidate` for product pages (e.g. 300 → 120) for fresher but still cached data.
- Ensuring WooCommerce and WordPress have reasonable timeouts (e.g. 15–20 s) so slow backends don’t hang the page.

---

## 5. Home page

**Current behavior:** Sections (e.g. `RecommendedSection`, `CategoriesSection`, `ProductSection`) are in `<Suspense>` with fallbacks, so the page can stream.

**Recommendation:** Keep using Suspense. If a section is slow, reduce the amount of data it fetches (e.g. fewer products) or cache its data source.

---

## 6. Global / env

- **WooCommerce timeout:** `WOOCOMMERCE_API_TIMEOUT` (default 30 s) in `lib/woocommerce.ts`. For slow hosts, 15–20 s can improve perceived responsiveness (fail faster, then show error or fallback).
- **Next.js:** `onDemandEntries` in `next.config.ts` keeps pages in memory for 5 minutes, which helps avoid re-compilation on navigation.

---

## 7. Loading UI

- Root `app/loading.tsx` shows a spinner for route transitions.
- Routes such as `shop`, `products/[slug]`, `product-category/[slug]`, `brands`, `cart`, `checkout`, `dashboard` have their own `loading.tsx` where applicable.

**Recommendation:** Ensure every route that does non-trivial data fetching has a `loading.tsx` so users see an immediate state instead of a blank screen.

---

## Summary of changes made in code

| Area | Change |
|------|--------|
| **Category brands API** | Try WP taxonomy first; cap WC/WP pages (3 + 3); cap brand term map to 2 pages. |
| **Category brands UI** | Show "Loading..." until response (success or failure); set `categoryBrandsLoadedFor` in `finally` so we never get stuck on Loading. |
| **Subcategories** | Prefetch on hover; cache in `/api/filters/categories`; show Loading until fetch completes. |
| **Filters/categories API** | Added caching for top-level and `?category=slug` requests. |

---

## Quick checklist for future slowness

1. **New API route:** Add caching (`cached()`, or `revalidate` for fetch) where appropriate.
2. **Heavy list:** Limit `per_page` and/or max pages; avoid unbounded loops over WC/WP.
3. **Server component:** Prefer `Promise.all` for independent fetches; wrap slow parts in `<Suspense>` with a fallback.
4. **Client component:** Show a loading state until the first response; avoid infinite "Loading..." (e.g. set a “loaded” flag in `finally`).
5. **Nav/global data:** Prefer cached API or in-process cache so every page load doesn’t re-hit the backend.
