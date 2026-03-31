/**
 * Prefetch WooCommerce Data for ISR
 * 
 * Use these functions during build time to pre-generate static pages
 */

import { prefetchProducts, prefetchCategories } from './fetch-woo-data';
import type { WooCommerceProduct, WooCommerceCategory } from './woocommerce';

/**
 * Prefetch all popular products for ISR
 * Call this during build time to pre-generate product pages
 */
export async function prefetchPopularProducts(
  limit: number = 50
): Promise<WooCommerceProduct[]> {
  console.log(`[Prefetch] Fetching ${limit} popular products...`);
  
  const products = await prefetchProducts(
    {
      per_page: limit,
      orderby: 'popularity',
      order: 'desc',
    },
    { maxPages: 1 }
  );
  
  console.log(`[Prefetch] Fetched ${products.length} popular products`);
  return products;
}

/**
 * Prefetch featured products for ISR
 */
export async function prefetchFeaturedProducts(
  limit: number = 50
): Promise<WooCommerceProduct[]> {
  console.log(`[Prefetch] Fetching ${limit} featured products...`);
  
  const products = await prefetchProducts(
    {
      per_page: limit,
      featured: true,
      orderby: 'date',
      order: 'desc',
    },
    { maxPages: 1 }
  );
  
  console.log(`[Prefetch] Fetched ${products.length} featured products`);
  return products;
}


/**
 * Prefetch all categories for ISR
 */
export async function prefetchAllCategories(): Promise<WooCommerceCategory[]> {
  console.log('[Prefetch] Fetching all categories...');
  
  const categories = await prefetchCategories({
    hide_empty: true,
  });
  
  console.log(`[Prefetch] Fetched ${categories.length} categories`);
  return categories;
}

/**
 * Prefetch products by category for ISR
 */
export async function prefetchProductsByCategory(
  categoryId: number,
  limit: number = 20
): Promise<WooCommerceProduct[]> {
  console.log(`[Prefetch] Fetching ${limit} products for category ${categoryId}...`);
  
  const products = await prefetchProducts(
    {
      per_page: limit,
      category: categoryId,
      orderby: 'popularity',
      order: 'desc',
    },
    { maxPages: 1 }
  );
  
  console.log(`[Prefetch] Fetched ${products.length} products for category ${categoryId}`);
  return products;
}

/**
 * Prefetch all data needed for build-time ISR
 * Call this in your build script or during static generation
 */
export async function prefetchAllWooData(options?: {
  maxPopularProducts?: number;
  maxFeaturedProducts?: number;
  includeCategories?: boolean;
}): Promise<{
  popularProducts: WooCommerceProduct[];
  featuredProducts: WooCommerceProduct[];
  categories: WooCommerceCategory[];
}> {
  console.log('[Prefetch] Starting full WooCommerce data prefetch...');
  
  const [
    popularProducts,
    featuredProducts,
    categories,
  ] = await Promise.allSettled([
    prefetchPopularProducts(options?.maxPopularProducts || 50),
    prefetchFeaturedProducts(options?.maxFeaturedProducts || 50),
    options?.includeCategories !== false
      ? prefetchAllCategories()
      : Promise.resolve([]),
  ]);
  
  const result = {
    popularProducts:
      popularProducts.status === 'fulfilled'
        ? popularProducts.value
        : [],
    featuredProducts:
      featuredProducts.status === 'fulfilled'
        ? featuredProducts.value
        : [],
    categories:
      categories.status === 'fulfilled' ? categories.value : [],
  };
  
  console.log('[Prefetch] Completed WooCommerce data prefetch:', {
    popular: result.popularProducts.length,
    featured: result.featuredProducts.length,
    categories: result.categories.length,
  });
  
  return result;
}

