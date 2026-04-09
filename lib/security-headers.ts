import { NextRequest, NextResponse } from "next/server";

/**
 * Secure API Response Wrapper
 * Use this in all API routes
 */
export function secureResponse(body: any, init?: ResponseInit) {
  const response = NextResponse.json(body, init);

  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-XSS-Protection", "1; mode=block");

  return response;
}

/**
 * Used by next.config.ts (image optimizer CSP)
 */
export const CSP_HEADER =
  "script-src 'none'; frame-src 'none'; sandbox;";

/**
 * Middleware / Proxy for CSP + nonce
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const cspHeader = `
      default-src 'self';
      script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://connect.facebook.net https://embed.tawk.to;
      style-src 'self' 'unsafe-inline';
      connect-src 'self' https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://www.google.com https://www.google.co.in https://googleads.g.doubleclick.net https://connect.facebook.net https://graph.facebook.com https://www.facebook.com https://*.facebook.com https://*.fbcdn.net https://embed.tawk.to https://*.tawk.to wss://*.tawk.to;
      img-src 'self' blob: data: https://www.google-analytics.com https://www.googletagmanager.com https://www.google.com https://www.google.co.in https://googleads.g.doubleclick.net https://www.facebook.com https://*.facebook.com https://*.fbcdn.net https://*.tawk.to;
      font-src 'self';
      frame-src 'self' https://www.googletagmanager.com https://embed.tawk.to https://*.tawk.to;
      object-src 'none';
      base-uri 'self';
      form-action 'self';
      frame-ancestors 'none';
      upgrade-insecure-requests;
    `;

  const contentSecurityPolicyHeaderValue = cspHeader
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set(
    "Content-Security-Policy",
    contentSecurityPolicyHeaderValue
  );

  return response;
}