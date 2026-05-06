const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const Typesense = require("typesense");
const axios = require("axios");

function normalizeHost(raw) {
  return String(raw || "").replace(/^https?:\/\//, "").replace(/\/$/, "").trim();
}

function normalizeImage(value) {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  if (Array.isArray(value)) {
    const firstString = value.find((v) => typeof v === "string" && v.trim().length > 0);
    return firstString ? firstString.trim() : "";
  }
  if (typeof value === "object") {
    const candidates = [value.src, value.url, value.guid?.rendered];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate.trim();
      }
      if (Array.isArray(candidate)) {
        const nested = candidate.find((v) => typeof v === "string" && v.trim().length > 0);
        if (nested) return nested.trim();
      }
    }
  }
  return "";
}

function normalizeDocument(doc) {
  return {
    ...doc,
    image: normalizeImage(doc?.image),
  };
}

const host = normalizeHost(
  process.env.TYPESENSE_HOST || process.env.NEXT_PUBLIC_TYPESENSE_HOST || ""
);
const keyCandidates = [
  { name: "TYPESENSE_ADMIN_API_KEY", value: process.env.TYPESENSE_ADMIN_API_KEY },
  { name: "TYPESENSE_API_KEY", value: process.env.TYPESENSE_API_KEY },
  { name: "NEXT_PUBLIC_TYPESENSE_API_KEY", value: process.env.NEXT_PUBLIC_TYPESENSE_API_KEY },
]
  .map((k) => ({ ...k, value: String(k.value || "").trim() }))
  .filter((k) => k.value);
const collection = String(
  process.env.TYPESENSE_COLLECTION ||
    process.env.NEXT_PUBLIC_TYPESENSE_COLLECTION ||
    process.env.NEXT_PUBLIC_TYPESENSE_INDEX_NAME ||
    "products_updated"
).trim();
const feedUrl = String(
  process.env.TYPESENSE_FEED_URL ||
    "https://live.joyamedicalsupplies.com.au/wp-json/custom/v1/typesense-products"
).trim();

if (!host || keyCandidates.length === 0 || !feedUrl) {
  console.error(
    "Missing env for sync-products.js. Required: TYPESENSE_HOST, TYPESENSE_API_KEY/TYPESENSE_ADMIN_API_KEY, TYPESENSE_FEED_URL (optional)."
  );
  process.exit(1);
}

async function resolveWorkingApiKey() {
  if (!host || keyCandidates.length === 0) return null;
  for (const candidate of keyCandidates) {
    const client = new Typesense.Client({
      nodes: [{ host, port: "443", protocol: "https" }],
      apiKey: candidate.value,
      connectionTimeoutSeconds: 15,
    });
    try {
      await client.collections().retrieve();
      return candidate;
    } catch (_e) {
      // Continue trying the next key.
    }
  }
  return null;
}

async function sync() {
  const workingKey = await resolveWorkingApiKey();
  if (!workingKey) {
    throw new Error(
      "No valid Typesense API key found. Check TYPESENSE_ADMIN_API_KEY / TYPESENSE_API_KEY / NEXT_PUBLIC_TYPESENSE_API_KEY."
    );
  }
  const client = new Typesense.Client({
    nodes: [{ host, port: "443", protocol: "https" }],
    apiKey: workingKey.value,
    connectionTimeoutSeconds: 30,
  });

  const { data } = await axios.get(feedUrl);
  if (!Array.isArray(data)) {
    throw new Error("Typesense feed did not return an array.");
  }

  const docs = data.map(normalizeDocument);
  const res = await client.collections(collection).documents().import(docs, { action: "upsert" });
  console.log(`Synced ${docs.length} docs to ${collection}.`);
  console.log(`Authenticated using: ${workingKey.name}`);
  console.log(res);
}

sync().catch((e) => {
  console.error("Sync failed:", e?.message || e);
  process.exit(1);
});