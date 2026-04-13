/**
 * Structured security logs (Edge-safe). Forward to Sentry/etc. later.
 */

export function logRateLimit(ip: string, route: string, fingerprint?: string): void {
  console.warn("RATE_LIMIT", { ip, route, fingerprint });
}

export function logBlockedBot(userAgent: string, ip: string): void {
  console.warn("BLOCKED_BOT", { ua: userAgent, ip });
}

export function logInvalidAuth(
  route: string,
  ip: string,
  reason: string,
  extra?: Record<string, unknown>
): void {
  console.warn("INVALID_AUTH", { route, ip, reason, ...extra });
}
