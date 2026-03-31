import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { getAuthToken } from '@/lib/auth-server';
import { invalidateProducts, invalidateCategories, invalidateAll } from '@/lib/cache';

/**
 * POST /api/revalidate
 * 
 * On-demand ISR revalidation endpoint
 * Allows manual cache purging when products/categories are updated
 * 
 * Body:
 * - type: 'path' | 'tag' | 'all'
 * - path?: string (required if type is 'path')
 * - tag?: string (required if type is 'tag')
 * - secret?: string (optional webhook secret)
 * 
 * Headers:
 * - x-revalidate-secret: webhook secret for external calls
 * 
 * @example
 * // Revalidate a specific product page
 * POST /api/revalidate
 * { "type": "path", "path": "/products/my-product-slug" }
 * 
 * @example
 * // Revalidate all product pages
 * POST /api/revalidate
 * { "type": "tag", "tag": "products" }
 * 
 * @example
 * // Revalidate everything
 * POST /api/revalidate
 * { "type": "all" }
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication - either auth token or webhook secret
    const token = await getAuthToken();
    const webhookSecret = request.headers.get('x-revalidate-secret');
    const expectedSecret = process.env.REVALIDATE_SECRET;

    const isAuthenticated = !!token;
    const isValidWebhook = expectedSecret && webhookSecret === expectedSecret;

    if (!isAuthenticated && !isValidWebhook) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { type, path, tag, paths, tags } = body;

    let revalidated: string[] = [];
    let message = '';

    switch (type) {
      case 'path':
        // Revalidate single path
        if (path) {
          revalidatePath(path);
          revalidated.push(path);
        }
        // Revalidate multiple paths
        if (paths && Array.isArray(paths)) {
          for (const p of paths) {
            revalidatePath(p);
            revalidated.push(p);
          }
        }
        message = `Revalidated ${revalidated.length} path(s)`;
        break;

      case 'tag':
        // Revalidate single tag
        if (tag) {
          revalidateTag(tag, 'page');
          revalidated.push(tag);
        }
        // Revalidate multiple tags
        if (tags && Array.isArray(tags)) {
          for (const t of tags) {
            revalidateTag(t, 'page');
            revalidated.push(t);
          }
        }
        message = `Revalidated tag(s): ${revalidated.join(', ')}`;
        break;

      case 'products':
        // Revalidate all product-related caches
        revalidateTag('products', 'page');
        revalidatePath('/shop');
        revalidatePath('/products/[slug]', 'page');
        invalidateProducts(); // Also clear API cache
        revalidated = ['products', '/shop', '/products/*'];
        message = 'Revalidated all product pages and caches';
        break;

      case 'categories':
        // Revalidate all category-related caches
        revalidateTag('categories', 'page');
        revalidatePath('/product-category/[slug]', 'page');
        invalidateCategories(); // Also clear API cache
        revalidated = ['categories', '/product-category/*'];
        message = 'Revalidated all category pages and caches';
        break;

      case 'homepage':
        // Revalidate homepage
        revalidatePath('/');
        revalidated = ['/'];
        message = 'Revalidated homepage';
        break;

      case 'all':
        // Revalidate everything
        revalidatePath('/', 'layout'); // Revalidate entire site
        invalidateAll(); // Clear all API caches
        revalidated = ['/*'];
        message = 'Revalidated entire site';
        break;

      default:
        return NextResponse.json(
          { 
            error: 'Invalid type. Use: path, tag, products, categories, homepage, or all',
            validTypes: ['path', 'tag', 'products', 'categories', 'homepage', 'all'],
          },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      message,
      revalidated,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Revalidation error:', error);
    return NextResponse.json(
      { error: 'Failed to revalidate' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/revalidate
 * 
 * Quick revalidation via URL params (for webhooks that only support GET)
 * 
 * @example
 * GET /api/revalidate?secret=xxx&type=products
 * GET /api/revalidate?secret=xxx&path=/products/my-product
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    const type = searchParams.get('type');
    const path = searchParams.get('path');
    const tag = searchParams.get('tag');

    const expectedSecret = process.env.REVALIDATE_SECRET;

    // Verify secret
    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Invalid secret' },
        { status: 401 }
      );
    }

    let message = '';

    if (path) {
      revalidatePath(path);
      message = `Revalidated path: ${path}`;
    } else if (tag) {
      revalidateTag(tag, 'page');
      message = `Revalidated tag: ${tag}`;
    } else if (type === 'products') {
      revalidateTag('products', 'page');
      invalidateProducts();
      message = 'Revalidated all products';
    } else if (type === 'categories') {
      revalidateTag('categories', 'page');
      invalidateCategories();
      message = 'Revalidated all categories';
    } else if (type === 'all') {
      revalidatePath('/', 'layout');
      invalidateAll();
      message = 'Revalidated entire site';
    } else {
      return NextResponse.json(
        { error: 'Missing path, tag, or type parameter' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Revalidation error:', error);
    return NextResponse.json(
      { error: 'Failed to revalidate' },
      { status: 500 }
    );
  }
}

