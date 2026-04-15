/**
 * Node.js runtime bootstrap (not Edge). Registers Redis rate-limit backend when REDIS_URL is set.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { initRedisRateLimitBackend } = await import("@/lib/rate-limit-backend-init");
  initRedisRateLimitBackend();
}
