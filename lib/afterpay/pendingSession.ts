import "server-only";

import { Redis as UpstashRedis } from "@upstash/redis";
import {
  getRedis as getTcpRedis,
  isRedisConfigured as isTcpRedisConfigured,
} from "@/lib/redis-tcp";

const PREFIX = "afterpay:pending:";
const ORDER_FOR_TOKEN_PREFIX = "afterpay:order_token:";
const TTL_SEC = 30 * 60;
const ORDER_INDEX_TTL_SEC = 7 * 24 * 60 * 60;

let upstashClient: UpstashRedis | null | undefined;

function memoryKv(): Map<string, { value: string; exp: number }> {
  const g = globalThis as unknown as {
    __afterpayMem?: Map<string, { value: string; exp: number }>;
  };
  if (!g.__afterpayMem) g.__afterpayMem = new Map();
  return g.__afterpayMem;
}

function touchExpiry(key: string, ttlSec: number): void {
  setTimeout(() => {
    const mem = memoryKv();
    const row = mem.get(key);
    if (row && row.exp <= Date.now()) mem.delete(key);
  }, ttlSec * 1000);
}

function getUpstashRedis(): UpstashRedis | null {
  if (upstashClient !== undefined) return upstashClient;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  upstashClient = url && token ? new UpstashRedis({ url, token }) : null;
  return upstashClient;
}

async function setKv(key: string, value: string, ttlSec: number): Promise<void> {
  const mem = memoryKv();
  const exp = Date.now() + ttlSec * 1000;
  mem.set(key, { value, exp });
  touchExpiry(key, ttlSec);

  const upstash = getUpstashRedis();
  if (upstash) {
    try {
      await upstash.set(key, value, { ex: ttlSec });
      return;
    } catch (e) {
      console.warn("[afterpay pending] upstash set failed; using memory fallback", {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (isTcpRedisConfigured()) {
    try {
      await getTcpRedis().setex(key, ttlSec, value);
    } catch (e) {
      console.warn("[afterpay pending] redis set failed; using memory fallback", {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

async function getKv(key: string): Promise<string | null> {
  const upstash = getUpstashRedis();
  if (upstash) {
    try {
      const value = await upstash.get<string>(key);
      if (typeof value === "string") return value;
      if (value != null) return JSON.stringify(value);
    } catch (e) {
      console.warn("[afterpay pending] upstash get failed; checking memory fallback", {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (isTcpRedisConfigured()) {
    try {
      const value = await getTcpRedis().get(key);
      if (typeof value === "string") return value;
    } catch (e) {
      console.warn("[afterpay pending] redis get failed; checking memory fallback", {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const row = memoryKv().get(key);
  if (!row || row.exp < Date.now()) {
    if (row) memoryKv().delete(key);
    return null;
  }
  return row.value;
}

async function deleteKv(key: string): Promise<void> {
  memoryKv().delete(key);

  const upstash = getUpstashRedis();
  if (upstash) {
    try {
      await upstash.del(key);
    } catch (e) {
      console.warn("[afterpay pending] upstash delete failed", {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (isTcpRedisConfigured()) {
    try {
      await getTcpRedis().del(key);
    } catch (e) {
      console.warn("[afterpay pending] redis delete failed", {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

export async function savePendingCheckoutPayload(
  merchantReference: string,
  payloadJson: string
): Promise<void> {
  const key = `${PREFIX}${merchantReference}`;
  await setKv(key, payloadJson, TTL_SEC);
}

export async function getPendingCheckoutPayload(merchantReference: string): Promise<string | null> {
  const key = `${PREFIX}${merchantReference}`;
  return getKv(key);
}

export async function deletePendingCheckoutPayload(merchantReference: string): Promise<void> {
  const key = `${PREFIX}${merchantReference}`;
  await deleteKv(key);
}

/** Idempotent confirm: remember Woo order id for an Afterpay order token. */
export async function rememberOrderForAfterpayToken(token: string, orderId: string): Promise<void> {
  const key = `${ORDER_FOR_TOKEN_PREFIX}${token}`;
  await setKv(key, orderId, ORDER_INDEX_TTL_SEC);
}

export async function getOrderIdForAfterpayToken(token: string): Promise<string | null> {
  const key = `${ORDER_FOR_TOKEN_PREFIX}${token}`;
  return getKv(key);
}
