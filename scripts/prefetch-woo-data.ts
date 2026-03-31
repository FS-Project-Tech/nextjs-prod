/**
 * Build-time script to prefetch WooCommerce data
 * Run this during build: npm run prefetch:woo
 */

import { prefetchAllWooData } from '../lib/prefetch-woo-data';

async function main() {
  console.log('Starting WooCommerce data prefetch for ISR...');
  
  try {
    const data = await prefetchAllWooData({
      maxPopularProducts: 50,
      maxFeaturedProducts: 50,
      includeCategories: true,
    });
    
    console.log('Prefetch completed successfully:', {
      popularProducts: data.popularProducts.length,
      featuredProducts: data.featuredProducts.length,
      categories: data.categories.length,
    });
    
    // Export data for use in generateStaticParams
    process.exit(0);
  } catch (error) {
    console.error('Prefetch failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

