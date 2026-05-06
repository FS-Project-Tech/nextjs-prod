/**
 * Upsert Typesense synonym sets (v30+) with fallback to legacy collection synonyms.
 *
 * Env:
 *   TYPESENSE_HOST or NEXT_PUBLIC_TYPESENSE_HOST      (host only, no protocol)
 *   TYPESENSE_API_KEY or NEXT_PUBLIC_TYPESENSE_API_KEY
 *   NEXT_PUBLIC_TYPESENSE_COLLECTION or TYPESENSE_COLLECTION or NEXT_PUBLIC_TYPESENSE_INDEX_NAME
 *
 * Run:
 *   node scripts/typesense-synonyms.js
 */
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const Typesense = require("typesense");

function readHost() {
  const raw = (
    process.env.TYPESENSE_HOST ||
    process.env.NEXT_PUBLIC_TYPESENSE_HOST ||
    ""
  ).trim();
  if (!raw) return "";
  // Accept accidental protocol in env; normalize to host only.
  return raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

const host = readHost();
const apiKey = (
  process.env.TYPESENSE_API_KEY ||
  process.env.NEXT_PUBLIC_TYPESENSE_API_KEY ||
  ""
).trim();
const collection =
  (process.env.NEXT_PUBLIC_TYPESENSE_COLLECTION ||
    process.env.TYPESENSE_COLLECTION ||
    process.env.NEXT_PUBLIC_TYPESENSE_INDEX_NAME ||
    "products_updated").trim();

if (!host || !apiKey) {
  console.error(
    "Missing Typesense host or API key in .env. Expected TYPESENSE_HOST/NEXT_PUBLIC_TYPESENSE_HOST and TYPESENSE_API_KEY/NEXT_PUBLIC_TYPESENSE_API_KEY."
  );
  process.exit(1);
}

const client = new Typesense.Client({
  nodes: [{ host, port: "443", protocol: "https" }],
  apiKey,
  connectionTimeoutSeconds: 30,
});

const DEFAULT_SYNONYMS = [
  { id: "diaper", synonyms: ["nappy"] },
  { id: "underpad", synonyms: ["bed pad"] },
  { id: "micro-touch", synonyms: ["micro touch", "micro-touch", "microtouch"] },
];

function slugId(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqStrings(values) {
  return [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))];
}

function normalizeSynonymRow(row) {
  if (!row || typeof row !== "object") return null;
  const baseId = slugId(row.id || row.root || row.key);
  const synonyms = uniqStrings(Array.isArray(row.synonyms) ? row.synonyms : []);
  if (!baseId || synonyms.length === 0) return null;
  return { id: baseId, synonyms };
}

function readSynonymsFromEnvJson() {
  const raw = (process.env.TYPESENSE_SYNONYMS_JSON || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn("[typesense] TYPESENSE_SYNONYMS_JSON is not an array; ignoring.");
      return [];
    }
    return parsed.map(normalizeSynonymRow).filter(Boolean);
  } catch (e) {
    console.warn("[typesense] Invalid TYPESENSE_SYNONYMS_JSON; ignoring.", e.message);
    return [];
  }
}

function readSynonymsFromFile() {
  const fileFromEnv = (process.env.TYPESENSE_SYNONYMS_FILE || "").trim();
  const defaultFile = path.join(__dirname, "typesense-synonyms.dynamic.json");
  const file = fileFromEnv
    ? path.isAbsolute(fileFromEnv)
      ? fileFromEnv
      : path.join(__dirname, "..", fileFromEnv)
    : defaultFile;
  if (!fs.existsSync(file)) return [];
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn(`[typesense] Synonym file is not an array: ${file}`);
      return [];
    }
    return parsed.map(normalizeSynonymRow).filter(Boolean);
  } catch (e) {
    console.warn(`[typesense] Failed reading synonym file: ${file}`, e.message);
    return [];
  }
}

function mergeSynonymRows(rows) {
  const byId = new Map();
  for (const row of rows) {
    if (!row) continue;
    const current = byId.get(row.id) || [];
    byId.set(row.id, uniqStrings([...current, ...row.synonyms]));
  }
  return [...byId.entries()].map(([id, synonyms]) => ({ id, synonyms }));
}

const SYNONYMS = mergeSynonymRows([
  ...DEFAULT_SYNONYMS.map(normalizeSynonymRow).filter(Boolean),
  ...readSynonymsFromFile(),
  ...readSynonymsFromEnvJson(),
]);

if (SYNONYMS.length === 0) {
  console.warn("[typesense] No synonym rows resolved; nothing to upsert.");
}

async function ensureCollectionExists() {
  try {
    await client.collections(collection).retrieve();
    return true;
  } catch (err) {
    const status = Number(err && err.httpStatus);
    if (status === 404) {
      console.error(
        `Collection "${collection}" not found. Set NEXT_PUBLIC_TYPESENSE_COLLECTION/TYPESENSE_COLLECTION correctly.`
      );
      return false;
    }
    throw err;
  }
}

async function upsertV30SynonymSets() {
  for (const row of SYNONYMS) {
    await client.synonymSets().upsert(row.id, {
      synonyms: row.synonyms,
      root: row.synonyms[0],
      locale: "en",
    });
    console.log("Upserted synonym_set:", row.id, row.synonyms);
  }
}

async function upsertLegacyCollectionSynonyms() {
  for (const row of SYNONYMS) {
    await client.collections(collection).synonyms().upsert(row.id, {
      synonyms: row.synonyms,
    });
    console.log("Upserted legacy synonym:", row.id, row.synonyms);
  }
}

async function main() {
  const ok = await ensureCollectionExists();
  if (!ok) process.exit(1);

  try {
    await upsertV30SynonymSets();
    console.log("Done. (synonym_sets)");
    return;
  } catch (err) {
    const status = Number(err && err.httpStatus);
    const msg = String((err && err.message) || "");
    const mayNeedLegacy =
      status === 404 || msg.toLowerCase().includes("synonym_sets");
    if (!mayNeedLegacy) throw err;
    console.warn(
      "[typesense] synonym_sets API not available on this server; falling back to legacy collection synonyms."
    );
  }

  await upsertLegacyCollectionSynonyms();
  console.log("Done. (legacy collection synonyms)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

