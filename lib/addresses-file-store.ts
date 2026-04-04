/**
 * File-based persistence for user addresses when WordPress is not available.
 * Survives server restart and works across multiple server instances (same disk).
 * Uses an absolute path so read/write use the same location after refresh.
 */

import fs from "fs";
import path from "path";

const DATA_DIR = "data";
const ADDRESSES_DIR = "addresses";

export interface AddressesFileData {
  addresses: Record<string, unknown>[];
  deletedIds: string[];
}

/** Single canonical base dir (absolute) so refresh and POST/GET use the same path */
function getDataDir(): string {
  if (process.env.ADDRESSES_DATA_DIR) {
    return path.resolve(process.env.ADDRESSES_DATA_DIR);
  }
  const base = typeof process.cwd === "function" ? process.cwd() : process.env.PWD || ".";
  return path.resolve(base, DATA_DIR, ADDRESSES_DIR);
}

function getFilePath(userId: string): string {
  const safeId = String(userId).replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(getDataDir(), `${safeId}.json`);
}

function ensureDir(filePath: string): boolean {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Load addresses and deleted IDs for a user from file. Returns null if not found or error.
 */
export function loadFromFile(userId: string): AddressesFileData | null {
  if (typeof window !== "undefined") return null;
  try {
    const filePath = getFilePath(userId);
    const exists = fs.existsSync(filePath);
    if (process.env.NODE_ENV === "development") {
      console.log(
        "[addresses-file-store] loadFromFile userId:",
        userId,
        "path:",
        filePath,
        "exists:",
        exists
      );
    }
    if (!exists) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw) as AddressesFileData;
    if (!data || typeof data !== "object") return null;
    const out = {
      addresses: Array.isArray(data.addresses) ? data.addresses : [],
      deletedIds: Array.isArray(data.deletedIds) ? data.deletedIds : [],
    };
    if (process.env.NODE_ENV === "development") {
      console.log("[addresses-file-store] loadFromFile ok addresses:", out.addresses.length);
    }
    return out;
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[addresses-file-store] loadFromFile failed:", (err as Error)?.message ?? err);
    }
    return null;
  }
}

/**
 * Save addresses and deleted IDs for a user to file. No-op on error (e.g. read-only fs).
 */
export function saveToFile(userId: string, data: AddressesFileData): void {
  if (typeof window !== "undefined") return;
  try {
    const filePath = getFilePath(userId);
    if (!ensureDir(filePath)) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[addresses-file-store] Could not create dir:", path.dirname(filePath));
      }
      return;
    }
    const json = JSON.stringify(
      {
        addresses: data.addresses,
        deletedIds: data.deletedIds,
      },
      null,
      0
    );
    fs.writeFileSync(filePath, json, "utf8");
    if (process.env.NODE_ENV === "development") {
      console.log(
        "[addresses-file-store] saveToFile ok userId:",
        userId,
        "path:",
        filePath,
        "addresses:",
        data.addresses?.length ?? 0
      );
    }
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[addresses-file-store] saveToFile failed:",
        (err as Error)?.message ?? err,
        "path:",
        getFilePath(userId)
      );
    }
  }
}
