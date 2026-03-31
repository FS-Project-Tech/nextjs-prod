/**
 * PurgeCSS Configuration
 * 
 * Scans for unused CSS classes in your project
 * 
 * Note: Tailwind CSS v4 handles purging automatically,
 * but this config helps identify unused custom CSS classes
 */

module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './lib/**/*.{js,jsx,ts,tsx}',
    './hooks/**/*.{js,jsx,ts,tsx}',
    './hoc/**/*.{js,jsx,ts,tsx}',
    './middleware.ts',
    './middleware-api.ts',
  ],
  css: ['./app/globals.css'],
  defaultExtractor: (content) => {
    // Match class names, IDs, and custom CSS variables
    const broadMatches = content.match(/[^<>"'`\s]*[^<>"'`\s:]/g) || [];
    const innerMatches = content.match(/[^<>"'`\s.()]*[^<>"'`\s.():]/g) || [];
    
    return broadMatches.concat(innerMatches);
  },
  safelist: {
    // Always keep these classes (dynamic classes, Tailwind utilities, etc.)
    standard: [
      // Tailwind dynamic classes
      /^(bg|text|border|rounded|p|m|w|h|flex|grid|hidden|block|inline|absolute|relative|fixed|sticky|z-|opacity|transition|transform|scale|rotate|translate|shadow|hover|focus|active|disabled|group|peer)/,
      // Swiper classes
      /^swiper/,
      /^swiper-/,
      // Next.js classes
      /^__next/,
      // Custom classes that might be dynamically generated
      /^animate-/,
      /^line-clamp-/,
      // WooCommerce classes
      /^woocommerce/,
      /^wc-/,
    ],
    deep: [
      // Deep selectors
      /data-.*/,
      /aria-.*/,
    ],
    greedy: [
      // Greedy patterns (match even if not in safelist)
      /^[a-z][a-z0-9-]*$/, // Match any lowercase class name
    ],
  },
  output: './purgecss-output',
  rejected: true, // Show rejected CSS
  printRejected: true, // Print rejected CSS to console
};

