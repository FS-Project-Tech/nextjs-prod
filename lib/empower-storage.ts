/**
 * Empower Campaign - Email Storage
 * Stores emails of users who join the Empower campaign.
 *
 * For WordPress backend: Add a custom REST endpoint that stores in wp_options.
 * For production with DB: Replace this with database storage.
 */

import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE_PATH = path.join(DATA_DIR, "empower-emails.json");

export interface EmpowerEntry {
  email: string;
  joinedAt: string; // ISO string
}

async function ensureDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // Ignore if already exists
  }
}

async function readEmails(): Promise<string[]> {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data.emails) ? data.emails : [];
  } catch {
    return [];
  }
}

async function writeEmails(emails: string[]): Promise<void> {
  await ensureDir();
  await fs.writeFile(
    FILE_PATH,
    JSON.stringify({ emails: [...new Set(emails)], updatedAt: new Date().toISOString() }, null, 2),
    "utf-8"
  );
}

/**
 * Add email to Empower campaign list (if not already present)
 */
export async function addEmpowerEmail(
  email: string
): Promise<{ success: boolean; alreadyJoined: boolean }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { success: false, alreadyJoined: false };

  const emails = await readEmails();
  const alreadyJoined = emails.includes(normalized);
  if (!alreadyJoined) {
    emails.push(normalized);
    await writeEmails(emails);
  }
  return { success: true, alreadyJoined };
}

/**
 * Check if email has joined the Empower campaign
 */
export async function hasJoinedEmpower(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const emails = await readEmails();
  return emails.includes(normalized);
}

/**
 * Get all Empower campaign emails (for admin/export)
 */
export async function getAllEmpowerEmails(): Promise<string[]> {
  return readEmails();
}
