"use server";

/**
 * WooCommerce Session Management
 * Handles WC session cookies for cart persistence and authenticated requests
 * This is a server-only module
 */

import { cookies } from "next/headers";
import { getWpBaseUrl } from "./wp-utils";
import { getErrorMessage } from "@/lib/utils/errors";

const WC_SESSION_COOKIE_NAME = "wc-session";
const WC_SESSION_MAX_AGE = 48 * 60 * 60; // 48 hours (WooCommerce default)

/**
 * Get WooCommerce session cookie
 */
export async function getWCSessionCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(WC_SESSION_COOKIE_NAME)?.value || null;
}

/**
 * Set WooCommerce session cookie
 * This cookie is used by WooCommerce to maintain cart state
 */
export async function setWCSessionCookie(sessionToken: string): Promise<void> {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";

  cookieStore.set(WC_SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: true, // Always secure (required for SameSite=None)
    sameSite: "none", // None for cross-site requests
    maxAge: WC_SESSION_MAX_AGE,
    path: "/",
  });
}

/**
 * Clear WooCommerce session cookie
 * Must use same settings as when setting cookie (for proper cross-site deletion)
 */
export async function clearWCSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  // Delete with same settings as when setting (for proper cross-site deletion)
  cookieStore.set(WC_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 0,
    path: "/",
  });
}

/**
 * Create or get WooCommerce session
 * This should be called after user login to establish WC session
 */
export async function createWCSession(customerId?: number): Promise<string | null> {
  try {
    const wpBase = getWpBaseUrl();
    if (!wpBase) {
      console.error("WordPress base URL not configured");
      return null;
    }

    // Use WooCommerce Store API to create session
    // Note: This requires WooCommerce Store API plugin or WooCommerce 3.5+
    const sessionUrl = customerId
      ? `${wpBase}/wp-json/wc/store/v1/sessions?customer_id=${customerId}`
      : `${wpBase}/wp-json/wc/store/v1/sessions`;

    const response = await fetch(sessionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      // Store API (wc/store/v1/sessions) may not exist on all WordPress sites;
      // WordPress returns "No route was found matching the URL and request method" in that case.
      // Session will be created automatically on first cart operation. Do not surface this to the user.
      if (process.env.NODE_ENV === "development") {
        console.debug(
          "WooCommerce Store API session not available, using cart-based session instead"
        );
      }
      return null;
    }

    let data: { token?: string; session_token?: string } = {};
    try {
      data = await response.json();
    } catch {
      return null;
    }
    const sessionToken = data?.token || data?.session_token || null;

    if (sessionToken) {
      await setWCSessionCookie(sessionToken);
      return sessionToken;
    }

    return null;
  } catch (error: unknown) {
    // Only log in development - session will be created automatically on first cart operation
    if (process.env.NODE_ENV === "development") {
      console.debug("WooCommerce session creation skipped:", getErrorMessage(error));
    }
    return null;
  }
}

/**
 * Get WooCommerce session headers for API requests
 * This should be included in all WooCommerce API requests that need session context
 */
export async function getWCSessionHeaders(): Promise<Record<string, string>> {
  const sessionToken = await getWCSessionCookie();

  if (!sessionToken) {
    return {};
  }

  return {
    "X-WC-Session": sessionToken,
  };
}

/**
 * Sync WooCommerce session after login
 * Call this after successful authentication to establish WC session
 */
export async function syncWCSessionAfterLogin(customerId?: number): Promise<void> {
  try {
    // Create WC session for the logged-in customer
    await createWCSession(customerId);
  } catch {
    // Silent fail - session will be created automatically on first cart operation
    // This is expected behavior for WooCommerce installations without Store API
  }
}
