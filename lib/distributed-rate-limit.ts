import { getRedis, isRedisConfigured } from "@/lib/redis";

export type DistributedRateLimitConfig = {
  windowSeconds: number;
  maxRequests: number;
};

export type DistributedRateLimitResult =
  | {
      ok: true;
      limit: number;
      remaining: number;
      resetSeconds: number;
    }
  | {
      ok: false;
      limit: number;
      remaining: 0;
      resetSeconds: number;
    };

/**
 * Redis-backed fixed-window rate limiter.
 * Falls back to in-memory limiter elsewhere (see lib/rate-limit.ts).
 *
 * Keying is caller-defined; include route + ip/user id.
 */
export async function checkRateLimitDistributed(
  key: string,
  cfg: DistributedRateLimitConfig
): Promise<DistributedRateLimitResult | null> {
  if (!isRedisConfigured()) return null;

  const redis = getRedis();
  const windowSeconds = Math.max(1, Math.floor(cfg.windowSeconds));
  const maxRequests = Math.max(1, Math.floor(cfg.maxRequests));

  const nowSec = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(nowSec / windowSeconds);
  const redisKey = `rl:${key}:${bucket}`;

  // Atomic increment + ttl set on first hit.
  // We avoid MULTI for performance; Lua keeps it atomic.
  const lua = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return current
`;

  const current = Number(await redis.eval(lua, 1, redisKey, String(windowSeconds)));
  const remaining = Math.max(0, maxRequests - current);
  const resetSeconds = windowSeconds - (nowSec % windowSeconds) || windowSeconds;

  if (current > maxRequests) {
    return { ok: false, limit: maxRequests, remaining: 0, resetSeconds };
  }
  return { ok: true, limit: maxRequests, remaining, resetSeconds };
}
