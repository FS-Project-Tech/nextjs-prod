import "server-only";

import { setRateLimitBackend } from "@/lib/api-rate-limit";
import type { DistributedRateLimitBackend } from "@/lib/api-rate-limit";

/**
 * Registers Redis-backed fixed-window limits (same engine as {@link checkRateLimitDistributed}).
 * Set `REDIS_URL` (TCP URL; works with Upstash, ElastiCache, etc.).
 */
export function initRedisRateLimitBackend(): void {
  if (!process.env.REDIS_URL?.trim()) return;

  const backend: DistributedRateLimitBackend = async (args) => {
    const { checkRateLimitDistributed } = await import("@/lib/distributed-rate-limit");
    return checkRateLimitDistributed(args.compositeKey, {
      windowSeconds: args.windowSeconds,
      maxRequests: args.maxRequests,
    });
  };

  setRateLimitBackend(backend);
}
