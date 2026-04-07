import type { NextConfig } from "next";
import bundleAnalyzer from '@next/bundle-analyzer';
 
// Optionally include a domain from the WooCommerce API URL if provided
const wcApiUrl = process.env.NEXT_PUBLIC_WP_URL;
let wcHost: string | undefined;
try {
  if (wcApiUrl) {
    const u = new URL(wcApiUrl);
    wcHost = u.hostname;
  }
} catch {}
 
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

/**
 * WordPress “Read more” often uses `/{slug}` (e.g. /wound-management).
 * Detail pages in this app live at `/our-nursing-services/{slug}`.
 * Slugs from NEXT_PUBLIC_NURSING_DETAIL_SLUGS (comma-separated); defaults include common services.
 */
function nursingServiceRootRedirects(): Array<{
  source: string;
  destination: string;
  permanent: boolean;
}> {
  const raw =
    process.env.NEXT_PUBLIC_NURSING_DETAIL_SLUGS ||
    "wound-management,stoma-care";
  const slugs = raw
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z0-9][-a-z0-9]*$/i.test(s));
  const out: Array<{ source: string; destination: string; permanent: boolean }> =
    [];
  for (const slug of new Set(slugs)) {
    out.push(
      {
        source: `/${slug}`,
        destination: `/our-nursing-services/${slug}`,
        permanent: false,
      },
      {
        source: `/${slug}/`,
        destination: `/our-nursing-services/${slug}`,
        permanent: false,
      }
    );
  }
  return out;
}
 
