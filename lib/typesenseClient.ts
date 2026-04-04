import Typesense from "typesense";
import { timingSafeEqualUtf8 } from "@/lib/timing-safe";

type TypesenseClientInstance = InstanceType<typeof Typesense.Client>;

function normalizeHost(raw: string): string {
  return raw
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .trim();
}

/**
 * Typesense client for server-side search (API routes).
 * Env:
 * - NEXT_PUBLIC_TYPESENSE_HOST (or TYPESENSE_HOST) — host only, e.g. xxx.typesense.net
 * - NEXT_PUBLIC_TYPESENSE_API_KEY or TYPESENSE_API_KEY (search-only key recommended)
 * - NEXT_PUBLIC_TYPESENSE_COLLECTION — default "products"
 * - NEXT_PUBLIC_TYPESENSE_PROTOCOL — default "https"
 * - NEXT_PUBLIC_TYPESENSE_PORT — default "443"
 */
export function createTypesenseClient(): TypesenseClientInstance {
  const host = normalizeHost(
    process.env.TYPESENSE_HOST || process.env.NEXT_PUBLIC_TYPESENSE_HOST || ""
  );
  const apiKey = process.env.TYPESENSE_API_KEY || process.env.NEXT_PUBLIC_TYPESENSE_API_KEY || "";
  const publicKey = (process.env.NEXT_PUBLIC_TYPESENSE_API_KEY || "").trim();
  const adminKey = (process.env.TYPESENSE_ADMIN_API_KEY || "").trim();
  if (
    process.env.NODE_ENV === "production" &&
    publicKey &&
    adminKey &&
    timingSafeEqualUtf8(publicKey, adminKey)
  ) {
    throw new Error(
      "NEXT_PUBLIC_TYPESENSE_API_KEY must be a search-only key, not the admin API key."
    );
  }
  const protocol =
    process.env.NEXT_PUBLIC_TYPESENSE_PROTOCOL || process.env.TYPESENSE_PROTOCOL || "https";
  const portRaw = process.env.NEXT_PUBLIC_TYPESENSE_PORT || process.env.TYPESENSE_PORT || "443";
  const portNum = parseInt(String(portRaw), 10);
  const port = Number.isFinite(portNum) ? portNum : 443;

  if (!host || !apiKey) {
    throw new Error(
      "Typesense is not configured. Set TYPESENSE_HOST and TYPESENSE_API_KEY (or NEXT_PUBLIC_*)."
    );
  }

  return new Typesense.Client({
    nodes: [{ host, port, protocol }],
    apiKey,
    connectionTimeoutSeconds: 10,
  });
}

let cached: TypesenseClientInstance | null = null;

export function getTypesenseClient(): TypesenseClientInstance {
  if (!cached) cached = createTypesenseClient();
  return cached;
}

export function getTypesenseCollectionName(): string {
  return (
    process.env.NEXT_PUBLIC_TYPESENSE_COLLECTION ||
    process.env.NEXT_PUBLIC_TYPESENSE_INDEX_NAME ||
    process.env.TYPESENSE_COLLECTION ||
    "products"
  );
}

export function isTypesenseConfigured(): boolean {
  const host = normalizeHost(
    process.env.TYPESENSE_HOST || process.env.NEXT_PUBLIC_TYPESENSE_HOST || ""
  );
  const key = process.env.TYPESENSE_API_KEY || process.env.NEXT_PUBLIC_TYPESENSE_API_KEY || "";
  return Boolean(host && key);
}
