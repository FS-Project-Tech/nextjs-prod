/** Session lock written when user clicks Place Order (safeguards only; does not change checkout APIs). */

export const CHECKOUT_ACTIVE_SUBMIT_KEY = "checkout_active_submit";
export const CHECKOUT_SUBMIT_TIME_KEY = "checkout_submit_time";

const SUBMIT_BLOCK_MS = 30_000;
const RECOVERY_WINDOW_MS = 2 * 60_000;

export function clearCheckoutSubmitLock(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(CHECKOUT_ACTIVE_SUBMIT_KEY);
    sessionStorage.removeItem(CHECKOUT_SUBMIT_TIME_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * On successful submit start: store submitId (used as requestId in logs) and timestamp.
 */
export function writeCheckoutSubmitLock(submitId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(CHECKOUT_ACTIVE_SUBMIT_KEY, submitId);
    sessionStorage.setItem(CHECKOUT_SUBMIT_TIME_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function readCheckoutSubmitAgeMs(): number | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CHECKOUT_SUBMIT_TIME_KEY);
    if (!raw) return null;
    const t = Number(raw);
    if (!Number.isFinite(t)) return null;
    return Date.now() - t;
  } catch {
    return null;
  }
}

/** True if a submit lock exists and is younger than {@link RECOVERY_WINDOW_MS} (recovery banner / last-status). */
export function hasRecentSubmitLockForRecovery(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const id = sessionStorage.getItem(CHECKOUT_ACTIVE_SUBMIT_KEY);
    if (!id?.trim()) return false;
    const age = readCheckoutSubmitAgeMs();
    if (age == null) return false;
    return age >= 0 && age < RECOVERY_WINDOW_MS;
  } catch {
    return false;
  }
}

/**
 * Block rapid repeat submits (double-click) when the same tab recently started a submit.
 */
export function shouldBlockSubmitDueToRecentLock(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const id = sessionStorage.getItem(CHECKOUT_ACTIVE_SUBMIT_KEY);
    if (!id?.trim()) return false;
    const age = readCheckoutSubmitAgeMs();
    if (age == null) return false;
    return age >= 0 && age < SUBMIT_BLOCK_MS;
  } catch {
    return false;
  }
}

/** Remove locks older than the recovery window (e.g. abandoned tab). */
export function cleanupStaleCheckoutSubmitLock(maxAgeMs: number = RECOVERY_WINDOW_MS): void {
  const age = readCheckoutSubmitAgeMs();
  if (age == null) return;
  if (age >= maxAgeMs) {
    clearCheckoutSubmitLock();
  }
}

export function readActiveSubmitId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const v = sessionStorage.getItem(CHECKOUT_ACTIVE_SUBMIT_KEY);
    return v?.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}
