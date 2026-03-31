# Configuration Setup Guide

This guide covers all configuration aspects of the WooCommerce Headless Next.js application.

## 📋 Table of Contents

1. [Next.js Configuration](#nextjs-configuration)
2. [ESLint Setup](#eslint-setup)
3. [Prettier Setup](#prettier-setup)
4. [Compression](#compression)
5. [Environment Variables](#environment-variables)
6. [Caching Headers](#caching-headers)

## 🔧 Next.js Configuration

### Features Enabled

- ✅ **Compression**: `compress: true` - Enables gzip + Brotli compression
- ✅ **Package Optimization**: Optimized imports for major packages
- ✅ **Image Optimization**: Remote patterns configured for WooCommerce images
- ✅ **React Compiler**: Enabled for better performance

### Key Settings

```typescript
// next.config.ts
compress: true, // Enables gzip + Brotli compression
optimizePackageImports: [
  'framer-motion',
  'axios',
  'swiper',
  '@tanstack/react-query',
  'react-hook-form',
  'lucide-react',
  'zustand',
],
```

### Image Remote Patterns

Configured to allow images from:
- WooCommerce/WordPress sites
- Placeholder services (development)
- Unsplash (for marketing images)

## 📝 ESLint Setup

### Configuration

ESLint is configured with:
- Next.js recommended rules
- TypeScript support
- Prettier integration
- Custom rules for unused variables

### Usage

```bash
# Check for linting errors
npm run lint

# Auto-fix linting errors
npm run lint:fix
```

### Rules

- Allows console.log in development
- Allows unused variables with underscore prefix (`_unusedVar`)
- Integrates with Prettier for formatting

## 💅 Prettier Setup

### Configuration

Prettier is configured with:
- 2-space indentation
- Semicolons enabled
- Single quotes disabled (double quotes)
- 100 character line width
- LF line endings

### Usage

```bash
# Format all files
npm run format

# Check formatting without changing files
npm run format:check
```

### Files

- `.prettierrc` - Prettier configuration
- `.prettierignore` - Files to ignore

## 🗜️ Compression

### Automatic Compression

Next.js automatically compresses responses when `compress: true` is set in `next.config.ts`.

**Supported formats:**
- **Gzip** - Widely supported, good compression
- **Brotli** - Better compression, modern browsers

### How It Works

1. Next.js detects `Accept-Encoding` header
2. Automatically compresses responses
3. Sets appropriate `Content-Encoding` header
4. Middleware adds `Vary: Accept-Encoding` header

### Verification

Check response headers:
```bash
curl -H "Accept-Encoding: gzip, br" -I https://yoursite.com
```

Look for:
- `Content-Encoding: gzip` or `Content-Encoding: br`
- `Vary: Accept-Encoding`

## 🔐 Environment Variables

### Setup

1. Copy `env.example` to `.env.local`:
   ```bash
   cp env.example .env.local
   ```

2. Fill in your values:
   ```bash
   # Required
   WC_API_URL=https://your-site.com/wp-json/wc/v3
   WC_CONSUMER_KEY=ck_your_key
   WC_CONSUMER_SECRET=cs_your_secret
   NEXT_PUBLIC_SITE_URL=https://yourdomain.com
   ```

### Variable Types

#### Public Variables (`NEXT_PUBLIC_*`)
- Exposed to the browser
- Use for non-sensitive configuration
- Examples: API URLs, site URLs, feature flags

#### Private Variables (no prefix)
- Server-side only
- Use for sensitive data
- Examples: API secrets, database URLs, JWT secrets

### Required Variables

```bash
# WooCommerce API
WC_API_URL=https://your-site.com/wp-json/wc/v3
WC_CONSUMER_KEY=ck_...
WC_CONSUMER_SECRET=cs_...

# Site Configuration
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
```

### Optional Variables

```bash
# Redis Caching
REDIS_URL=redis://localhost:6379

# Analytics
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX

# Feature Flags
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_ENABLE_PWA=true

# Category Configuration
NEXT_PUBLIC_CONTINENCE_CATEGORY_SLUG=continence-care
```

## 📦 Caching Headers

### Static Assets

```
Cache-Control: public, max-age=31536000, immutable
```
- JS/CSS files
- Fonts
- Images
- Next.js static files

### API Routes

```
Cache-Control: public, s-maxage=300, stale-while-revalidate=600
```
- Product API: 5 minutes cache
- Other APIs: 1 minute cache
- Stale-while-revalidate for better UX

### Pages

```
Cache-Control: public, s-maxage=300, stale-while-revalidate=600
```
- Product pages
- Category pages
- ISR with 5-minute revalidation

### Security Headers

```
X-DNS-Prefetch-Control: on
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

## 🚀 Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment:**
   ```bash
   cp env.example .env.local
   # Edit .env.local with your values
   ```

3. **Run development server:**
   ```bash
   npm run dev
   ```

4. **Format code:**
   ```bash
   npm run format
   ```

5. **Check code quality:**
   ```bash
   npm run check
   ```

## 📚 Additional Resources

- [Next.js Configuration](https://nextjs.org/docs/app/api-reference/next-config-js)
- [ESLint Configuration](https://eslint.org/docs/latest/use/configure/)
- [Prettier Configuration](https://prettier.io/docs/en/configuration.html)
- [Environment Variables](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables)

## ✅ Checklist

- [x] Next.js configured with compression
- [x] ESLint set up with Prettier integration
- [x] Prettier configured and working
- [x] Environment variables documented
- [x] Caching headers configured
- [x] Security headers added
- [x] Image remote patterns configured
- [x] Package imports optimized

