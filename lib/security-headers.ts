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

/**
 * Middleware / Proxy for CSP + nonce
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const cspHeader = `
  default-src 'self';
  
  script-src 'self' 'nonce-${nonce}' 'unsafe-eval'
    https://www.googletagmanager.com
    https://tagmanager.google.com
    https://www.google-analytics.com
    https://stats.g.doubleclick.net
    https://maps.googleapis.com/maps-api-v3
    https://connect.facebook.net
    
    https://maps.googleapis.com
    https://embed.tawk.to;
  
  style-src 'self' 'nonce-${nonce}'
    https://embed.tawk.to;
  
  style-src-elem 'self' 'nonce-${nonce}'
    https://embed.tawk.to;
  
  connect-src 'self'
    https://www.googletagmanager.com
    https://www.google-analytics.com
    https://maps.googleapis.com
  https://maps.gstatic.com
  https://www.facebook.com/tr
  https://maps.googleapis.com/maps-api-v3
    https://stats.g.doubleclick.net
    https://region1.google-analytics.com
    https://analytics.google.com
    https://www.google.com
    https://www.google.co.in
    https://googleads.g.doubleclick.net
    https://connect.facebook.net
    https://graph.facebook.com
    https://www.facebook.com
    https://*.facebook.com
    https://*.fbcdn.net
    https://embed.tawk.to
    https://va.tawk.to
    https://*.tawk.to
    wss://*.tawk.to
    https://joyamedicalsupplies.com.au
    https://*.joyamedicalsupplies.com.au;
  
  img-src 'self' blob: data:
    https://www.google-analytics.com
    https://www.googletagmanager.com
    https://www.google.com
    https://www.google.co.in
    https://googleads.g.doubleclick.net
    https://maps.gstatic.com
    https://maps.googleapis.com
    https://www.facebook.com
    https://*.facebook.com
    https://*.fbcdn.net
    https://*.tawk.to
    https://joyamedicalsupplies.com.au
    https://*.joyamedicalsupplies.com.au;
  
  font-src 'self' data:
  https://fonts.gstatic.com;

style-src 'self' 'nonce-${nonce}'
  https://embed.tawk.to
  https://fonts.googleapis.com;
  
  frame-src 'self'
    https://www.googletagmanager.com
    https://tagmanager.google.com
    https://maps.googleapis.com
    https://embed.tawk.to
    https://*.tawk.to;

  worker-src 'self' blob:;
  
  media-src 'self' blob: data:
    https://*.tawk.to;
  
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