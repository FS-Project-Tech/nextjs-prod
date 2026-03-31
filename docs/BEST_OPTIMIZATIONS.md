# Best Optimization Opportunities - Prioritized by Impact

## 🥇 #1 Priority: Dynamic Import MiniCartDrawer (BIGGEST WIN)

**Impact**: ⭐⭐⭐⭐⭐ (Highest)
**Effort**: Low
**Expected Improvement**: 30-40% reduction in initial bundle size on every page

**Why**: 
- `MiniCartDrawer` is loaded on **every page** (in `layout.tsx`) but only used when cart opens
- ~280 lines of code with cart logic, shipping calculations, coupon handling
- Currently blocks initial page load unnecessarily

**Implementation**:
```typescript
// In layout.tsx - lazy load when cart opens
const MiniCartDrawer = dynamic(() => import("@/components/MiniCartDrawer"), {
  ssr: false, // Only needed client-side when cart opens
});
```

**Result**: 
- Faster initial page loads on all pages
- Smaller initial JavaScript bundle
- Better Core Web Vitals (FCP, LCP)

---

## 🥈 #2 Priority: Dynamic Import CatalogueBook

**Impact**: ⭐⭐⭐⭐ (Very High)
**Effort**: Low
**Expected Improvement**: 50-60% reduction in catalogue page bundle size

**Why**:
- **484 lines** of code with heavy `framer-motion` animations
- Only used on `/catalogue` pages
- Loads entire `framer-motion` library (~150KB) unnecessarily on other pages

**Implementation**:
```typescript
// In catalogue pages
const CatalogueBook = dynamic(() => import("@/components/CatalogueBook"), {
  loading: () => <div>Loading catalogue...</div>,
  ssr: false, // Client-side animations
});
```

**Result**:
- Massive bundle size reduction for non-catalogue pages
- Faster catalogue page loads (code-split)
- Better TTI (Time to Interactive)

---

## 🥉 #3 Priority: Dynamic Import ProductGallery

**Impact**: ⭐⭐⭐ (High)
**Effort**: Low
**Expected Improvement**: 20-30% reduction in product page bundle size

**Why**:
- Image-heavy component with Swiper slider
- Only used on product detail pages
- Can be loaded after initial product info

**Implementation**:
```typescript
// In app/products/[slug]/page.tsx
const ProductGallery = dynamic(() => import('@/components/ProductGallery'), {
  loading: () => <div className="aspect-square bg-gray-100 animate-pulse" />,
});
```

**Result**:
- Faster product page initial render
- Progressive image loading experience
- Better LCP (Largest Contentful Paint)

---

## #4 Priority: Optimize Home Page Sections

**Impact**: ⭐⭐⭐ (Medium-High)
**Effort**: Medium
**Expected Improvement**: 15-25% faster home page load

**Why**:
- Home page has **8+ ProductSection components** loading synchronously
- All sections fetch data on page load
- Better to load below-fold sections progressively

**Implementation**:
- Already using `Suspense` (good!)
- Can add `loading="lazy"` to below-fold sections
- Consider reducing initial `per_page` from 10 to 6-8

**Result**:
- Faster initial page render
- Progressive content loading
- Better user experience

---

## #5 Priority: Replace Placeholder Images

**Impact**: ⭐⭐ (Medium)
**Effort**: Low
**Expected Improvement**: Better image loading, SEO, and performance

**Why**:
- Using `picsum.photos` (external service) instead of optimized Next.js Image
- No image optimization, caching, or WebP/AVIF conversion
- Affects LCP and performance

**Current Issues**:
```typescript
// app/page.tsx line 103
<img src="https://picsum.photos/1600/320?random=21" ... />
// app/products/[slug]/page.tsx line 88
<Image src="https://picsum.photos/600/1200?random=31" ... />
```

**Fix**: Use Next.js Image component with proper optimization or local placeholder images

---

## #6 Priority: Code Split Heavy Libraries

**Impact**: ⭐⭐ (Medium)
**Effort**: Low
**Expected Improvement**: Better initial bundle size

**Why**:
- `framer-motion` (~150KB) only needed for CatalogueBook
- `swiper` (~80KB) used in multiple places but can be lazy loaded
- `axios` can be tree-shaken better

**Current**: All libraries loaded upfront
**Better**: Load only when needed

---

## Quick Win Summary

### Immediate Actions (5 minutes each):

1. ✅ **Dynamic Import MiniCartDrawer** → 30-40% bundle reduction
2. ✅ **Dynamic Import CatalogueBook** → 50-60% bundle reduction on catalogue pages  
3. ✅ **Dynamic Import ProductGallery** → 20-30% bundle reduction on product pages

### Medium-term (30 minutes):

4. ✅ Optimize home page section loading
5. ✅ Replace placeholder images with Next.js Image
6. ✅ Code split heavy libraries

---

## Expected Overall Impact

**Before Optimizations**:
- Initial bundle: ~500-600KB
- Home page load: ~2-3s
- Product page load: ~2-3s

**After Top 3 Optimizations**:
- Initial bundle: ~300-400KB (**40-50% reduction**)
- Home page load: ~1-1.5s (**50% faster**)
- Product page load: ~1.5-2s (**33% faster**)

---

## Recommended Implementation Order

1. **Start with MiniCartDrawer** (biggest impact, easiest)
2. **Then CatalogueBook** (huge impact on catalogue pages)
3. **Then ProductGallery** (good impact on product pages)
4. **Then optimize images** (better UX)
5. **Finally, optimize home page sections** (polish)

