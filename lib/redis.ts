import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

/**
 * Upstash REST client (Edge + serverless). `null` when env is unset (local dev without Upstash).
 */
export const redis: Redis | null =
  url && token
    ? new Redis({
        url,
        token,
      })
    : null;
