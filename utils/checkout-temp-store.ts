import crypto from "crypto";
import { getRedis, isRedisConfigured } from "@/lib/redis";
import type { PendingEwayOrder } from "@/types/checkout";

const PENDING_KEY = "checkout:eway:pending:";
const TXN_KEY = "checkout:eway:txn:";
const TTL_SECONDS = 30 * 60;
const TXN_TTL_SECONDS = 24 * 60 * 60;

const memoryStore = new Map<string, { data: PendingEwayOrder; expiresAt: number }>();

function now() {
  return Date.now();
}

function randomRef(): string {
  return `ORD-${now()}-${crypto.randomBytes(5).toString("hex")}`.toUpperCase();
}

export async function createOrderRef(): Promise<string> {
  return randomRef();
}

export async function savePendingOrder(data: PendingEwayOrder): Promise<void> {
  if (isRedisConfigured()) {
    await getRedis().setex(`${PENDING_KEY}${data.orderRef}`, TTL_SECONDS, JSON.stringify(data));
    return;
  }
  memoryStore.set(data.orderRef, { data, expiresAt: now() + TTL_SECONDS * 1000 });
}

export async function getPendingOrder(orderRef: string): Promise<PendingEwayOrder | null> {
  if (isRedisConfigured()) {
    const raw = await getRedis().get(`${PENDING_KEY}${orderRef}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PendingEwayOrder;
    } catch {
      return null;
    }
  }
  const entry = memoryStore.get(orderRef);
  if (!entry) return null;
  if (now() > entry.expiresAt) {
    memoryStore.delete(orderRef);
    return null;
  }
  return entry.data;
}

export async function deletePendingOrder(orderRef: string): Promise<void> {
  if (isRedisConfigured()) {
    await getRedis().del(`${PENDING_KEY}${orderRef}`);
    return;
  }
  memoryStore.delete(orderRef);
}

export async function claimTransactionOnce(transactionId: string): Promise<boolean> {
  const key = `${TXN_KEY}${transactionId}`;
  if (isRedisConfigured()) {
    const ok = await getRedis().set(key, "1", "EX", TXN_TTL_SECONDS, "NX");
    return ok === "OK";
  }
  if (memoryStore.has(key)) return false;
  memoryStore.set(key, {
    data: {} as PendingEwayOrder,
    expiresAt: now() + TXN_TTL_SECONDS * 1000,
  });
  return true;
}

