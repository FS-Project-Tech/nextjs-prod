/**
 * Rate limiting — re-exports + backward-compatible `checkRateLimitSafe` overload.
 */

import {
  checkRateLimitSafe as checkRateLimitWindow,
  checkRateLimitSafeLegacy,
  rateLimitConsume,
  type RateLimitBackendResult,
} from "./api-rate-limit";

export {
  rateLimitConsume,
  rateLimit,
  getClientIp,
  fingerprintRequest,
  setRateLimitBackend,
  rateLimit429Response,
  type RateLimitBackendResult,
} from "./api-rate-limit";

export type LegacyRateLimitOverride = {
  windowMs?: number;
  maxRequests?: number;
};

/** @deprecated Use rateLimitConsume or async checkRateLimitSafe */
export function checkRateLimit(identifier: string): boolean {
  const r = rateLimitConsume(identifier, "legacy-check", 5, 15 * 60);
  return r.allowed;
}

/**
 * Overload 1 (new): `checkRateLimitSafe(ip, "route-key", limit, windowSec)`
 * Overload 2 (legacy): `checkRateLimitSafe(identifier, { windowMs, maxRequests })`
 */
export async function checkRateLimitSafe(
  ip: string,
  routeKey: string,
  limit: number,
  windowSec: number
): Promise<RateLimitBackendResult>;
export async function checkRateLimitSafe(
  identifier: string,
  override?: LegacyRateLimitOverride
): Promise<RateLimitBackendResult>;
export async function checkRateLimitSafe(
  a: string,
  b?: string | LegacyRateLimitOverride,
  c?: number,
  d?: number
): Promise<RateLimitBackendResult> {
  if (typeof b === "string" && typeof c === "number" && typeof d === "number") {
    return checkRateLimitWindow(a, b, c, d);
  }
  return checkRateLimitSafeLegacy(a, (b as LegacyRateLimitOverride) || {});
}
