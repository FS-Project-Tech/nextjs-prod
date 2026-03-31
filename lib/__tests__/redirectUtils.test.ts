/**
 * Unit tests for redirect utilities
 * 
 * To run these tests, you'll need to set up a test framework (Jest, Vitest, etc.)
 * Example with Vitest:
 *   npm install -D vitest @vitest/ui
 *   Add to package.json: "test": "vitest"
 *   Run: npm test
 * 
 * NOTE: This file requires vitest to be installed. If you don't have it, you can:
 * 1. Install it: npm install -D vitest @vitest/ui
 * 2. Or comment out this file if you're not running tests
 */

// @ts-ignore - vitest may not be installed
import { describe, it, expect } from 'vitest';
import {
  validateRedirect,
  validateNextParam,
  isSafeRedirect,
  DEFAULT_REDIRECT,
  ALLOWED_REDIRECT_PATHS,
} from '../redirectUtils';

describe('validateRedirect', () => {
  it('should return default for null/undefined/empty', () => {
    expect(validateRedirect(null)).toBe(DEFAULT_REDIRECT);
    expect(validateRedirect(undefined)).toBe(DEFAULT_REDIRECT);
    expect(validateRedirect('')).toBe(DEFAULT_REDIRECT);
    expect(validateRedirect('   ')).toBe(DEFAULT_REDIRECT);
  });

  it('should accept valid relative paths', () => {
    expect(validateRedirect('/dashboard')).toBe('/dashboard');
    expect(validateRedirect('/account')).toBe('/account');
    expect(validateRedirect('/dashboard/orders')).toBe('/dashboard/orders');
  });

  it('should reject dangerous protocols', () => {
    expect(validateRedirect('javascript:alert(1)')).toBe(DEFAULT_REDIRECT);
    expect(validateRedirect('data:text/html,<script>alert(1)</script>')).toBe(DEFAULT_REDIRECT);
    expect(validateRedirect('vbscript:msgbox(1)')).toBe(DEFAULT_REDIRECT);
    expect(validateRedirect('file:///etc/passwd')).toBe(DEFAULT_REDIRECT);
  });

  it('should reject URLs with protocols', () => {
    expect(validateRedirect('http://evil.com')).toBe(DEFAULT_REDIRECT);
    expect(validateRedirect('https://evil.com')).toBe(DEFAULT_REDIRECT);
    expect(validateRedirect('//evil.com')).toBe(DEFAULT_REDIRECT);
    expect(validateRedirect('ftp://evil.com')).toBe(DEFAULT_REDIRECT);
    expect(validateRedirect('mailto:evil@evil.com')).toBe(DEFAULT_REDIRECT);
  });

  it('should reject path traversal attempts', () => {
    expect(validateRedirect('/dashboard/../etc/passwd')).toBe(DEFAULT_REDIRECT);
    expect(validateRedirect('/dashboard/..\\etc\\passwd')).toBe(DEFAULT_REDIRECT);
    expect(validateRedirect('../etc/passwd')).toBe(DEFAULT_REDIRECT);
  });

  it('should add leading slash if missing', () => {
    expect(validateRedirect('dashboard')).toBe('/dashboard');
    expect(validateRedirect('account')).toBe('/account');
  });

  it('should sanitize URLs', () => {
    expect(validateRedirect('/dashboard//orders')).toBe('/dashboard/orders');
    expect(validateRedirect('/dashboard?param=value')).toBe('/dashboard');
    expect(validateRedirect('/dashboard#section')).toBe('/dashboard');
  });

  it('should respect whitelist when provided', () => {
    const allowed = ['/dashboard', '/account'] as const;
    expect(validateRedirect('/dashboard', allowed)).toBe('/dashboard');
    expect(validateRedirect('/account', allowed)).toBe('/account');
    expect(validateRedirect('/evil', allowed)).toBe(DEFAULT_REDIRECT);
    expect(validateRedirect('/dashboard/orders', allowed)).toBe('/dashboard/orders'); // Sub-route
  });

  it('should use custom default path', () => {
    expect(validateRedirect('//evil.com', undefined, '/home')).toBe('/home');
    expect(validateRedirect(null, undefined, '/home')).toBe('/home');
  });
});

describe('validateNextParam', () => {
  it('should validate next query parameter', () => {
    expect(validateNextParam('/dashboard')).toBe('/dashboard');
    expect(validateNextParam(null)).toBe(DEFAULT_REDIRECT);
    expect(validateNextParam('//evil.com')).toBe(DEFAULT_REDIRECT);
  });

  it('should respect whitelist', () => {
    const allowed = ['/dashboard'] as const;
    expect(validateNextParam('/dashboard', allowed)).toBe('/dashboard');
    expect(validateNextParam('/evil', allowed)).toBe(DEFAULT_REDIRECT);
  });
});

describe('isSafeRedirect', () => {
  it('should return true for safe paths', () => {
    expect(isSafeRedirect('/dashboard')).toBe(true);
    expect(isSafeRedirect('/account')).toBe(true);
    expect(isSafeRedirect('/dashboard/orders')).toBe(true);
  });

  it('should return false for dangerous protocols', () => {
    expect(isSafeRedirect('javascript:alert(1)')).toBe(false);
    expect(isSafeRedirect('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('should return false for URLs with protocols', () => {
    expect(isSafeRedirect('http://evil.com')).toBe(false);
    expect(isSafeRedirect('https://evil.com')).toBe(false);
    expect(isSafeRedirect('//evil.com')).toBe(false);
  });

  it('should return false for path traversal', () => {
    expect(isSafeRedirect('/dashboard/../etc/passwd')).toBe(false);
    expect(isSafeRedirect('../etc/passwd')).toBe(false);
  });

  it('should return false for paths not starting with /', () => {
    expect(isSafeRedirect('dashboard')).toBe(false);
    expect(isSafeRedirect('evil.com')).toBe(false);
  });

  it('should respect whitelist', () => {
    const allowed = ['/dashboard', '/account'] as const;
    expect(isSafeRedirect('/dashboard', allowed)).toBe(true);
    expect(isSafeRedirect('/account', allowed)).toBe(true);
    expect(isSafeRedirect('/evil', allowed)).toBe(false);
    expect(isSafeRedirect('/dashboard/orders', allowed)).toBe(true); // Sub-route
  });

  it('should return false for null/undefined', () => {
    expect(isSafeRedirect(null)).toBe(false);
    expect(isSafeRedirect(undefined)).toBe(false);
  });
});

describe('Edge cases', () => {
  it('should handle encoded dangerous paths', () => {
    expect(validateRedirect('/dashboard/%2e%2e%2fetc%2fpasswd')).toBe(DEFAULT_REDIRECT);
    expect(validateRedirect('/dashboard/%2e%2e/etc/passwd')).toBe(DEFAULT_REDIRECT);
  });

  it('should handle control characters', () => {
    expect(validateRedirect('/dashboard\x00evil')).toBe('/dashboardevil');
    expect(validateRedirect('/dashboard\norders')).toBe('/dashboardorders');
  });

  it('should handle very long paths', () => {
    const longPath = '/dashboard/' + 'a'.repeat(1000);
    expect(validateRedirect(longPath)).toBe(longPath);
  });

  it('should handle special characters in safe paths', () => {
    expect(validateRedirect('/dashboard/orders?id=123')).toBe('/dashboard/orders');
    expect(validateRedirect('/dashboard#section')).toBe('/dashboard');
  });
});

