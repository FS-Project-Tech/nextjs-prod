import { setRateLimitBackend, type RateLimitBackendResult } from "./api-rate-limit";
import { getRedis } from "./redis";

/** Middleware runs on Edge — avoid loading `ioredis` (TCP) there. */
const isEdgeRuntime =
  process.env.NEXT_RUNTIME === "edge" ||
  typeof (globalThis as { EdgeRuntime?: string }).EdgeRuntime === "string";

async function tryUpstashBackend(args: {
  compositeKey: string;
  windowSeconds: number;
  maxRequests: number;
}) {
  if (!getRedis()) return null;

  const { compositeKey, windowSeconds, maxRequests } = args;
  try {
    const count = await getRedis().incr(compositeKey);

    if (count === 1) {
      await getRedis().expire(compositeKey, windowSeconds);
    }

    const limit = maxRequests;
    const resetSeconds = windowSeconds;
    if (count <= maxRequests) {
      const r: RateLimitBackendResult = {
        ok: true,
        limit,
        remaining: Math.max(0, maxRequests - count),
        resetSeconds,
      };
      return r;
    }
    const r: RateLimitBackendResult = {
      ok: false,
      limit,
      remaining: 0,
      resetSeconds,
    };
    return r;
  } catch (error) {
    console.error("Redis rate limit error:", error);
    return null;
  }
}

setRateLimitBackend(async (args) => {
  const upstash = await tryUpstashBackend(args);
  if (upstash) return upstash;

  if (isEdgeRuntime) {
    return null;
  }

  try {
    const { checkRateLimitDistributed } = await import("@/lib/distributed-rate-limit");
    return await checkRateLimitDistributed(args.compositeKey, {
      windowSeconds: args.windowSeconds,
      maxRequests: args.maxRequests,
    });
  } catch (error) {
    console.error("TCP Redis rate limit error:", error);
    return null;
  }
});