const nextConfig: NextConfig = {

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: ContentSecurityPolicy.replace(/\n/g, ""),
          },
        ],
      },
    ];
  },

  reactCompiler: true,
 
  compress: true,
 
  // Use webpack instead of Turbopack (for compatibility with existing webpack config)
  // Add empty turbopack config to silence the warning
  turbopack: {},
 
  // Enable experimental features for better performance
  experimental: {
    // Optimize package imports - reduces bundle size and compile time
    optimizePackageImports: [
      'framer-motion',
      'axios',
      'swiper',
      '@tanstack/react-query',
      'react-hook-form',
      'lucide-react',
    ],
    // Enable faster refresh for better HMR experience
    // optimizeCss: true, // Uncomment if using CSS optimization
    // Turbopack persistent caching (available in Next.js 15.1+)
    // turbopackPersistentCaching: true, // Uncomment if using Next.js 15.1+
  },
 
  // Route-based prefetching configuration
  // Next.js automatically prefetches links when they enter the viewport
  // This configuration optimizes prefetch behavior
  // Note: Prefetch distance is controlled by Next.js internally (default: ~200px)
  // We can optimize by using prefetch={true} on critical paths
 
  // ISR (Incremental Static Regeneration) for SEO-friendly product/category pages
  // Pages will be statically generated and revalidated every 5 minutes
  // This ensures fast page loads while keeping content fresh
 
  // Optimize loading performance - reduces memory usage in dev
  // Prevents re-compiling on every click by keeping pages in memory longer
  onDemandEntries: {
    // Period (in ms) where the server will keep pages in the buffer
    maxInactiveAge: 5 * 60 * 1000, // 5 minutes - keep pages longer to prevent re-compilation
    // Number of pages that should be kept simultaneously without being disposed
    pagesBufferLength: 10, // Increased to 10 for faster navigation and less re-compilation
  },
 
  // Compiler optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },
 
  // Webpack optimizations for faster builds (only when not using Turbopack)
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      // Optimize file watching on Windows - critical for Windows performance
      // Prevent re-compiling on every click by ignoring more files
      config.watchOptions = {
        poll: 1000, // Poll every 1s on Windows (better than default watch)
        aggregateTimeout: 500, // Increased to 500ms to batch changes
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.next/**',
          '**/out/**',
          '**/dist/**',
          '**/.turbo/**',
          '**/coverage/**',
          '**/*.test.ts',
          '**/*.test.tsx',
          '**/*.spec.ts',
          '**/*.spec.tsx',
          '**/__tests__/**',
          '**/docs/**',
          '**/.env*.local',
        ],
        followSymlinks: false, // Don't follow symlinks (faster)
      };
     
      // Reduce memory usage by limiting chunk size
      if (!isServer) {
        config.optimization = {
          ...config.optimization,
          splitChunks: {
            chunks: 'all',
            cacheGroups: {
              default: false,
              vendors: false,
              // Group vendor chunks for faster rebuilds
              framework: {
                name: 'framework',
                chunks: 'all',
                test: /(?<!node_modules.*)[\\/]node_modules[\\/](react|react-dom|scheduler|next)[\\/]/,
                priority: 40,
                enforce: true,
              },
            },
          },
        };
      }
    }
   
    // Optimize module resolution
    config.resolve = {
      ...config.resolve,
      // Use symlinks for faster resolution
      symlinks: true,
      // Cache module resolution
      cache: dev,
    };
   
    return config;
  },
  images: {
    remotePatterns: [
      // Add known WooCommerce media hosts here
      {
        protocol: "https",
        hostname: "live.joyamedicalsupplies.com.au",
        pathname: "/wp-content/uploads/**",
      },
      {
        protocol: "https",
        hostname: "stage.joyamedicalsupplies.com.au",
        pathname: "/wp-content/uploads/**",
      },
      // Placeholder image host used in development/demo sliders
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
      // Unsplash images for NDIS and other sections
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      // Optionally allow the host derived from NEXT_PUBLIC_WC_API_URL
      // (common when media is served from the same domain)
      ...(wcHost
        ? ([
            {
              protocol: "https",
              hostname: wcHost,
              pathname: "/wp-content/uploads/**",
            },
          ] as const)
        : ([] as const)),
      // Allow any WordPress/WooCommerce site (for flexibility)
      // Remove or restrict in production if needed
      ...(process.env.NODE_ENV === 'development' ? [
        {
          protocol: "https" as const,
          hostname: "**.wordpress.com",
        },
        {
          protocol: "https" as const,
          hostname: "**.wp.com",
        },
      ] : []),
    ],
    // Optimize images for better performance
    formats: ['image/avif', 'image/webp'],
    // Cache images longer (1 hour) to reduce upstream requests
    minimumCacheTTL: 3600,
    // Enable device sizes for responsive images
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Enable image optimization
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    // contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // Increase timeout for slow upstream servers (30 seconds)
    // Note: This requires Next.js 14.1+ for full support
    unoptimized: false,
  },
 
  // Increase timeout for static page generation (for slow APIs)
  staticPageGenerationTimeout: 120,
 
  // Redirect legacy URLs to info pages (privacy, terms, faq, shipping from WordPress)
  async redirects() {
    return [
      // Product detail URLs moved from /products/[slug] to /product/[slug] (listing stays at /products)
      {
        source: '/products/:slug/consult',
        destination: '/product/:slug/consult',
        permanent: true,
      },
      {
        source: '/products/:slug',
        destination: '/product/:slug',
        permanent: true,
      },
      { source: '/privacy', destination: '/privacy-policy', permanent: true },
      // { source: '/terms', destination: '/info/terms', permanent: true },
      { source: '/faq', destination: '/info/faq', permanent: true },
      { source: '/shipping', destination: '/info/shipping', permanent: true },
      { source: '/collection-statement', destination: '/info/collection-statement', permanent: true },
      { source: '/collection-statement-general-enquiries', destination: '/info/collection-statement', permanent: true },
      { source: '/info/blog', destination: '/blog', permanent: true },
      {
        source: '/legal/terms',
        destination: '/info/terms',
        permanent: true,
      },
      {
        source: '/legal/privacy',
        destination: '/privacy-policy',
        permanent: true,
      },
      {
        source: '/health-professional',
        destination: '/health-professionals',
        permanent: true,
      },
      {
        source: '/health-professional/:path*',
        destination: '/health-professionals/:path*',
        permanent: true,
      },
      ...nursingServiceRootRedirects()
    ];
  },
 
  async rewrites() {
    return [{ source: "/privacy-policy", destination: "/info/privacy" }];
  },

  // Enable static page generation with ISR
  output: 'standalone',
};

/**
 * Google Maps JS + Places needs script/connect to Google hosts, map tiles in img-src,
 * and blob workers. Without these, checkout AddressAutocomplete is blocked by the browser.
 */
const ContentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://connect.facebook.net https://maps.googleapis.com https://maps.gstatic.com;
  connect-src 'self' https://www.google-analytics.com https://connect.facebook.net https://maps.googleapis.com https://*.googleapis.com https://*.gstatic.com https://*.google.com;
  img-src 'self' data: blob: https://www.google-analytics.com https://www.facebook.com https://www.googletagmanager.com https://*.google.com https://*.googleapis.com https://*.gstatic.com https://*.ggpht.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' data: https://fonts.gstatic.com;
  worker-src 'self' blob:;
  frame-src https://www.googletagmanager.com;
`;


 
export default withBundleAnalyzer(nextConfig);