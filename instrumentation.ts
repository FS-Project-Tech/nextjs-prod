/**
 * Node.js runtime bootstrap (not Edge). Registers distributed rate-limit backend (Upstash + optional TCP Redis).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  await import("@/lib/rate-limit-backend");
}
