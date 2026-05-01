import { NextResponse } from "next/server";

/**
 * In-memory idempotency for POST /api/checkout.
 * Same Idempotency-Key → same successful response (no second Woo order).
 * Multi-instance: replace with Redis; see {@link getIdempotencyTtlMs}.
 */

const GLOBAL_KEY = "__checkoutPostIdempotencyStore";

type ResponseSnapshot = {
  status: number;
  body: string;
  headers: [string, string][];
};

type CompletedEntry = {
  snapshot: ResponseSnapshot;
  expiresAt: number;
};

type Store = {
  inflight: Map<string, Promise<ResponseSnapshot>>;
  completed: Map<string, CompletedEntry>;
};

function getStore(): Store {
  const g = globalThis as unknown as Record<string, Store | undefined>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      inflight: new Map(),
      completed: new Map(),
    };
  }
  return g[GLOBAL_KEY]!;
}

function getIdempotencyTtlMs(): number {
  const n = Number(process.env.CHECKOUT_IDEMPOTENCY_CACHE_MS);
  if (Number.isFinite(n) && n > 0) return Math.min(n, 86_400_000);
  return 86_400_000;
}

function getMaxCompletedEntries(): number {
  const n = Number(process.env.CHECKOUT_IDEMPOTENCY_MAX_ENTRIES);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100_000) : 5000;
}

function normalizeIdempotencyKey(raw: string | null | undefined): string | null {
  const k = String(raw || "").trim();
  if (k.length < 8) return null;
  if (k.length > 256) return k.slice(0, 256);
  return k;
}

function shouldCacheSuccessfulCheckout(snapshot: ResponseSnapshot): boolean {
  if (snapshot.status !== 200) return false;
  try {
    const j = JSON.parse(snapshot.body) as { success?: unknown };
    return j.success === true || j.success === "true";
  } catch {
    return false;
  }
}

async function snapshotNextResponse(res: NextResponse): Promise<ResponseSnapshot> {
  const body = await res.clone().text();
  const headers: [string, string][] = [];
  res.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      lower === "content-length" ||
      lower === "transfer-encoding" ||
      lower === "connection"
    ) {
      return;
    }
    headers.push([key, value]);
  });
  return { status: res.status, body, headers };
}

function responseFromSnapshot(s: ResponseSnapshot): NextResponse {
  const h = new Headers();
  for (const [k, v] of s.headers) {
    h.set(k, v);
  }
  return new NextResponse(s.body, { status: s.status, headers: h });
}

function pruneCompleted(store: Store): void {
  const now = Date.now();
  const max = getMaxCompletedEntries();
  for (const [k, v] of store.completed) {
    if (v.expiresAt < now) store.completed.delete(k);
  }
  while (store.completed.size > max) {
    const first = store.completed.keys().next().value as string | undefined;
    if (first == null) break;
    store.completed.delete(first);
  }
}

/**
 * Runs checkout once per idempotency key; concurrent duplicate requests await the same work.
 * Replays cached body for repeat requests within TTL after a successful checkout.
 */
export async function runCheckoutWithIdempotency(
  idempotencyKey: string | null | undefined,
  run: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const key = normalizeIdempotencyKey(idempotencyKey ?? null);
  if (!key) {
    return run();
  }

  const store = getStore();
  pruneCompleted(store);

  const cached = store.completed.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    console.log("[checkout] idempotency cache hit", { keyPrefix: key.slice(0, 8) + "…" });
    return responseFromSnapshot(cached.snapshot);
  }
  if (cached) {
    store.completed.delete(key);
  }

  const existing = store.inflight.get(key);
  if (existing) {
    console.log("[checkout] idempotency coalesced (in-flight)", { keyPrefix: key.slice(0, 8) + "…" });
    const snapshot = await existing;
    return responseFromSnapshot(snapshot);
  }

  let resolve!: (value: ResponseSnapshot) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<ResponseSnapshot>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  store.inflight.set(key, promise);

  void (async () => {
    try {
      const res = await run();
      const snapshot = await snapshotNextResponse(res);
      if (shouldCacheSuccessfulCheckout(snapshot)) {
        store.completed.set(key, {
          snapshot,
          expiresAt: Date.now() + getIdempotencyTtlMs(),
        });
        console.log("[checkout] idempotency stored success", { keyPrefix: key.slice(0, 8) + "…" });
      }
      resolve(snapshot);
    } catch (e) {
      reject(e);
    } finally {
      store.inflight.delete(key);
    }
  })();

  const snapshot = await promise;
  return responseFromSnapshot(snapshot);
}
