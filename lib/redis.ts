import { Redis } from "@upstash/redis";

type Client = {
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<any>;
};

let client: Client | null = null;
const memory = new Map<string, number>();

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function isRedisConfigured(): boolean {
  return (
    isProduction() &&
    !!process.env.UPSTASH_REDIS_REST_URL &&
    !!process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

export function getRedis(): Client {
  if (client) return client;

  // only use Upstash in production
  if (isRedisConfigured()) {
    client = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    console.log("[redis] using upstash (prod)");
    return client;
  }

  // local memory fallback
  console.log("[redis] using memory (local)");

  client = {
    async incr(key: string) {
      const val = (memory.get(key) || 0) + 1;
      memory.set(key, val);
      return val;
    },

    async expire(key: string, seconds: number) {
      setTimeout(() => memory.delete(key), seconds * 1000);
    },
  };

  return client;
}