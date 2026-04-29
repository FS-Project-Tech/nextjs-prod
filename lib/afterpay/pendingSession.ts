import "server-only";

const PREFIX = "afterpay:pending:";
const ORDER_FOR_TOKEN_PREFIX = "afterpay:order_token:";
const TTL_SEC = 30 * 60;
const ORDER_INDEX_TTL_SEC = 7 * 24 * 60 * 60;

function memoryKv(): Map<string, { value: string; exp: number }> {
  const g = globalThis as unknown as { __afterpayMem?: Map<string, { value: string; exp: number }> };
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

export async function savePendingCheckoutPayload(
  merchantReference: string,
  payloadJson: string,
): Promise<void> {
  const key = `${PREFIX}${merchantReference}`;
  const mem = memoryKv();
  const exp = Date.now() + TTL_SEC * 1000;
  mem.set(key, { value: payloadJson, exp });
  touchExpiry(key, TTL_SEC);
}

export async function getPendingCheckoutPayload(merchantReference: string): Promise<string | null> {
  const key = `${PREFIX}${merchantReference}`;
  const mem = memoryKv();
  const row = mem.get(key);
  if (!row || row.exp < Date.now()) {
    if (row) mem.delete(key);
    return null;
  }
  return row.value;
}

export async function deletePendingCheckoutPayload(merchantReference: string): Promise<void> {
  const key = `${PREFIX}${merchantReference}`;
  memoryKv().delete(key);
}

/** Idempotent confirm: remember Woo order id for an Afterpay order token. */
export async function rememberOrderForAfterpayToken(token: string, orderId: string): Promise<void> {
  const key = `${ORDER_FOR_TOKEN_PREFIX}${token}`;
  const mem = memoryKv();
  mem.set(key, {
    value: orderId,
    exp: Date.now() + ORDER_INDEX_TTL_SEC * 1000,
  });
  touchExpiry(key, ORDER_INDEX_TTL_SEC);
}

export async function getOrderIdForAfterpayToken(token: string): Promise<string | null> {
  const key = `${ORDER_FOR_TOKEN_PREFIX}${token}`;
  const mem = memoryKv();
  const row = mem.get(key);
  if (!row || row.exp < Date.now()) return null;
  return row.value;
}
